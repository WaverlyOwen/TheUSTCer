"use strict";

import './styles/styles.css';
import './styles/menu.css';
import './styles/background.css';
import './styles/ending.css';

import { placementsByLetter } from './core/letters.js';
import { generatePuzzle } from './core/generator.js';
import { MAX_GPA_TEXT, gpaTextForLevel, sizeForLevel } from './core/level.js';
import {
    CHALLENGE_DIFFICULTIES,
    MODE_CHALLENGE,
    MODE_CLASSIC,
    MODE_TIMED,
    challengeGenerationOptions,
    challengeSession,
    formatDuration,
    loadChallengeConfig,
    loadClassicRun,
    loadTimedDuration,
    loadUnlocks,
    normalizeChallengeConfig,
    resetClassicRun,
    resetUnlocks,
    saveChallengeConfig,
    saveClassicRun,
    saveTimedDuration,
    saveUnlocks,
    timedSession,
    unlocksForLevel,
} from './core/game-state.js';
import { Path } from './core/path.js';
import { checkSolution } from './core/validator.js';
import { attachDebugGlobals, createDebugApi } from './debug/api.js';
import { attachKeyboard } from './input/keyboard.js';
import { attachPointer } from './input/pointer.js';
import { createMobileControls, isMobileDevice } from './input/touch.js';
import { load, remove, save } from './lib/storage.js';
import { getThemeColors } from './lib/random.js';
import { BoardView } from './render/board.js';
import { initBackground } from './ui/background.js';
import { playEnding, playMilestoneCelebration, showReplayButton } from './ui/ending.js';
import { createHud } from './ui/hud.js';
import { createLoadingOverlay } from './ui/loading.js';
import { setupMenu } from './ui/menu.js';
import { setupModeMenu } from './ui/mode-menu.js';

const WIN_TRANSITION_MS = 900;
const HUD_TICK_MS = 250;
const ENDING_SEEN_KEY = 'endingSeen';
const LEGACY_LEVEL_KEY = 'level';

function waitForPaint() {
    return new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
}

function clueSummary(config) {
    return [
        config.letters ? '字母' : null,
        config.colleges ? '书院' : null,
        config.pairs ? '组别' : null,
        config.roads ? '路名' : null,
    ].filter(Boolean).join(' · ');
}

function challengeNote(config) {
    const byLetter = placementsByLetter([config.width, config.height]);
    if (config.letters && !byLetter.some((placements) => placements.length)) {
        return '当前尺寸放不下 4×5 字母，这局会自动退回普通题。';
    }
    if (config.letters && config.width * config.height > 484) {
        return '棋盘超过 22×22 时字母会自动关闭（生成太慢且字母占比过小）。';
    }
    if (config.difficulty === 'hard') {
        return '高压会更严格压缩留白，并扩大双字母和致密路径的出现机会。';
    }
    return '难度越高，越会抬高局部覆盖和路径密度要求。';
}

async function startGame() {
    const params = new URLSearchParams(location.search);
    const debugLevel = params.has('level') ? parseInt(params.get('level'), 10) : null;
    const persistClassic = debugLevel === null;

    let currentMode = MODE_CLASSIC;
    let classicRun = persistClassic
        ? loadClassicRun()
        : {
            level: Number.isInteger(debugLevel) ? Math.max(0, debugLevel) : 0,
            startedAt: Date.now(),
            finishedAt: null,
            pausedMs: 0,
        };
    let unlocks = loadUnlocks();
    const earnedUnlocks = unlocksForLevel(classicRun.level);
    unlocks = {
        timed: unlocks.timed || earnedUnlocks.timed,
        challenge: unlocks.challenge || earnedUnlocks.challenge,
    };
    if (persistClassic) {
        saveUnlocks(unlocks);
    }

    let timedDuration = loadTimedDuration();
    let challengeConfig = loadChallengeConfig();
    let timedRun = null;
    let challengeRun = null;

    const hud = createHud();
    const loading = createLoadingOverlay();

    let board = null;
    let userPath = null;
    let puzzle = null;
    let detachPointer = null;
    let swipeDetector = null;
    let modeMenu = null;
    let transitionBusy = false;
    let generating = false;
    let generationTicket = 0;
    let resizeTimer = null;

    function saveClassic() {
        if (persistClassic) {
            saveClassicRun(classicRun);
        }
    }

    function saveModeUnlocks() {
        if (persistClassic) {
            saveUnlocks(unlocks);
        }
    }

    function classicCompleted() {
        return gpaTextForLevel(classicRun.level) === MAX_GPA_TEXT;
    }

    function classicElapsedMs(now = Date.now()) {
        const end = classicRun.finishedAt ?? now;
        return Math.max(0, end - classicRun.startedAt - (classicRun.pausedMs ?? 0));
    }

    // 计时暂停：菜单/加载/庆祝动画等"非游玩"时段不计入用时与倒计时。
    // 引用计数，允许嵌套；恢复时把这段时长补给经典 pausedMs、并顺延计时模式 startedAt。
    let pauseDepth = 0;
    let pauseStartedAt = 0;

    function pushPause() {
        if (pauseDepth++ === 0) {
            pauseStartedAt = Date.now();
        }
    }

    function popPause() {
        if (pauseDepth === 0) {
            return;
        }
        if (--pauseDepth === 0) {
            const delta = Date.now() - pauseStartedAt;
            if (delta > 0) {
                classicRun.pausedMs = (classicRun.pausedMs ?? 0) + delta;
                saveClassic();
                if (timedRun && !timedRun.ended) {
                    timedRun.startedAt += delta;
                }
            }
            renderHud();
        }
    }

    function timedRemainingMs(now = Date.now()) {
        if (!timedRun) {
            return timedDuration * 60_000;
        }
        return Math.max(0, timedRun.startedAt + timedRun.durationMinutes * 60_000 - now);
    }

    function currentLevelValue() {
        switch (currentMode) {
            case MODE_TIMED:
                return timedRun?.level ?? 0;
            case MODE_CHALLENGE:
                return challengeRun?.solved ?? 0;
            case MODE_CLASSIC:
            default:
                return classicRun.level;
        }
    }

    function currentSize() {
        if (currentMode === MODE_CHALLENGE) {
            const config = challengeRun?.config ?? challengeConfig;
            return [config.width, config.height];
        }
        return sizeForLevel(currentLevelValue());
    }

    function currentGenerationOptions() {
        if (currentMode === MODE_CHALLENGE) {
            return challengeGenerationOptions(challengeRun?.config ?? challengeConfig);
        }
        return {};
    }

    function currentDifficultyLabel() {
        const config = challengeRun?.config ?? challengeConfig;
        return CHALLENGE_DIFFICULTIES[config.difficulty].label;
    }

    function shouldShowLoading() {
        const [width, height] = currentSize();
        return currentMode === MODE_CHALLENGE || width * height >= 100;
    }

    function loadingMessage() {
        switch (currentMode) {
            case MODE_TIMED:
                return '正在安排下一题...';
            case MODE_CHALLENGE:
                return '正在定制挑战题面...';
            case MODE_CLASSIC:
            default:
                return '正在安排新学期...';
        }
    }

    function buildPuzzle() {
        return generatePuzzle(currentSize(), currentLevelValue(), currentGenerationOptions());
    }

    function syncUserLine(partial = null) {
        board?.updateUserLine(userPath.queue, partial);
    }

    function blockForExpiredTimer() {
        if (currentMode === MODE_TIMED && timedRun && !timedRun.ended && timedRemainingMs() <= 0) {
            void maybeEndTimedRun();
            return true;
        }
        return false;
    }

    function isInteractionBlocked() {
        return transitionBusy ||
            generating ||
            classicCompleted() && currentMode === MODE_CLASSIC ||
            currentMode === MODE_TIMED && Boolean(timedRun?.ended);
    }

    function refreshPanels() {
        renderHud();
        modeMenu?.refresh();
    }

    function renderHud() {
        let primary = '';
        let meta = '';
        let status = '';

        switch (currentMode) {
            case MODE_TIMED: {
                const cleared = timedRun?.ended ? timedRun.finalCleared ?? timedRun.cleared : timedRun?.cleared ?? 0;
                primary = timedRun?.ended
                    ? `计时结束 · ${cleared} 关`
                    : `计时模式 · ${formatDuration(timedRemainingMs(), false)}`;
                meta = `已过 ${cleared} 关 · 当前 GPA ${gpaTextForLevel(timedRun?.level ?? 0)}`;
                status = timedRun?.ended
                    ? '打开模式菜单可以马上再来一轮'
                    : `本轮时长 ${timedRun?.durationMinutes ?? timedDuration} 分钟`;
                break;
            }
            case MODE_CHALLENGE: {
                const config = challengeRun?.config ?? challengeConfig;
                primary = `挑战模式 · ${config.width}×${config.height}`;
                meta = `${currentDifficultyLabel()} · 已解 ${challengeRun?.solved ?? 0} 题`;
                status = clueSummary(config);
                break;
            }
            case MODE_CLASSIC:
            default: {
                // 经典模式界面留白：标题下只保留大号 GPA，其余信息在模式菜单里看
                primary = `GPA ${gpaTextForLevel(classicRun.level)}`;
                break;
            }
        }

        hud.render({ primary, meta, status });
    }

    function buildModeMenuState() {
        const classicSummary = classicCompleted()
            ? `已通关，最终 GPA 4.30，用时 ${formatDuration(classicElapsedMs())}`
            : `当前 GPA ${gpaTextForLevel(classicRun.level)} · 用时 ${formatDuration(classicElapsedMs(), false)}`;
        const timedSummary = timedRun
            ? timedRun.ended
                ? `本轮结束，共过 ${timedRun.finalCleared ?? timedRun.cleared} 关`
                : `倒计时 ${formatDuration(timedRemainingMs(), false)} · 已过 ${timedRun.cleared} 关`
            : '选择时长，看看你最多能冲到多少关';
        const challengeSummary = challengeRun
            ? `当前规格 ${challengeRun.config.width}×${challengeRun.config.height} · 已解 ${challengeRun.solved} 题`
            : '自由设定棋盘、题型和质控强度';

        return {
            currentMode,
            unlocks,
            classic: {
                summary: classicSummary,
            },
            timed: {
                durationMinutes: timedDuration,
                summary: timedSummary,
            },
            challenge: {
                config: challengeConfig,
                summary: challengeSummary,
                note: challengeNote(challengeConfig),
            },
        };
    }

    function lowerDifficultyForHint() {
        switch (currentMode) {
            case MODE_TIMED:
                if (timedRun && timedRun.level > 0) {
                    timedRun.level--;
                }
                break;
            case MODE_CLASSIC:
                if (classicRun.level > 0) {
                    classicRun.level--;
                    classicRun.finishedAt = null;
                    saveClassic();
                }
                break;
            case MODE_CHALLENGE:
            default:
                break;
        }
    }

    function grantUnlocks() {
        const unlockedNow = unlocksForLevel(classicRun.level);
        const newlyUnlocked = [];
        for (const key of ['timed', 'challenge']) {
            if (unlockedNow[key] && !unlocks[key]) {
                unlocks[key] = true;
                newlyUnlocked.push(key);
            }
        }
        if (newlyUnlocked.length) {
            saveModeUnlocks();
        }
        return newlyUnlocked;
    }

    async function playUnlockCelebrations(keys) {
        if (!keys.length) {
            return;
        }
        pushPause();
        try {
            await runUnlockCelebrations(keys);
        } finally {
            popPause();
        }
    }

    async function runUnlockCelebrations(keys) {
        for (const key of keys) {
            if (key === 'timed') {
                await playMilestoneCelebration({
                    title: 'GPA 3.00',
                    subtitle: '恭喜上 3，计时模式已解锁',
                    detail: '现在可以选 10 / 20 / 30 / 45 分钟，看看自己能刷多高。',
                    accent: 'teal',
                });
            } else if (key === 'challenge') {
                await playMilestoneCelebration({
                    title: 'GPA 3.70',
                    subtitle: '恭喜拿到 A-，挑战模式已解锁',
                    detail: '40% 优秀率到手，现在可以自订棋盘尺寸、题型和质控强度。',
                    accent: 'rose',
                });
            }
        }
    }

    async function maybeEndTimedRun() {
        if (currentMode !== MODE_TIMED || !timedRun || timedRun.ended || transitionBusy || generating) {
            return;
        }
        if (timedRemainingMs() > 0) {
            return;
        }
        timedRun.ended = true;
        timedRun.finalCleared = timedRun.cleared;
        transitionBusy = true;
        refreshPanels();
        await playMilestoneCelebration({
            title: '时间到',
            subtitle: `本轮共过 ${timedRun.finalCleared} 关`,
            detail: `最高推进到 GPA ${gpaTextForLevel(timedRun.level)}`,
            accent: 'teal',
            primaryLabel: '收下成绩',
        });
        transitionBusy = false;
        renderHud();
    }

    async function newBoard({ forceLoading = false } = {}) {
        const ticket = ++generationTicket;
        generating = true;
        pushPause();
        renderHud();

        const showLoading = forceLoading || shouldShowLoading();
        if (showLoading) {
            loading.show(loadingMessage());
            await waitForPaint();
        }

        let nextPuzzle;
        try {
            nextPuzzle = buildPuzzle();
        } finally {
            loading.hide();
            popPause();
        }

        if (ticket !== generationTicket) {
            generating = false;
            return;
        }

        detachPointer?.();
        detachPointer = null;
        board?.destroy();

        puzzle = nextPuzzle;
        board = new BoardView(puzzle, getThemeColors());
        userPath = new Path(puzzle.size);
        if (!isMobileDevice()) {
            detachPointer = attachPointer(board.svg, userPath, {
                onUpdate: syncUserLine,
                onSubmit: () => actions.submit(),
            });
        }

        generating = false;
        renderHud();
    }

    async function enterClassicMode({ refresh = false } = {}) {
        const changed = currentMode !== MODE_CLASSIC;
        currentMode = MODE_CLASSIC;
        if (changed || refresh || !board) {
            await newBoard();
        }
        refreshPanels();
    }

    async function startTimedMode() {
        currentMode = MODE_TIMED;
        timedRun = timedSession(timedDuration);
        await newBoard();
        refreshPanels();
    }

    async function startChallengeMode() {
        currentMode = MODE_CHALLENGE;
        challengeRun = challengeSession(challengeConfig);
        await newBoard({ forceLoading: true });
        refreshPanels();
    }

    async function resetClassicProgress() {
        classicRun = persistClassic
            ? resetClassicRun()
            : { level: 0, startedAt: Date.now(), finishedAt: null, pausedMs: 0 };
        unlocks = persistClassic ? resetUnlocks() : { timed: false, challenge: false };
        timedRun = null;
        challengeRun = null;
        currentMode = MODE_CLASSIC;

        remove(ENDING_SEEN_KEY);
        remove(LEGACY_LEVEL_KEY);
        document.getElementById('ending-replay-button')?.remove();

        await newBoard();
        refreshPanels();
    }

    async function handleSuccess() {
        transitionBusy = true;
        board.winEffect();

        if (currentMode === MODE_CLASSIC) {
            classicRun.level++;
            if (classicCompleted() && classicRun.finishedAt === null) {
                classicRun.finishedAt = Date.now();
            }
            saveClassic();
            const newlyUnlocked = grantUnlocks();
            hud.bumpPrimary();
            refreshPanels();

            setTimeout(async () => {
                if (classicCompleted()) {
                    transitionBusy = false;
                    refreshPanels();
                    showReplayButton();
                    if (!load(ENDING_SEEN_KEY, false)) {
                        save(ENDING_SEEN_KEY, true);
                        playEnding();
                    }
                    return;
                }

                await newBoard();
                refreshPanels();
                if (newlyUnlocked.length) {
                    await playUnlockCelebrations(newlyUnlocked);
                }
                transitionBusy = false;
                renderHud();
            }, WIN_TRANSITION_MS);
            return;
        }

        if (currentMode === MODE_TIMED) {
            timedRun.level++;
            timedRun.cleared++;
            hud.bumpPrimary();
            refreshPanels();
            setTimeout(async () => {
                if (timedRemainingMs() <= 0) {
                    transitionBusy = false;
                    await maybeEndTimedRun();
                    return;
                }
                await newBoard();
                transitionBusy = false;
                refreshPanels();
            }, WIN_TRANSITION_MS);
            return;
        }

        challengeRun.solved++;
        hud.bumpPrimary();
        refreshPanels();
        setTimeout(async () => {
            await newBoard({ forceLoading: true });
            transitionBusy = false;
            refreshPanels();
        }, WIN_TRANSITION_MS);
    }

    const actions = {
        move(direction) {
            if (blockForExpiredTimer() || isInteractionBlocked()) {
                return;
            }
            if (userPath.step(direction)) {
                syncUserLine();
            } else if (userPath.distance &&
                (direction + 2) % 4 === userPath.queue[userPath.distance - 1]) {
                userPath.back();
                syncUserLine();
            }
        },
        undo() {
            if (blockForExpiredTimer() || isInteractionBlocked()) {
                return;
            }
            userPath.back();
            syncUserLine();
        },
        clear() {
            if (blockForExpiredTimer() || isInteractionBlocked()) {
                return;
            }
            userPath.clear();
            syncUserLine();
        },
        submit() {
            if (blockForExpiredTimer() || isInteractionBlocked()) {
                return;
            }
            const result = checkSolution(puzzle.sign, puzzle.size, userPath);
            if (result.ok) {
                void handleSuccess();
            } else {
                board.failEffect(result);
                hud.showWrongAnswer();
            }
        },
        changeMap() {
            if (blockForExpiredTimer() || isInteractionBlocked()) {
                return;
            }
            lowerDifficultyForHint();
            refreshPanels();
            void newBoard({ forceLoading: currentMode === MODE_CHALLENGE });
        },
        showAnswer() {
            if (blockForExpiredTimer() || isInteractionBlocked()) {
                return;
            }
            board.showAnswer();
            lowerDifficultyForHint();
            refreshPanels();
        },
        hideAnswer() {
            board?.hideAnswer();
        },
    };

    const levelAdapter = {
        get value() {
            return currentLevelValue();
        },
        size() {
            return currentSize();
        },
        set(nextLevel) {
            if (!Number.isInteger(nextLevel) || nextLevel < 0) {
                return;
            }
            switch (currentMode) {
                case MODE_TIMED:
                    if (!timedRun) {
                        timedRun = timedSession(timedDuration);
                    }
                    timedRun.level = nextLevel;
                    timedRun.cleared = nextLevel;
                    timedRun.ended = false;
                    timedRun.finalCleared = null;
                    break;
                case MODE_CHALLENGE:
                    challengeRun = challengeSession(challengeConfig);
                    challengeRun.solved = nextLevel;
                    break;
                case MODE_CLASSIC:
                default:
                    classicRun.level = nextLevel;
                    classicRun.finishedAt = null;
                    saveClassic();
                    break;
            }
            refreshPanels();
        },
    };

    attachKeyboard(actions);

    if (isMobileDevice()) {
        swipeDetector = createMobileControls(actions);
    }

    setupMenu(document.getElementById('help'), swipeDetector, {
        onOpen: pushPause,
        onClose: popPause,
    });
    modeMenu = setupModeMenu(document.getElementById('mode'), {
        getState: buildModeMenuState,
        onOpen: () => {
            pushPause();
            swipeDetector?.removeEventListener();
        },
        onClose: () => {
            popPause();
            swipeDetector?.addEventListener();
        },
        switchMode: () => enterClassicMode(),
        resetClassic: resetClassicProgress,
        startTimed: startTimedMode,
        setTimedDuration(minutes) {
            timedDuration = minutes;
            saveTimedDuration(minutes);
            renderHud();
        },
        updateChallengeConfig(patch) {
            challengeConfig = normalizeChallengeConfig({ ...challengeConfig, ...patch });
            saveChallengeConfig(challengeConfig);
            renderHud();
        },
        startChallenge: startChallengeMode,
    });

    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => board?.applyScale(), 150);
    });

    if (load(ENDING_SEEN_KEY, false)) {
        showReplayButton();
    }

    if (import.meta.env.DEV) {
        window.__ustcer = {
            actions,
            level: levelAdapter,
            get puzzle() {
                return puzzle;
            },
            get mode() {
                return currentMode;
            },
        };
        attachDebugGlobals(window, createDebugApi({
            level: levelAdapter,
            actions,
            getPuzzle: () => puzzle,
            getUserPath: () => userPath,
            getBusy: () => transitionBusy || generating,
            reloadBoard: () => {
                void newBoard();
            },
            syncUserLine,
            showAnswer: () => board?.showAnswer(),
            hideAnswer: () => board?.hideAnswer(),
            playEnding,
            resetProgress: () => {
                classicRun = persistClassic
                    ? resetClassicRun()
                    : { level: 0, startedAt: Date.now(), finishedAt: null, pausedMs: 0 };
                unlocks = persistClassic ? resetUnlocks() : { timed: false, challenge: false };
                timedRun = null;
                challengeRun = null;
                currentMode = MODE_CLASSIC;
                remove(ENDING_SEEN_KEY);
                remove(LEGACY_LEVEL_KEY);
                document.getElementById('ending-replay-button')?.remove();
            },
        }), import.meta.env.DEV);
    }

    await newBoard();
    renderHud();

    setInterval(() => {
        renderHud();
        void maybeEndTimedRun();
    }, HUD_TICK_MS);
}

initBackground(document.querySelector('.particle-network-animation'));
void startGame();
