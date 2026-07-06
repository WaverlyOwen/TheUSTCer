"use strict";

import './styles/styles.css';
import './styles/menu.css';
import './styles/background.css';
import './styles/ending.css';

import { createLevel } from './core/level.js';
import { generatePuzzle } from './core/generator.js';
import { checkSolution } from './core/validator.js';
import { Path } from './core/path.js';
import { BoardView } from './render/board.js';
import { getThemeColors } from './lib/random.js';
import { load, remove, save } from './lib/storage.js';
import { attachKeyboard } from './input/keyboard.js';
import { attachPointer } from './input/pointer.js';
import { isMobileDevice, createMobileControls } from './input/touch.js';
import { attachDebugGlobals, createDebugApi } from './debug/api.js';
import { createHud } from './ui/hud.js';
import { setupMenu } from './ui/menu.js';
import { playEnding, showReplayButton } from './ui/ending.js';
import { initBackground } from './ui/background.js';

const WIN_TRANSITION_MS = 900;

function startGame() {
    // ?level=N 调试后门：直接从第 N 关开始，且该会话不写存档
    const params = new URLSearchParams(location.search);
    const debugLevel = params.has('level') ? parseInt(params.get('level'), 10) : null;
    const level = createLevel({
        persist: debugLevel === null,
        initial: Number.isInteger(debugLevel) ? debugLevel : null,
    });

    const hud = createHud(level);

    // 谜题由关卡档位（尺寸+难度）决定，闲时预生成，Enter/Tab 换盘即取即用
    const puzzleCache = new Map();
    const tierOf = (levelValue) => Math.floor(levelValue / 10);

    function takePuzzle(levelValue, fresh = false) {
        if (fresh) {
            return generatePuzzle(level.sizeAt(levelValue), levelValue);
        }
        const cached = puzzleCache.get(tierOf(levelValue));
        if (cached && cached.length) {
            return cached.pop();
        }
        return generatePuzzle(level.sizeAt(levelValue), levelValue);
    }

    function pregenerate() {
        const wanted = [
            [level.value, 2],
            [level.value + 1, 1],
        ];
        const scheduleIdle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 200));
        scheduleIdle(() => {
            for (const [levelValue, count] of wanted) {
                const key = tierOf(levelValue);
                const cached = puzzleCache.get(key) ?? [];
                if (cached.length < count) {
                    cached.push(generatePuzzle(level.sizeAt(levelValue), levelValue));
                    puzzleCache.set(key, cached);
                    pregenerate();
                    return;
                }
            }
        });
    }

    let board = null;
    let userPath = null;
    let puzzle = null;
    let detachPointer = null;
    let busy = false;

    function syncUserLine(partial = null) {
        board?.updateUserLine(userPath.queue, partial);
    }

    function newBoard({ fresh = false, prefetch = true } = {}) {
        detachPointer?.();
        board?.destroy();

        puzzle = takePuzzle(level.value, fresh);
        board = new BoardView(puzzle, getThemeColors());
        userPath = new Path(puzzle.size);
        if (!isMobileDevice()) {
            detachPointer = attachPointer(board.svg, userPath, {
                onUpdate: syncUserLine,
                onSubmit: () => actions.submit(),
            });
        }
        if (prefetch) {
            pregenerate();
        }
    }

    function maybePlayEnding() {
        if (!level.isMax()) {
            return;
        }
        showReplayButton();
        if (!load('endingSeen', false)) {
            save('endingSeen', true);
            playEnding();
        }
    }

    const actions = {
        move(direction) {
            if (busy) {
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
            if (busy) {
                return;
            }
            userPath.back();
            syncUserLine();
        },
        clear() {
            if (busy) {
                return;
            }
            userPath.clear();
            syncUserLine();
        },
        submit() {
            if (busy) {
                return;
            }
            const result = checkSolution(puzzle.sign, puzzle.size, userPath);
            if (result.ok) {
                busy = true;
                board.winEffect();
                level.increment();
                setTimeout(() => {
                    busy = false;
                    newBoard();
                    maybePlayEnding();
                }, WIN_TRANSITION_MS);
            } else {
                board.failEffect(result);
                hud.showWrongAnswer();
            }
        },
        changeMap() {
            if (busy) {
                return;
            }
            level.decrement();
            newBoard();
        },
        showAnswer() {
            if (busy) {
                return;
            }
            board.showAnswer();
            level.decrement();
        },
        hideAnswer() {
            board.hideAnswer();
        },
    };

    attachKeyboard(actions);

    let swipeDetector = null;
    if (isMobileDevice()) {
        swipeDetector = createMobileControls(actions);
    }
    setupMenu(document.getElementById('help'), swipeDetector);

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => board?.applyScale(), 150);
    });

    if (load('endingSeen', false)) {
        showReplayButton();
    }

    if (import.meta.env.DEV) {
        window.__ustcer = {
            actions,
            level,
            get puzzle() { return puzzle; },
        };
        attachDebugGlobals(window, createDebugApi({
            level,
            actions,
            getPuzzle: () => puzzle,
            getUserPath: () => userPath,
            getBusy: () => busy,
            reloadBoard: newBoard,
            syncUserLine,
            showAnswer: () => board?.showAnswer(),
            hideAnswer: () => board?.hideAnswer(),
            playEnding,
            resetProgress: () => {
                remove('level');
                remove('endingSeen');
            },
        }), import.meta.env.DEV);
    }

    newBoard();
}

initBackground(document.querySelector('.particle-network-animation'));
startGame();
