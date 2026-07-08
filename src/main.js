"use strict";

import './styles/styles.css';
import './styles/tutorial.css';
import './styles/background.css';
import './styles/ending.css';

import { placementsByLetter } from './core/letters.js';
import { generatePuzzle } from './core/generator.js';
import { MAX_GPA_TEXT, gpaTextForLevel, gpaValueForLevel, sizeForLevel } from './core/level.js';
import {
    CHALLENGE_DIFFICULTIES,
    MODE_CHALLENGE,
    MODE_CLASSIC,
    MODE_CUSTOM,
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
    shouldBlockInteraction,
    timedSession,
    unlocksForLevel,
    challengeLettersSupported,
} from './core/game-state.js';
import { Path } from './core/path.js';
import { checkSolution } from './core/validator.js';
import { attachDebugGlobals, createDebugApi } from './debug/api.js';
import { attachKeyboard } from './input/keyboard.js';
import { attachPointer } from './input/pointer.js';
import { createSwipeDetector, isMobileDevice } from './input/touch.js';
import { load, remove, save } from './lib/storage.js';
import { getSensitivity } from './lib/settings.js';
import { isDark, onThemeChange } from './lib/theme.js';
import {
    decodeShareHash,
    deleteSavedPuzzle,
    deserializePuzzle,
    encodeShareUrl,
    loadSavedPuzzles,
    savePuzzleRecord,
    serializePuzzle,
} from './core/puzzle-io.js';
import { copyText } from './lib/clipboard.js';
import { setupToolbar } from './ui/toolbar.js';
import { openEditor } from './ui/editor.js';
import { showToast } from './ui/toast.js';
import { getThemeColors } from './lib/random.js';
import { BoardView } from './render/board.js';
import { createBoardViewport } from './render/viewport.js';
import { attachGestures } from './input/gesture.js';
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
    if (!challengeLettersSupported(config)) {
        return '棋盘超过 22×22 时字母题会保持关闭；缩回 22×22 及以下就能重新打开。';
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
        workshop: unlocks.workshop || earnedUnlocks.workshop,
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
    const boardViewport = createBoardViewport();
    attachGestures(boardViewport);

    let board = null;
    let userPath = null;
    let puzzle = null;
    let detachPointer = null;
    let swipeDetector = null;
    let modeMenu = null;
    let toolbar = null;
    let answerShown = false;
    let transitionBusy = false;
    let generating = false;
    let generationTicket = 0;
    let resizeTimer = null;
    let endingVisible = false;
    let endingPromise = null;
    let customRecord = null;   // 题目工坊：当前游玩的自定义题记录
    let editorOpen = false;
    let tutorialOpen = false;

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
        const livePauseMs = currentMode === MODE_CLASSIC ? activePauseMs(now) : 0;
        const suspendedMs = classicSuspendedAt === null ? 0 : Math.max(0, end - classicSuspendedAt);
        return Math.max(0, end - classicRun.startedAt - (classicRun.pausedMs ?? 0) - livePauseMs - suspendedMs);
    }

    // 计时暂停：菜单/加载/庆祝动画等"非游玩"时段不计入用时与倒计时。
    // 引用计数，允许嵌套；恢复时把这段时长补给经典 pausedMs、并顺延计时模式 startedAt。
    let pauseDepth = 0;
    let pauseStartedAt = 0;
    let classicSuspendedAt = null;

    function activePauseMs(now = Date.now()) {
        return pauseDepth > 0 ? Math.max(0, now - pauseStartedAt) : 0;
    }

    function suspendClassicRun() {
        if (classicRun.finishedAt !== null || classicSuspendedAt !== null) {
            return;
        }
        classicSuspendedAt = Date.now();
    }

    function resumeClassicRun() {
        if (classicSuspendedAt === null) {
            return;
        }
        const delta = Date.now() - classicSuspendedAt;
        classicSuspendedAt = null;
        if (delta > 0) {
            classicRun.pausedMs = (classicRun.pausedMs ?? 0) + delta;
            saveClassic();
        }
    }

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
                if (currentMode === MODE_CLASSIC) {
                    classicRun.pausedMs = (classicRun.pausedMs ?? 0) + delta;
                    saveClassic();
                }
                if (currentMode === MODE_TIMED && timedRun && !timedRun.ended) {
                    timedRun.startedAt += delta;
                }
            }
            renderHud();
        }
    }

    function setEndingVisible(nextVisible) {
        if (endingVisible === nextVisible) {
            return;
        }
        endingVisible = nextVisible;
        if (nextVisible) {
            pushPause();
        } else {
            popPause();
        }
        renderHud();
    }

    function playClassicEndingOverlay() {
        if (endingPromise) {
            return endingPromise;
        }
        endingPromise = playEnding({
            onVisibilityChange: setEndingVisible,
        }).finally(() => {
            endingPromise = null;
            setEndingVisible(false);
        });
        return endingPromise;
    }

    function timedRemainingMs(now = Date.now()) {
        if (!timedRun) {
            return timedDuration * 60_000;
        }
        const livePauseMs = currentMode === MODE_TIMED ? activePauseMs(now) : 0;
        return Math.max(0, timedRun.startedAt + timedRun.durationMinutes * 60_000 - now + livePauseMs);
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
        if (currentMode === MODE_CUSTOM) {
            return [customRecord.w, customRecord.h];
        }
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
            case MODE_CUSTOM:
                return '正在装载题目...';
            case MODE_CLASSIC:
            default:
                return '正在安排新学期...';
        }
    }

    function buildPuzzle() {
        if (currentMode === MODE_CUSTOM) {
            return deserializePuzzle(customRecord);
        }
        return generatePuzzle(currentSize(), currentLevelValue(), currentGenerationOptions());
    }

    function syncUserLine(partial = null) {
        board?.updateUserLine(userPath.queue, partial);
    }

    // 自动提交：路径踏入出口的瞬间判定一次（false→true 边沿触发，
    // 悬停/重复 onUpdate 不会连发；判错后回拖出出口再进来会再次触发）
    let wasFinished = false;

    function maybeAutoSubmit() {
        const finished = Boolean(userPath?.finished);
        if (finished && !wasFinished) {
            wasFinished = true;
            actions.submit();
            return;
        }
        wasFinished = finished;
    }

    function blockForExpiredTimer() {
        if (currentMode === MODE_TIMED && timedRun && !timedRun.ended && timedRemainingMs() <= 0) {
            void maybeEndTimedRun();
            return true;
        }
        return false;
    }

    function isInteractionBlocked() {
        return editorOpen || tutorialOpen || shouldBlockInteraction({
            transitionBusy,
            generating,
            currentMode,
            timedEnded: Boolean(timedRun?.ended),
            endingVisible,
        });
    }

    function refreshPanels() {
        renderHud();
        modeMenu?.refresh();
    }

    function renderHud() {
        let primary = '';
        let meta = '';
        let status = '';

        // 标题下方留白有限：每个模式只用「大字 + 一行小字」两行，信息用 · 串联
        switch (currentMode) {
            case MODE_TIMED: {
                const cleared = timedRun?.ended ? timedRun.finalCleared ?? timedRun.cleared : timedRun?.cleared ?? 0;
                primary = timedRun?.ended
                    ? `计时结束 · ${cleared} 关`
                    : `计时 ${formatDuration(timedRemainingMs(), false)}`;
                meta = timedRun?.ended
                    ? '打开 ☰ 菜单可以马上再来一轮'
                    : `已过 ${cleared} 关 · GPA ${gpaTextForLevel(timedRun?.level ?? 0)} · 本轮 ${timedRun?.durationMinutes ?? timedDuration} 分钟`;
                break;
            }
            case MODE_CHALLENGE: {
                const config = challengeRun?.config ?? challengeConfig;
                primary = `挑战 ${config.width}×${config.height}`;
                meta = `${currentDifficultyLabel()} · 已解 ${challengeRun?.solved ?? 0} 题 · ${clueSummary(config)}`;
                break;
            }
            case MODE_CUSTOM: {
                primary = customRecord?.name ?? '自定义题';
                meta = `题目工坊 · ${customRecord?.w}×${customRecord?.h}${customRecord?.answer ? '' : ' · 无参考答案'}`;
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
            workshop: {
                puzzles: loadSavedPuzzles(),
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
        for (const key of ['timed', 'challenge', 'workshop']) {
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
            } else if (key === 'workshop') {
                await playMilestoneCelebration({
                    title: 'GPA 4.00',
                    subtitle: '恭喜绩点上 4，题目创作已解锁',
                    detail: '现在可以在题目工坊新建、编辑自己的题目，并用链接分享给朋友。',
                    accent: 'gold',
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
        userPath = new Path(puzzle.size);
        wasFinished = false;
        mountBoard();
        setAnswerShown(false);
        boardViewport.reset({ animate: false });

        generating = false;
        renderHud();
    }

    function setAnswerShown(shown) {
        answerShown = shown;
        toolbar?.setAnswerShown(shown);
    }

    function mountBoard() {
        board = new BoardView(puzzle, getThemeColors(isDark()));
        if (!isMobileDevice()) {
            detachPointer = attachPointer(board.svg, userPath, {
                onUpdate: (partial) => {
                    syncUserLine(partial);
                    maybeAutoSubmit();
                },
                onSubmit: () => actions.submit(),
                getSensitivity,
            });
        }
    }

    // 切换深浅色：SVG 调色板是属性级的，重建题板并原样重放路径/答案显示状态
    function rebuildBoardForTheme() {
        if (!board || !puzzle) {
            return;
        }
        const queue = [...userPath.queue];
        detachPointer?.();
        detachPointer = null;
        board.destroy();
        userPath = new Path(puzzle.size);
        for (const move of queue) {
            userPath.step(move);
        }
        wasFinished = userPath.finished;
        mountBoard();
        board.updateUserLine(userPath.queue);
        board.userAnimator?.snap?.();
        if (answerShown) {
            board.showAnswer();
            board.answerAnimator?.snap?.();
        }
        // 新 SVG 要按当前缩放状态重新落位/定尺寸
        boardViewport.layout();
    }

    async function enterClassicMode({ refresh = false } = {}) {
        const changed = currentMode !== MODE_CLASSIC;
        resumeClassicRun();
        currentMode = MODE_CLASSIC;
        if (changed || refresh || !board) {
            await newBoard();
        }
        refreshPanels();
    }

    async function startTimedMode() {
        if (currentMode === MODE_CLASSIC) {
            suspendClassicRun();
        }
        currentMode = MODE_TIMED;
        timedRun = timedSession(timedDuration);
        await newBoard();
        refreshPanels();
    }

    async function startChallengeMode() {
        if (currentMode === MODE_CLASSIC) {
            suspendClassicRun();
        }
        currentMode = MODE_CHALLENGE;
        challengeRun = challengeSession(challengeConfig);
        await newBoard({ forceLoading: true });
        refreshPanels();
    }

    async function resetClassicProgress() {
        classicRun = persistClassic
            ? resetClassicRun()
            : { level: 0, startedAt: Date.now(), finishedAt: null, pausedMs: 0 };
        classicSuspendedAt = null;
        unlocks = persistClassic ? resetUnlocks() : { timed: false, challenge: false, workshop: false };
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

        if (currentMode === MODE_CUSTOM) {
            // 自定义题：庆祝后停在原题，可回菜单换题
            showToast('恭喜，通过这道自定义题！');
            setTimeout(() => {
                transitionBusy = false;
                renderHud();
            }, WIN_TRANSITION_MS);
            return;
        }

        if (currentMode === MODE_CLASSIC) {
            classicRun.level++;
            const reachedCapThisWin = classicCompleted() && classicRun.finishedAt === null;
            if (reachedCapThisWin) {
                classicRun.finishedAt = Date.now();
            }
            saveClassic();
            const newlyUnlocked = grantUnlocks();
            hud.bumpPrimary();
            refreshPanels();

            setTimeout(async () => {
                await newBoard();
                refreshPanels();
                if (newlyUnlocked.length) {
                    await playUnlockCelebrations(newlyUnlocked);
                }
                if (classicCompleted()) {
                    showReplayButton(playClassicEndingOverlay);
                    if (reachedCapThisWin && !load(ENDING_SEEN_KEY, false)) {
                        save(ENDING_SEEN_KEY, true);
                        await playClassicEndingOverlay();
                    }
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
                maybeAutoSubmit();
            } else if (userPath.distance &&
                (direction + 2) % 4 === userPath.queue[userPath.distance - 1]) {
                userPath.back();
                syncUserLine();
                wasFinished = userPath.finished;
            }
        },
        undo() {
            if (blockForExpiredTimer() || isInteractionBlocked()) {
                return;
            }
            userPath.back();
            syncUserLine();
            wasFinished = userPath.finished;
        },
        clear() {
            if (blockForExpiredTimer() || isInteractionBlocked()) {
                return;
            }
            userPath.clear();
            syncUserLine();
            wasFinished = false;
        },
        submit() {
            if (blockForExpiredTimer() || isInteractionBlocked()) {
                return;
            }
            const result = checkSolution(puzzle.sign, puzzle.size, userPath, puzzle.palette);
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
            // 自定义题不保证可解：没有存答案就明确告知，不扣关
            if (!puzzle.answer) {
                showToast('No Answer — 这道题没有附带答案');
                return;
            }
            board.showAnswer();
            setAnswerShown(true);
            lowerDifficultyForHint();
            refreshPanels();
        },
        hideAnswer() {
            board?.hideAnswer();
            setAnswerShown(false);
        },
    };

    function saveCurrentPuzzle() {
        if (!puzzle) {
            return;
        }
        if (currentMode === MODE_CUSTOM) {
            showToast('这道题已经在题目工坊里了');
            return;
        }
        try {
            const record = savePuzzleRecord(serializePuzzle(puzzle, {
                name: `${puzzle.size[0]}×${puzzle.size[1]} · ${new Date().toLocaleDateString('zh-CN')}`,
                origin: 'generated',
            }));
            showToast(`已保存「${record.name}」，可在 ☰ 菜单的题目工坊查看`);
        } catch (error) {
            showToast(String(error?.message ?? error));
        }
    }

    // ===== 题目工坊：游玩 / 编辑 / 分享 / 导入 =====

    async function playCustomPuzzle(record) {
        if (currentMode === MODE_CLASSIC) {
            suspendClassicRun();
        }
        currentMode = MODE_CUSTOM;
        customRecord = record;
        await newBoard();
        refreshPanels();
    }

    function findSavedPuzzle(id) {
        return loadSavedPuzzles().find(entry => entry.id === id) ?? null;
    }

    async function shareRecord(record) {
        const copied = await copyText(encodeShareUrl(record));
        showToast(copied ? '分享链接已复制，整道题都在链接里' : '复制失败，请手动复制地址栏链接');
    }

    function openPuzzleEditor(record = null) {
        if (editorOpen) {
            return;
        }
        // 创作（新建/编辑）需 GPA 4.00 解锁；收藏、游玩、分享不受限
        if (!unlocks.workshop) {
            showToast('经典模式达到 GPA 4.00 后解锁题目创作');
            return;
        }
        editorOpen = true;
        pushPause();
        swipeDetector?.removeEventListener();
        openEditor({
            record,
            onSave: (built) => {
                try {
                    const saved = savePuzzleRecord(built);
                    showToast(`已保存「${saved.name}」${built.answer ? '（含答案）' : '（无答案）'}`);
                    return saved;
                } catch (error) {
                    showToast(String(error?.message ?? error));
                    return null;
                }
            },
            onShare: shareRecord,
            onPlay: async (built) => {
                const saved = savePuzzleRecord(built);
                await playCustomPuzzle(saved);
            },
            onClose: () => {
                editorOpen = false;
                popPause();
                swipeDetector?.addEventListener();
            },
        });
    }

    // 启动时的 #p= 分享链接：确认后入列表并直接游玩
    function showImportConfirm(record) {
        pushPause();
        const root = document.createElement('div');
        root.id = 'import-dialog-root';
        root.innerHTML = `
            <div class="mode-menu-backdrop"></div>
            <section class="import-panel" aria-label="导入分享题目">
                <h2>导入分享题目</h2>
                <p class="import-meta"></p>
                <div class="mode-actions">
                    <button type="button" class="mode-primary" data-action="import">导入并游玩</button>
                    <button type="button" class="mode-secondary" data-action="cancel">取消</button>
                </div>
            </section>
        `;
        // 题目名来自链接（用户可控），用 textContent 注入
        root.querySelector('.import-meta').textContent =
            `${record.name ?? '未命名题目'} · ${record.w}×${record.h} · ${record.answer ? '附带答案' : '无答案'}`;
        document.body.appendChild(root);
        const dismiss = () => {
            root.remove();
            popPause();
        };
        root.querySelector('[data-action="import"]').addEventListener('click', async () => {
            dismiss();
            const saved = savePuzzleRecord({ ...record, origin: 'imported' });
            await playCustomPuzzle(saved);
        });
        root.querySelector('[data-action="cancel"]').addEventListener('click', dismiss);
        root.querySelector('.mode-menu-backdrop').addEventListener('click', dismiss);
    }

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
        swipeDetector = createSwipeDetector(actions, getSensitivity);
        swipeDetector.addEventListener();
    }

    toolbar = setupToolbar({
        clear: () => actions.clear(),
        showAnswer: () => actions.showAnswer(),
        hideAnswer: () => actions.hideAnswer(),
        changeMap: () => actions.changeMap(),
        savePuzzle: saveCurrentPuzzle,
    });

    onThemeChange(() => rebuildBoardForTheme());

    setupMenu(document.getElementById('help'), swipeDetector, {
        onOpen: () => {
            pushPause();
            tutorialOpen = true;
        },
        onClose: () => {
            popPause();
            tutorialOpen = false;
        },
        // 教程章节随进度解锁
        getState: () => ({
            gpaValue: gpaValueForLevel(classicRun.level),
            unlocks,
        }),
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
        workshop: {
            create: () => openPuzzleEditor(),
            play: async (id) => {
                const record = findSavedPuzzle(id);
                if (record) {
                    await playCustomPuzzle(record);
                }
            },
            edit: (id) => {
                const record = findSavedPuzzle(id);
                if (record) {
                    openPuzzleEditor(record);
                }
            },
            share: async (id) => {
                const record = findSavedPuzzle(id);
                if (record) {
                    await shareRecord(record);
                }
            },
            remove: (id) => {
                deleteSavedPuzzle(id);
                showToast('已删除题目');
            },
        },
    });

    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            board?.applyScale();
            boardViewport.layout();
        }, 150);
    });

    if (load(ENDING_SEEN_KEY, false)) {
        showReplayButton(playClassicEndingOverlay);
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
                return newBoard();
            },
            syncUserLine,
            showAnswer: () => board?.showAnswer(),
            hideAnswer: () => board?.hideAnswer(),
            playEnding,
            resetProgress: () => {
                classicRun = persistClassic
                    ? resetClassicRun()
                    : { level: 0, startedAt: Date.now(), finishedAt: null, pausedMs: 0 };
                classicSuspendedAt = null;
                unlocks = persistClassic ? resetUnlocks() : { timed: false, challenge: false, workshop: false };
                timedRun = null;
                challengeRun = null;
                currentMode = MODE_CLASSIC;
                remove(ENDING_SEEN_KEY);
                remove(LEGACY_LEVEL_KEY);
                document.getElementById('ending-replay-button')?.remove();
            },
        }), import.meta.env.DEV);
    }

    // 分享链接导入：先摘掉 hash（避免刷新重复弹层），再在首盘就绪后确认导入
    const sharedRecord = decodeShareHash();
    if (sharedRecord) {
        history.replaceState(null, '', `${location.pathname}${location.search}`);
    }

    await newBoard();
    renderHud();

    if (sharedRecord) {
        showImportConfirm(sharedRecord);
    }

    setInterval(() => {
        renderHud();
        void maybeEndTimedRun();
    }, HUD_TICK_MS);
}

initBackground(document.querySelector('.particle-network-animation'));
void startGame();
