"use strict";

import {
    CHALLENGE_DIFFICULTIES,
    MAX_CHALLENGE_SIZE,
    challengeBuildingsSupported,
    MIN_CHALLENGE_SIZE,
    MODE_CHALLENGE,
    MODE_CLASSIC,
    MODE_CUSTOM,
    MODE_ENDLESS,
    MODE_TIMED,
    TIMED_MODE_OPTIONS,
} from '../core/game-state.js';
import { escapeHtml } from '../lib/html.js';
import { SENSITIVITY_MAX, SENSITIVITY_MIN, getSensitivity, setSensitivity } from '../lib/settings.js';
import { setThemePreference, themePreference } from '../lib/theme.js';
import { CLOSE_ICON } from './icons.js';

const THEME_OPTIONS = [
    ['system', '跟随系统'],
    ['light', '浅色'],
    ['dark', '深色'],
];

const MODE_LABELS = {
    [MODE_CLASSIC]: '经典模式',
    [MODE_TIMED]: '计时模式',
    [MODE_ENDLESS]: '无尽模式',
    [MODE_CHALLENGE]: '挑战模式',
    [MODE_CUSTOM]: '题目工坊',
};

const ORIGIN_LABELS = {
    generated: '收藏题',
    custom: '创作题',
    imported: '导入题',
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

function workshopItem(record, creationUnlocked) {
    const date = record.createdAt ? new Date(record.createdAt).toLocaleDateString('zh-CN') : '';
    const metaParts = [
        `${record.w}×${record.h}`,
        ORIGIN_LABELS[record.origin] ?? '题目',
        record.answer ? '有答案' : '无答案',
        date,
    ].filter(Boolean);
    const editButton = creationUnlocked
        ? '<button type="button" class="workshop-button" data-workshop="edit">编辑</button>'
        : '';
    return `
        <div class="workshop-item" data-puzzle-id="${escapeHtml(record.id ?? '')}">
            <div class="workshop-item-info">
                <strong>${escapeHtml(record.name ?? '未命名题目')}</strong>
                <small>${metaParts.join(' · ')}</small>
            </div>
            <div class="workshop-item-actions">
                <button type="button" class="workshop-button" data-workshop="play">游玩</button>
                ${editButton}
                <button type="button" class="workshop-button" data-workshop="share">分享</button>
                <button type="button" class="workshop-button danger" data-workshop="delete">删除</button>
            </div>
        </div>
    `;
}

function workshopSection(state) {
    const puzzles = state.workshop?.puzzles ?? [];
    const creationUnlocked = Boolean(state.unlocks?.workshop);
    const list = puzzles.length
        ? `<div class="workshop-list">${puzzles.map(record => workshopItem(record, creationUnlocked)).join('')}</div>`
        : '<p class="mode-summary">还没有保存的题目。游玩时点顶栏的书签按钮收藏本题。</p>';
    // 创作（新建/编辑）4.00 解锁；收藏、游玩、分享、删除始终可用
    const createArea = creationUnlocked
        ? `
            <div class="mode-actions">
                <button type="button" class="mode-primary" data-action="workshop-new">新建题目</button>
            </div>`
        : lockCopy(4.0, '题目创作；收藏、游玩和分享不受影响');
    return `
        <div class="mode-menu-section ${state.currentMode === MODE_CUSTOM ? 'active' : ''}">
            <div class="mode-menu-section-title">
                <span>题目工坊</span>
                ${activeBadge(state.currentMode, MODE_CUSTOM)}
            </div>
            <p class="mode-summary">收藏的题、自己创作的题和导入的分享题都在这里，分享会把整道题编进链接。</p>
            ${list}
            ${createArea}
        </div>
    `;
}

function settingsSection() {
    const preference = themePreference() ?? 'system';
    const themePills = THEME_OPTIONS.map(([value, label]) => `
        <button type="button" class="mode-pill${preference === value ? ' selected' : ''}"
            data-theme-pref="${value}">${label}</button>`).join('');
    return `
        <div class="mode-menu-section">
            <div class="mode-menu-section-title"><span>设置</span></div>
            <div class="settings-block">
                <span>外观</span>
                <div class="mode-pill-row">${themePills}</div>
            </div>
            <label class="settings-block">
                <span>画线灵敏度 <strong data-sensitivity-value>${getSensitivity().toFixed(2)}</strong></span>
                <input type="range" name="sensitivity"
                    min="${SENSITIVITY_MIN}" max="${SENSITIVITY_MAX}" step="0.05"
                    value="${getSensitivity()}">
                <small>越高越跟手，越低越稳，实时生效。</small>
            </label>
        </div>
    `;
}

function toggleRow(name, checked, label, hint, disabled = false) {
    return `
        <label class="mode-toggle">
            <input type="checkbox" name="${name}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
            <span>${label}</span>
            <small>${hint}</small>
        </label>
    `;
}

function render(state) {
    const timedButtonLabel = state.currentMode === MODE_TIMED ? '重新开始计时' : '进入计时模式';
    const challengeButtonLabel = state.currentMode === MODE_CHALLENGE ? '重新生成挑战' : '进入挑战模式';
    const challengeBuildingsEnabled = challengeBuildingsSupported(state.challenge.config);

    return `
        <div class="mode-menu-backdrop"></div>
        <section class="mode-menu-panel" aria-label="游戏模式">
            <header class="mode-menu-header">
                <div>
                    <div class="mode-menu-eyebrow">玩法菜单</div>
                    <h2>${MODE_LABELS[state.currentMode]}</h2>
                </div>
                <button type="button" class="mode-menu-close" data-action="close" aria-label="关闭">${CLOSE_ICON}</button>
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

            <div class="mode-menu-section ${state.currentMode === MODE_ENDLESS ? 'active' : ''}">
                <div class="mode-menu-section-title">
                    <span>无尽模式</span>
                    ${activeBadge(state.currentMode, MODE_ENDLESS)}
                </div>
                ${state.unlocks.endless ? `
                    <p class="mode-summary">${state.endless.summary}</p>
                    <div class="mode-actions">
                        <button type="button" class="mode-primary" data-action="start-endless">${state.currentMode === MODE_ENDLESS ? '再战一轮' : '进入无尽模式'}</button>
                    </div>
                ` : lockCopy(3.3, '，每题限时的生存挑战')}
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
                            <span>列数 <strong data-size-value="width">${state.challenge.config.width}</strong></span>
                            <input
                                type="range"
                                min="${MIN_CHALLENGE_SIZE}"
                                max="${MAX_CHALLENGE_SIZE}"
                                step="1"
                                name="width"
                                value="${state.challenge.config.width}"
                            >
                        </label>
                        <label class="mode-field">
                            <span>行数 <strong data-size-value="height">${state.challenge.config.height}</strong></span>
                            <input
                                type="range"
                                min="${MIN_CHALLENGE_SIZE}"
                                max="${MAX_CHALLENGE_SIZE}"
                                step="1"
                                name="height"
                                value="${state.challenge.config.height}"
                            >
                        </label>
                    </div>
                    <div class="challenge-range-hint">${MIN_CHALLENGE_SIZE} - ${MAX_CHALLENGE_SIZE}</div>
                    <div class="mode-pill-row">${difficultyButtons(state.challenge.config.difficulty)}</div>
                    <div class="challenge-toggles">
                        ${toggleRow('buildings', state.challenge.config.buildings, '教学楼题', '一二三四五教，可旋转与镜像', !challengeBuildingsEnabled)}
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

            ${workshopSection(state)}

            ${settingsSection()}
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
        const buildings = panel.querySelector('input[name="buildings"]')?.checked;
        const colleges = panel.querySelector('input[name="colleges"]')?.checked;
        const pairs = panel.querySelector('input[name="pairs"]')?.checked;
        const roads = panel.querySelector('input[name="roads"]')?.checked;
        handlers.updateChallengeConfig({
            width,
            height,
            buildings,
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
        const state = handlers.getState();
        const config = state.challenge?.config;
        const note = state.challenge?.note;
        if (config) {
            const widthInput = panel.querySelector('input[name="width"]');
            const heightInput = panel.querySelector('input[name="height"]');
            const widthValue = panel.querySelector('[data-size-value="width"]');
            const heightValue = panel.querySelector('[data-size-value="height"]');
            if (widthInput) widthInput.value = config.width;
            if (heightInput) heightInput.value = config.height;
            if (widthValue) widthValue.textContent = String(config.width);
            if (heightValue) heightValue.textContent = String(config.height);
            for (const name of ['buildings', 'colleges', 'pairs', 'roads']) {
                const box = panel.querySelector(`input[name="${name}"]`);
                if (box) box.checked = config[name];
            }
            const buildingsBox = panel.querySelector('input[name="buildings"]');
            if (buildingsBox) {
                buildingsBox.disabled = !challengeBuildingsSupported(config);
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
        root.querySelector('[data-action="start-endless"]')?.addEventListener('click', async () => {
            close();
            await handlers.startEndless();
        });
        root.querySelector('[data-action="start-challenge"]')?.addEventListener('click', async () => {
            updateChallengeFromInputs();
            close();
            await handlers.startChallenge();
        });
        root.querySelector('[data-action="workshop-new"]')?.addEventListener('click', () => {
            close();
            handlers.workshop?.create();
        });

        // 设置节：主题三态 + 灵敏度滑杆（原地生效，不重建面板防拖动中断）
        panel.querySelectorAll('[data-theme-pref]').forEach((pill) => {
            pill.addEventListener('click', () => {
                setThemePreference(pill.dataset.themePref === 'system' ? null : pill.dataset.themePref);
                panel.querySelectorAll('[data-theme-pref]').forEach((other) => {
                    other.classList.toggle('selected', other === pill);
                });
            });
        });
        const sensitivityInput = panel.querySelector('input[name="sensitivity"]');
        sensitivityInput?.addEventListener('input', () => {
            const value = setSensitivity(Number(sensitivityInput.value));
            const label = panel.querySelector('[data-sensitivity-value]');
            if (label) {
                label.textContent = value.toFixed(2);
            }
        });

        panel.querySelectorAll('.workshop-item').forEach((item) => {
            const id = item.dataset.puzzleId;
            item.querySelector('[data-workshop="play"]')?.addEventListener('click', async () => {
                close();
                await handlers.workshop?.play(id);
            });
            item.querySelector('[data-workshop="edit"]')?.addEventListener('click', () => {
                close();
                handlers.workshop?.edit(id);
            });
            item.querySelector('[data-workshop="share"]')?.addEventListener('click', async () => {
                await handlers.workshop?.share(id);
            });
            item.querySelector('[data-workshop="delete"]')?.addEventListener('click', () => {
                handlers.workshop?.remove(id);
                refresh();
            });
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

        panel.querySelectorAll('.challenge-grid input').forEach((input) => {
            input.addEventListener('input', () => {
                updateChallengeFromInputs();
                syncChallengeControls();
            });
            input.addEventListener('change', () => {
                updateChallengeFromInputs();
                syncChallengeControls();
            });
        });
        panel.querySelectorAll('.challenge-toggles input').forEach((input) => {
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
