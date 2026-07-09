"use strict";

import { Path } from '../core/path.js';
import { blankSign } from '../core/puzzle-io.js';
import { escapeHtml } from '../lib/html.js';
import { isDark, onThemeChange } from '../lib/theme.js';
import { BoardView, fitSvgToBox } from '../render/board.js';
import { BACK_ICON, CLOSE_ICON, LOCK_ICON } from './icons.js';
import { TUTORIAL_CHAPTERS, chapterLocked } from './tutorial-data.js';

const DRAG_THRESHOLD = 70;

// 教程示例板的线色：不随机，深浅主题各配一套稳定蓝
function tutorialLineColors() {
    return isDark()
        ? { darkColor: 'hsl(215, 60%, 78%)', lightColor: 'hsl(215, 36%, 38%)' }
        : { darkColor: 'hsl(215, 30%, 40%)', lightColor: 'hsl(215, 34%, 88%)' };
}

function badLineColor() {
    return isDark() ? '#ea6a6a' : '#d64545';
}

// ===== 模式 / 操作滑片的手绘示意图（线条风格与顶栏图标一致） =====

function art(inner, viewBox = '0 0 120 72') {
    return `<svg class="tutorial-art" viewBox="${viewBox}" aria-hidden="true">${inner}</svg>`;
}

const ART = {
    // 单指画线 + 两指缩放
    controls: art(`
        <rect x="8" y="10" width="46" height="52" rx="6" />
        <path d="M16 20h14M16 20v12h14v12h14" class="art-accent" />
        <circle cx="44" cy="44" r="4" class="art-accent" />
        <circle cx="82" cy="36" r="4" />
        <circle cx="104" cy="36" r="4" />
        <path d="M76 30 68 22M110 42l8 8M68 22l5 1M68 22l-1 5M118 50l-5-1M118 50l1-5" />
    `),
    // 顶栏：真实图标的微缩排布
    toolbar: art(`
        <rect x="4" y="24" width="24" height="24" rx="12" />
        <path d="M11 33h10M11 36h10M11 39h10" transform="translate(0 -0.5)" />
        <rect x="36" y="24" width="80" height="24" rx="12" />
        <g transform="translate(40 28) scale(0.68)">
            <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />
        </g>
        <g transform="translate(56 28) scale(0.68)">
            <path d="M9 18h6M10 21h4" /><path d="M12 3a6.5 6.5 0 0 0-4 11.6c.8.6 1.3 1.5 1.5 2.4h5a4.5 4.5 0 0 1 1.5-2.4A6.5 6.5 0 0 0 12 3Z" />
        </g>
        <g transform="translate(72 28) scale(0.68)">
            <path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" />
        </g>
        <g transform="translate(88 28) scale(0.68)">
            <path d="M6 3h12v18l-6-4.5L6 21V3Z" />
        </g>
        <g transform="translate(103 28) scale(0.68)">
            <circle cx="12" cy="12" r="8.6" /><path d="M9.4 9.6a2.6 2.6 0 1 1 3.7 2.36c-.75.35-1.1.84-1.1 1.54v.3M12 16.9v.1" />
        </g>
    `),
    // 计时：时钟
    timed: art(`
        <circle cx="60" cy="38" r="24" />
        <path d="M60 24v14l10 7" class="art-accent" />
        <path d="M60 8v4M50 10l2 4M70 10l-2 4" />
        <path d="M14 38h12M18 30l6 4M18 46l6-4" />
        <path d="M94 38h12M102 30l-6 4M102 46l-6-4" />
    `),
    // 计时规则：过关阶梯 + 倒计时
    'timed-rules': art(`
        <path d="M12 58h18V44h18V30h18V16h18" />
        <circle cx="21" cy="50" r="3.5" class="art-accent" />
        <circle cx="39" cy="36" r="3.5" class="art-accent" />
        <circle cx="57" cy="22" r="3.5" class="art-accent" />
        <circle cx="96" cy="50" r="13" />
        <path d="M96 42v8l6 4" class="art-accent" />
    `),
    // 挑战：滑杆设定
    challenge: art(`
        <path d="M16 20h52M84 20h20M16 36h24M56 36h48M16 52h68M96 52h8" />
        <circle cx="76" cy="20" r="5" class="art-accent" />
        <circle cx="48" cy="36" r="5" class="art-accent" />
        <circle cx="90" cy="52" r="5" class="art-accent" />
    `),
    // 挑战与经典互不影响：两块棋盘并立
    'challenge-rules': art(`
        <rect x="12" y="14" width="40" height="40" rx="8" />
        <path d="M22 24h20M22 34h20M22 44h20M22 24v20M32 24v20M42 24v20" opacity="0.55" />
        <rect x="68" y="14" width="40" height="40" rx="8" class="art-accent" />
        <path d="M78 24h20M78 34h20M78 44h20M78 24v20M88 24v20M98 24v20" opacity="0.55" />
        <path d="M56 30h8M56 38h8" />
    `),
    // 工坊：收藏进列表
    'workshop-save': art(`
        <path d="M20 12h18v26l-9-6.5-9 6.5V12Z" class="art-accent" />
        <rect x="56" y="14" width="52" height="12" rx="6" />
        <rect x="56" y="32" width="52" height="12" rx="6" />
        <rect x="56" y="50" width="52" height="12" rx="6" />
        <path d="M44 20h6M50 20l-3-3M50 20l-3 3" />
    `),
    // 工坊：链接分享
    'workshop-share': art(`
        <path d="M46 42a10 10 0 0 1 0-14l8-8a10 10 0 0 1 14 14l-4 4" class="art-accent" />
        <path d="M74 30a10 10 0 0 1 0 14l-8 8a10 10 0 0 1-14-14l4-4" />
        <path d="M96 36h14M105 30l6 6-6 6" />
    `),
    // 工坊：创作
    'workshop-edit': art(`
        <rect x="14" y="14" width="44" height="44" rx="8" />
        <path d="M25 25h22M25 36h22M25 47h22M25 25v22M36 25v22M47 25v22" opacity="0.55" />
        <path d="M70 52 100 22a6 6 0 0 1 8.5 8.5L78.5 60.5 68 63l2-11Z" class="art-accent" />
    `),
};

// ===== 教程覆盖层 =====

export function setupMenu(button, swipeDetector, callbacks = {}) {
    let root = null;
    let board = null;
    let offThemeChange = null;
    let chapterIndex = -1;   // -1 = 章节选择页
    let slideIndex = 0;
    let onKeyDown = null;

    const open = () => Boolean(root);

    function state() {
        return callbacks.getState?.() ?? { gpaValue: 99, unlocks: {} };
    }

    function destroyBoard() {
        board?.destroy();
        board = null;
    }

    function close() {
        if (!open()) {
            return;
        }
        destroyBoard();
        offThemeChange?.();
        offThemeChange = null;
        document.removeEventListener('keydown', onKeyDown, true);
        root.remove();
        root = null;
        chapterIndex = -1;
        swipeDetector?.addEventListener();
        callbacks.onClose?.();
    }

    function show() {
        if (open()) {
            return;
        }
        swipeDetector?.removeEventListener();
        callbacks.onOpen?.();

        root = document.createElement('div');
        root.id = 'tutorial-root';
        document.body.appendChild(root);
        offThemeChange = onThemeChange(() => {
            if (chapterIndex >= 0) {
                renderSlide();
            }
        });
        onKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                close();
            } else if (chapterIndex >= 0 && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
                event.preventDefault();
                event.stopPropagation();
                step(event.key === 'ArrowRight' ? 1 : -1);
            }
        };
        document.addEventListener('keydown', onKeyDown, true);
        renderChapters();
    }

    // ===== 章节选择页 =====

    function renderChapters() {
        destroyBoard();
        chapterIndex = -1;
        const current = state();
        const cards = TUTORIAL_CHAPTERS.map((chapter, index) => {
            const locked = chapterLocked(chapter, current);
            if (locked) {
                return `
                    <div class="tutorial-chapter locked">
                        <div class="tutorial-chapter-info">
                            <strong>${escapeHtml(chapter.title)}</strong>
                            <small>${escapeHtml(locked)}</small>
                        </div>
                        <span class="tutorial-chapter-lock">${LOCK_ICON}</span>
                    </div>`;
            }
            return `
                <button type="button" class="tutorial-chapter" data-chapter="${index}">
                    <div class="tutorial-chapter-info">
                        <strong>${escapeHtml(chapter.title)}</strong>
                        <small>${escapeHtml(chapter.subtitle)} · ${chapter.slides.length} 页</small>
                    </div>
                    <span class="tutorial-chapter-go">›</span>
                </button>`;
        }).join('');

        root.innerHTML = `
            <div class="tutorial-backdrop"></div>
            <section class="tutorial-panel" aria-label="游戏教程">
                <header class="tutorial-header">
                    <div>
                        <div class="tutorial-eyebrow">游戏教程</div>
                        <h2>选择章节</h2>
                    </div>
                    <button type="button" class="tutorial-close" aria-label="关闭教程">${CLOSE_ICON}</button>
                </header>
                <p class="tutorial-note">章节随游玩进度逐步解锁，玩到哪里学到哪里。</p>
                <div class="tutorial-chapter-list">${cards}</div>
            </section>
        `;
        root.querySelector('.tutorial-backdrop').addEventListener('click', close);
        root.querySelector('.tutorial-close').addEventListener('click', close);
        root.querySelectorAll('[data-chapter]').forEach((card) => {
            card.addEventListener('click', () => {
                chapterIndex = Number(card.dataset.chapter);
                slideIndex = 0;
                renderSlide();
            });
        });
    }

    // ===== 滑片页 =====

    function chapter() {
        return TUTORIAL_CHAPTERS[chapterIndex];
    }

    function step(direction) {
        const count = chapter().slides.length;
        const next = slideIndex + direction;
        if (next < 0 || next >= count) {
            return;
        }
        slideIndex = next;
        renderSlide(direction);
    }

    function renderSlide(direction = 0) {
        destroyBoard();
        const { title, slides } = chapter();
        const slide = slides[slideIndex];
        root.innerHTML = `
            <div class="tutorial-backdrop"></div>
            <section class="tutorial-panel" aria-label="游戏教程">
                <header class="tutorial-header">
                    <button type="button" class="tutorial-back" aria-label="返回章节">${BACK_ICON}</button>
                    <div class="tutorial-header-title">
                        <div class="tutorial-eyebrow">游戏教程</div>
                        <h2>${escapeHtml(title)}</h2>
                    </div>
                    <button type="button" class="tutorial-close" aria-label="关闭教程">${CLOSE_ICON}</button>
                </header>
                <div class="tutorial-slide${direction ? (direction > 0 ? ' slide-in-right' : ' slide-in-left') : ''}">
                    <div class="tutorial-figure" data-role="figure">${slide.art ? ART[slide.art] ?? '' : ''}</div>
                    <p class="tutorial-caption">${escapeHtml(slide.caption)}</p>
                </div>
                <footer class="tutorial-footer">
                    <button type="button" class="tutorial-nav" data-step="-1" ${slideIndex === 0 ? 'disabled' : ''} aria-label="上一页">${BACK_ICON}</button>
                    <div class="tutorial-dots">${slides.map((_, i) =>
                        `<span class="tutorial-dot${i === slideIndex ? ' active' : ''}"></span>`).join('')}</div>
                    <button type="button" class="tutorial-nav next" data-step="1" ${slideIndex === slides.length - 1 ? 'disabled' : ''} aria-label="下一页">${BACK_ICON}</button>
                </footer>
            </section>
        `;
        root.querySelector('.tutorial-backdrop').addEventListener('click', close);
        root.querySelector('.tutorial-close').addEventListener('click', close);
        root.querySelector('.tutorial-back').addEventListener('click', renderChapters);
        root.querySelectorAll('[data-step]').forEach((nav) => {
            nav.addEventListener('click', () => step(Number(nav.dataset.step)));
        });

        if (slide.board) {
            renderBoard(slide.board);
        }
        attachDrag(root.querySelector('.tutorial-slide'));
    }

    // 真实渲染：用游戏自己的 BoardView 画示例板，并重放示例路径
    function renderBoard(spec) {
        const figure = root.querySelector('[data-role="figure"]');
        const sign = blankSign(spec.w, spec.h);
        for (const [i, j, type, sub] of spec.cells) {
            sign[i][j][2] = [type, sub];
        }
        for (const [i, j, orient, idx] of spec.roads) {
            sign[i][j][orient] = [1, idx];
        }
        board = new BoardView(
            { size: [spec.w, spec.h], sign, answer: null, palette: [], roadNames: [], blockedEdges: spec.blocked ?? [] },
            tutorialLineColors(),
            { container: figure, svgId: 'tutorial-board' },
        );
        fitSvgToBox(board.svg, [spec.w, spec.h], figure);

        if (spec.moves) {
            const path = new Path([spec.w, spec.h]);
            for (const move of spec.moves) {
                path.step(move);
            }
            board.updateUserLine(path.queue);
            board.userAnimator?.snap?.();
            if (spec.bad) {
                board.userLine.setAttribute('stroke', badLineColor());
                board.dot.setAttribute('stroke', badLineColor());
            }
        }
    }

    // 指针拖动翻页：Pointer Events + capture，鼠标/触摸统一（修复旧卡堆鼠标拖不动的问题）
    function attachDrag(card) {
        let startX = null;
        let pointerId = null;

        card.addEventListener('pointerdown', (event) => {
            if (event.button !== 0 && event.pointerType === 'mouse') {
                return;
            }
            startX = event.clientX;
            pointerId = event.pointerId;
            card.setPointerCapture?.(pointerId);
            card.style.transition = 'none';
        });
        card.addEventListener('pointermove', (event) => {
            if (startX === null || event.pointerId !== pointerId) {
                return;
            }
            const dx = event.clientX - startX;
            card.style.transform = `translateX(${dx * 0.6}px)`;
            card.style.opacity = `${Math.max(0.4, 1 - Math.abs(dx) / 500)}`;
        });
        const release = (event) => {
            if (startX === null || event.pointerId !== pointerId) {
                return;
            }
            const dx = event.clientX - startX;
            startX = null;
            pointerId = null;
            card.style.transition = '';
            card.style.transform = '';
            card.style.opacity = '';
            if (Math.abs(dx) > DRAG_THRESHOLD) {
                step(dx < 0 ? 1 : -1);
            }
        };
        card.addEventListener('pointerup', release);
        card.addEventListener('pointercancel', release);
    }

    button.addEventListener('click', (event) => {
        event.preventDefault();
        if (open()) {
            close();
        } else {
            show();
        }
    });
}
