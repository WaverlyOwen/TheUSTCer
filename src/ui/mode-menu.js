"use strict";

import {
    CHALLENGE_DIFFICULTIES,
    MAX_CHALLENGE_SIZE,
    MIN_CHALLENGE_SIZE,
    MODE_CHALLENGE,
    MODE_CLASSIC,
    MODE_TIMED,
    TIMED_MODE_OPTIONS,
} from '../core/game-state.js';

const MODE_LABELS = {
    [MODE_CLASSIC]: '经典模式',
    [MODE_TIMED]: '计时模式',
    [MODE_CHALLENGE]: '挑战模式',
};

function activeBadge(currentMode, mode) {
    return currentMode === mode ? '<span class="mode-current">当前</span>' : '';
}

function lockCopy(unlockedAt, extra = '') {
    return `<p class="mode-lock">经典模式达到 GPA ${unlockedAt.toFixed(2)} 后解锁${extra}</p>`;
}

function difficultyButtons(currentDifficulty) {
    return Object.entries(CHALLENGE_DIFFICULTIES)
        .map(([key, entry]) => `
            <button
                type="button"
                class="mode-pill${currentDifficulty === key ? ' selected' : ''}"
                data-difficulty="${key}"
            >${entry.label}</button>
        `)
        .join('');
}

function durationButtons(currentDuration) {
    return TIMED_MODE_OPTIONS
        .map((minutes) => `
            <button
                type="button"
                class="mode-pill${currentDuration === minutes ? ' selected' : ''}"
                data-duration="${minutes}"
            >${minutes} 分钟</button>
        `)
        .join('');
}

function toggleRow(name, checked, label, hint) {
    return `
        <label class="mode-toggle">
            <input type="checkbox" name="${name}" ${checked ? 'checked' : ''}>
            <span>${label}</span>
            <small>${hint}</small>
        </label>
    `;
}

function render(state) {
    const timedButtonLabel = state.currentMode === MODE_TIMED ? '重新开始计时' : '进入计时模式';
    const challengeButtonLabel = state.currentMode === MODE_CHALLENGE ? '重新生成挑战' : '进入挑战模式';

    return `
        <div class="mode-menu-backdrop"></div>
        <section class="mode-menu-panel" aria-label="游戏模式">
            <header class="mode-menu-header">
                <div>
                    <div class="mode-menu-eyebrow">玩法菜单</div>
                    <h2>${MODE_LABELS[state.currentMode]}</h2>
                </div>
                <button type="button" class="mode-menu-close" data-action="close" aria-label="关闭">×</button>
            </header>

            <div class="mode-menu-section ${state.currentMode === MODE_CLASSIC ? 'active' : ''}">
                <div class="mode-menu-section-title">
                    <span>经典模式</span>
                    ${activeBadge(state.currentMode, MODE_CLASSIC)}
                </div>
                <p class="mode-summary">${state.classic.summary}</p>
                <div class="mode-actions">
                    <button type="button" class="mode-primary" data-action="switch-classic">继续经典</button>
                    <button type="button" class="mode-secondary" data-action="reset-classic">重置进度</button>
                </div>
            </div>

            <div class="mode-menu-section ${state.currentMode === MODE_TIMED ? 'active' : ''}">
                <div class="mode-menu-section-title">
                    <span>计时模式</span>
                    ${activeBadge(state.currentMode, MODE_TIMED)}
                </div>
                ${state.unlocks.timed ? `
                    <p class="mode-summary">${state.timed.summary}</p>
                    <div class="mode-pill-row">${durationButtons(state.timed.durationMinutes)}</div>
                    <div class="mode-actions">
                        <button type="button" class="mode-primary" data-action="start-timed">${timedButtonLabel}</button>
                    </div>
                ` : lockCopy(3.0, '，冲到上 3 就能开刷')}
            </div>

            <div class="mode-menu-section ${state.currentMode === MODE_CHALLENGE ? 'active' : ''}">
                <div class="mode-menu-section-title">
                    <span>挑战模式</span>
                    ${activeBadge(state.currentMode, MODE_CHALLENGE)}
                </div>
                ${state.unlocks.challenge ? `
                    <p class="mode-summary">${state.challenge.summary}</p>
                    <div class="challenge-grid">
                        <label class="mode-field">
                            <span>列数</span>
                            <input type="number" min="${MIN_CHALLENGE_SIZE}" max="${MAX_CHALLENGE_SIZE}" name="width" value="${state.challenge.config.width}">
                        </label>
                        <label class="mode-field">
                            <span>行数</span>
                            <input type="number" min="${MIN_CHALLENGE_SIZE}" max="${MAX_CHALLENGE_SIZE}" name="height" value="${state.challenge.config.height}">
                        </label>
                    </div>
                    <div class="mode-pill-row">${difficultyButtons(state.challenge.config.difficulty)}</div>
                    <div class="challenge-toggles">
                        ${toggleRow('letters', state.challenge.config.letters, '字母题', '固定朝向的 U / S / T / C')}
                        ${toggleRow('colleges', state.challenge.config.colleges, '书院题', '区域里只能留一种颜色')}
                        ${toggleRow('pairs', state.challenge.config.pairs, '组别题', '红专并进 / 理实交融')}
                        ${toggleRow('roads', state.challenge.config.roads, '路名题', '必须穿过黑色路名')}
                    </div>
                    <p class="mode-note"${state.challenge.note ? '' : ' hidden'}>${state.challenge.note ?? ''}</p>
                    <div class="mode-actions">
                        <button type="button" class="mode-primary" data-action="start-challenge">${challengeButtonLabel}</button>
                    </div>
                ` : lockCopy(3.7, '，拿到 A- 就能自订棋盘')}
            </div>
        </section>
    `;
}

export function setupModeMenu(button, handlers) {
    let root = null;
    let panel = null;
    let open = false;

    function removeRoot() {
        root?.remove();
        root = null;
        panel = null;
    }

    function close() {
        if (!open) {
            return;
        }
        open = false;
        handlers.onClose?.();
        removeRoot();
    }

    function updateChallengeFromInputs() {
        const width = Number(panel.querySelector('input[name="width"]')?.value);
        const height = Number(panel.querySelector('input[name="height"]')?.value);
        const letters = panel.querySelector('input[name="letters"]')?.checked;
        const colleges = panel.querySelector('input[name="colleges"]')?.checked;
        const pairs = panel.querySelector('input[name="pairs"]')?.checked;
        const roads = panel.querySelector('input[name="roads"]')?.checked;
        handlers.updateChallengeConfig({
            width,
            height,
            letters,
            colleges,
            pairs,
            roads,
        });
    }

    // 编辑输入框后原位同步（把归一化后的值写回 DOM + 刷新说明），
    // 不重建面板——否则正被按下的"重新生成"按钮会在 click 派发前被销毁，导致首次点击无效
    function syncChallengeControls() {
        if (!panel) {
            return;
        }
        const config = handlers.getState().challenge?.config;
        const note = handlers.getState().challenge?.note;
        if (config) {
            const widthInput = panel.querySelector('input[name="width"]');
            const heightInput = panel.querySelector('input[name="height"]');
            if (widthInput) widthInput.value = config.width;
            if (heightInput) heightInput.value = config.height;
            for (const name of ['letters', 'colleges', 'pairs', 'roads']) {
                const box = panel.querySelector(`input[name="${name}"]`);
                if (box) box.checked = config[name];
            }
        }
        const noteElement = panel.querySelector('.mode-note');
        if (noteElement) {
            noteElement.textContent = note ?? '';
            noteElement.hidden = !note;
        }
    }

    function bind() {
        root.querySelector('.mode-menu-backdrop')?.addEventListener('click', close);
        root.querySelector('[data-action="close"]')?.addEventListener('click', close);
        root.querySelector('[data-action="switch-classic"]')?.addEventListener('click', () => {
            close();
            handlers.switchMode(MODE_CLASSIC);
        });
        root.querySelector('[data-action="reset-classic"]')?.addEventListener('click', async () => {
            close();
            await handlers.resetClassic();
        });
        root.querySelector('[data-action="start-timed"]')?.addEventListener('click', async () => {
            close();
            await handlers.startTimed();
        });
        root.querySelector('[data-action="start-challenge"]')?.addEventListener('click', async () => {
            updateChallengeFromInputs();
            close();
            await handlers.startChallenge();
        });

        panel.querySelectorAll('[data-duration]').forEach((pill) => {
            pill.addEventListener('click', () => {
                handlers.setTimedDuration(Number(pill.dataset.duration));
                refresh();
            });
        });

        panel.querySelectorAll('[data-difficulty]').forEach((pill) => {
            pill.addEventListener('click', () => {
                handlers.updateChallengeConfig({ difficulty: pill.dataset.difficulty });
                refresh();
            });
        });

        panel.querySelectorAll('.challenge-grid input, .challenge-toggles input').forEach((input) => {
            input.addEventListener('change', () => {
                updateChallengeFromInputs();
                syncChallengeControls();
            });
        });
    }

    function refresh() {
        if (!open || !panel) {
            return;
        }
        root.innerHTML = render(handlers.getState());
        panel = root.querySelector('.mode-menu-panel');
        bind();
    }

    function show() {
        if (open) {
            refresh();
            return;
        }
        open = true;
        handlers.onOpen?.();
        root = document.createElement('div');
        root.id = 'mode-menu-root';
        root.innerHTML = render(handlers.getState());
        document.body.appendChild(root);
        panel = root.querySelector('.mode-menu-panel');
        bind();
    }

    button.addEventListener('click', (event) => {
        event.preventDefault();
        if (open) {
            close();
        } else {
            show();
        }
    });

    return {
        refresh,
        close,
    };
}
