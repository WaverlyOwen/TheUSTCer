"use strict";

import { LETTER_NAMES } from '../core/letters.js';
import { Path } from '../core/path.js';
import {
    CELL_COLORS,
    CELL_NAMES,
    CUSTOM_ROAD_BASE,
    CUSTOM_TYPE_BASE,
    MAX_EDITOR_SIZE,
    MIN_EDITOR_SIZE,
    ROAD_NAMES,
} from '../core/puzzle-io.js';
import { attachKeyboard } from '../input/keyboard.js';
import { attachPointer } from '../input/pointer.js';
import { createSwipeDetector, isMobileDevice } from '../input/touch.js';
import { escapeHtml } from '../lib/html.js';
import { getThemeColors, random } from '../lib/random.js';
import { getSensitivity } from '../lib/settings.js';
import { isDark, onThemeChange } from '../lib/theme.js';
import { BoardView } from '../render/board.js';

const FORMAT_VERSION = 1;
const CLOSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>';

// 书院四色类型码（7-10）；自定义色走 20+palette 下标。
// 颜色与书院对应：橙=光启·仲英（少年班），蓝=冲之（数学/工程/管理），
// 绿=时珍（生物/信息/计算机），紫=守敬（物理/化学等）。
const COLLEGE_TYPES = [7, 8, 9, 10];
const TYPE_LABELS = {
    7: '光启·仲英', 8: '冲之', 9: '时珍', 10: '守敬',
    11: '红专', 12: '理实', 14: '字母',
};
const TYPE_HINTS = {
    7: '少年班学院 · 少',
    8: '数学 / 工程 / 管理 · 管工数',
    9: '生物 / 信息 / 计算机 · 网微计生信',
    10: '物理 / 化学等 · 环核地化物',
};

function blankSign(w, h) {
    return Array.from({ length: w + 1 }, () =>
        Array.from({ length: h + 1 }, () => [[0, 0], [0, 0], [0, 0]]));
}

function cloneSign(sign) {
    return sign.map(column => column.map(entry => entry.map(part => [...part])));
}

// 题目编辑器：全屏覆盖层。点格子改类型/字/邻边路名，「画答案」复用 Path 输入，
// 不判定可解性（无答案题永远 WA，符合设定）。
export function openEditor({ record = null, onSave, onShare, onPlay, onClose }) {
    // ===== 编辑状态 =====
    let w = record?.w ?? 6;
    let h = record?.h ?? 6;
    let sign = record ? cloneSign(record.sign) : null;
    let palette = record?.palette ? record.palette.map(entry => ({ color: entry.color, chars: [...entry.chars] })) : [];
    let roadNames = record?.roadNames ? [...record.roadNames] : [];
    let name = record?.name ?? '';
    let answerDraft = record?.answer ? [...record.answer] : [];
    let currentId = record?.id ?? null;
    const createdAt = record?.createdAt ?? null;

    let board = null;
    let path = null;             // 画答案模式的 Path
    let mode = 'cells';          // 'cells' | 'answer'
    let detachAnswerInputs = null;
    let cellDialog = null;
    // 线色按当前主题取一次，切主题时再换（避免每次编辑重建都随机换色）
    let themeColors = getThemeColors(isDark());

    const root = document.createElement('div');
    root.id = 'editor-root';
    document.body.appendChild(root);

    const offThemeChange = onThemeChange(() => {
        themeColors = getThemeColors(isDark());
        rebuildBoard();
    });
    const onResize = () => fitBoard();
    window.addEventListener('resize', onResize);

    function currentPuzzle() {
        return { size: [w, h], sign, answer: null, palette, roadNames };
    }

    function replayedPath() {
        const replay = new Path([w, h]);
        for (const move of answerDraft) {
            if (!replay.step(move)) {
                break;
            }
        }
        return replay;
    }

    function buildRecord() {
        const finished = replayedPath().finished;
        return {
            v: FORMAT_VERSION,
            w,
            h,
            sign,
            answer: finished && answerDraft.length ? [...answerDraft] : null,
            palette,
            roadNames,
            name: name.trim() || `${w}×${h} 自定义题`,
            createdAt: createdAt ?? Date.now(),
            origin: 'custom',
            ...(currentId ? { id: currentId } : {}),
        };
    }

    // ===== 渲染骨架 =====

    function renderSetup() {
        root.innerHTML = `
            <div class="editor-backdrop"></div>
            <section class="editor-panel editor-setup" aria-label="新建题目">
                <header class="editor-header">
                    <h2>新建题目</h2>
                    <button type="button" class="editor-close" data-action="close" aria-label="关闭">${CLOSE_ICON}</button>
                </header>
                <div class="editor-setup-body">
                    <label class="mode-field">
                        <span>列数（宽）<strong data-value="w">6</strong></span>
                        <input type="range" name="w" min="${MIN_EDITOR_SIZE}" max="${MAX_EDITOR_SIZE}" step="1" value="6">
                    </label>
                    <label class="mode-field">
                        <span>行数（高）<strong data-value="h">6</strong></span>
                        <input type="range" name="h" min="${MIN_EDITOR_SIZE}" max="${MAX_EDITOR_SIZE}" step="1" value="6">
                    </label>
                    <p class="mode-summary">尺寸上限 ${MAX_EDITOR_SIZE}×${MAX_EDITOR_SIZE}（题目会整个编进分享链接，太大链接会很长）。</p>
                    <div class="mode-actions">
                        <button type="button" class="mode-primary" data-action="create">创建空白棋盘</button>
                    </div>
                </div>
            </section>
        `;
        root.querySelector('[data-action="close"]').addEventListener('click', close);
        root.querySelector('.editor-backdrop').addEventListener('click', close);
        for (const axis of ['w', 'h']) {
            const input = root.querySelector(`input[name="${axis}"]`);
            const label = root.querySelector(`[data-value="${axis}"]`);
            input.addEventListener('input', () => {
                label.textContent = input.value;
            });
        }
        root.querySelector('[data-action="create"]').addEventListener('click', () => {
            w = Number(root.querySelector('input[name="w"]').value);
            h = Number(root.querySelector('input[name="h"]').value);
            sign = blankSign(w, h);
            renderEditor();
        });
    }

    function renderEditor() {
        root.innerHTML = `
            <div class="editor-backdrop"></div>
            <section class="editor-panel" aria-label="题目编辑器">
                <header class="editor-header">
                    <input type="text" class="editor-name" maxlength="30" placeholder="${w}×${h} 自定义题" value="${escapeHtml(name)}">
                    <button type="button" class="editor-close" data-action="close" aria-label="关闭编辑器">${CLOSE_ICON}</button>
                </header>
                <div class="editor-mode-row">
                    <button type="button" class="mode-pill selected" data-editor-mode="cells">编辑棋盘</button>
                    <button type="button" class="mode-pill" data-editor-mode="answer">画答案</button>
                    <span class="editor-hint" data-role="hint">点任意格子设置类型、文字和邻边路名</span>
                </div>
                <div class="editor-board" data-role="board"></div>
                <footer class="editor-actions">
                    <button type="button" class="mode-secondary" data-action="clear-answer" hidden>清除答案</button>
                    <button type="button" class="mode-secondary" data-action="share">复制分享链接</button>
                    <button type="button" class="mode-secondary" data-action="play">试玩</button>
                    <button type="button" class="mode-primary" data-action="save">保存到工坊</button>
                </footer>
            </section>
        `;
        root.querySelector('[data-action="close"]').addEventListener('click', close);
        root.querySelector('.editor-name').addEventListener('input', (event) => {
            name = event.target.value;
        });
        root.querySelectorAll('[data-editor-mode]').forEach((pill) => {
            pill.addEventListener('click', () => setMode(pill.dataset.editorMode));
        });
        root.querySelector('[data-action="clear-answer"]').addEventListener('click', () => {
            path?.clear();
            answerDraft = [];
            board?.updateUserLine([]);
            updateHint();
        });
        root.querySelector('[data-action="save"]').addEventListener('click', () => {
            const saved = onSave?.(buildRecord());
            // 保存返回带 id 的记录：后续再存/试玩都更新同一条而不是复制新档
            if (saved?.id) {
                currentId = saved.id;
            }
        });
        root.querySelector('[data-action="share"]').addEventListener('click', () => {
            void onShare?.(buildRecord());
        });
        root.querySelector('[data-action="play"]').addEventListener('click', () => {
            const built = buildRecord();
            close();
            void onPlay?.(built);
        });
        rebuildBoard();
        updateHint();
    }

    // ===== 题板 =====

    function boardHost() {
        return root.querySelector('[data-role="board"]');
    }

    function fitBoard() {
        const host = boardHost();
        if (!host || !board) {
            return;
        }
        const availWidth = host.clientWidth - 8;
        const availHeight = host.clientHeight - 8;
        if (availWidth <= 0 || availHeight <= 0) {
            return;
        }
        const ratio = ((w + 2) * 50) / ((h + 1) * 50);
        const width = Math.min(availWidth, availHeight * ratio);
        board.svg.style.width = `${width}px`;
        board.svg.style.height = `${width / ratio}px`;
    }

    function rebuildBoard() {
        const host = boardHost();
        if (!host || !sign) {
            return;
        }
        detachAnswerInputs?.();
        detachAnswerInputs = null;
        board?.destroy();
        board = new BoardView(currentPuzzle(), themeColors, {
            container: host,
            svgId: 'editor-problem',
        });
        fitBoard();
        board.svg.addEventListener('click', onBoardClick);
        if (mode === 'answer') {
            attachAnswerInputs();
        } else {
            board.updateUserLine(replayedPath().queue);
            board.userAnimator?.snap?.();
        }
    }

    function onBoardClick(event) {
        if (mode !== 'cells' || cellDialog) {
            return;
        }
        const ctm = board.svg.getScreenCTM();
        if (!ctm) {
            return;
        }
        const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
        const i = Math.floor((point.x - 5) / 50);
        const j = Math.floor((point.y - 5) / 50);
        if (i < 0 || i >= w || j < 0 || j >= h) {
            return;
        }
        openCellDialog(i, j);
    }

    // ===== 画答案模式 =====

    function setMode(nextMode) {
        if (mode === nextMode) {
            return;
        }
        if (mode === 'answer' && path) {
            answerDraft = [...path.queue];
        }
        mode = nextMode;
        root.querySelectorAll('[data-editor-mode]').forEach((pill) => {
            pill.classList.toggle('selected', pill.dataset.editorMode === mode);
        });
        root.querySelector('[data-action="clear-answer"]').hidden = mode !== 'answer';
        rebuildBoard();
        updateHint();
    }

    function updateHint() {
        const hint = root.querySelector('[data-role="hint"]');
        if (!hint) {
            return;
        }
        if (mode === 'answer') {
            if (path?.finished) {
                hint.textContent = '已画到出口，保存时会附带这份答案';
            } else if (path?.distance) {
                hint.textContent = '继续画到右下角出口才算完整答案（保存时按无答案处理）';
            } else {
                hint.textContent = '从左上角圆点开始拖动/滑动/方向键画答案，可不画（无答案题）';
            }
        } else {
            hint.textContent = '点任意格子设置类型、文字和邻边路名';
        }
    }

    function attachAnswerInputs() {
        path = replayedPath();
        board.updateUserLine(path.queue);
        board.userAnimator?.snap?.();

        const syncLine = (partial = null) => {
            board.updateUserLine(path.queue, partial);
            answerDraft = [...path.queue];
            updateHint();
        };
        const answerActions = {
            move(direction) {
                if (path.step(direction)) {
                    syncLine();
                } else if (path.distance &&
                    (direction + 2) % 4 === path.queue[path.distance - 1]) {
                    path.back();
                    syncLine();
                }
            },
            undo() {
                path.back();
                syncLine();
            },
            clear() {
                path.clear();
                syncLine();
            },
            submit() {},
            changeMap() {},
            showAnswer() {},
            hideAnswer() {},
        };

        const detachKeyboard = attachKeyboard(answerActions);
        const detachPointer = attachPointer(board.svg, path, {
            onUpdate: (partial) => syncLine(partial),
            onSubmit: () => {},
            getSensitivity,
        });
        let swipe = null;
        if (isMobileDevice()) {
            swipe = createSwipeDetector(answerActions, getSensitivity);
            swipe.addEventListener();
        }
        detachAnswerInputs = () => {
            detachKeyboard();
            detachPointer();
            swipe?.removeEventListener();
        };
    }

    // ===== 格子设置弹窗 =====

    function charOptionsFor(type) {
        const t = type[0];
        if (t >= CUSTOM_TYPE_BASE) {
            return palette[t - CUSTOM_TYPE_BASE]?.chars ?? [];
        }
        if (t >= 7 && t <= 12) {
            return CELL_NAMES[t - 7];
        }
        if (t === 14) {
            return LETTER_NAMES;
        }
        return [];
    }

    function ensurePaletteEntry(color) {
        const key = color.toLowerCase();
        let index = palette.findIndex(entry => entry.color.toLowerCase() === key);
        if (index === -1) {
            palette.push({ color, chars: [] });
            index = palette.length - 1;
        }
        return index;
    }

    function typePills(pendingType) {
        const pills = [];
        const selected = (t) => pendingType[0] === t ? ' selected' : '';
        pills.push(`<button type="button" class="mode-pill${pendingType[0] === 0 && !pendingType[1] ? ' selected' : ''}" data-cell-type="0" data-cell-sub="0">空白</button>`);
        pills.push(`<button type="button" class="mode-pill${pendingType[0] === 0 && pendingType[1] ? ' selected' : ''}" data-cell-type="0" data-cell-sub="1">灰底</button>`);
        for (const t of COLLEGE_TYPES) {
            pills.push(`
                <button type="button" class="mode-pill swatch${selected(t)}" data-cell-type="${t}"
                    title="${TYPE_HINTS[t]}"
                    style="--swatch: ${CELL_COLORS[t - 7]}">${TYPE_LABELS[t]}</button>`);
        }
        pills.push(`<button type="button" class="mode-pill swatch${selected(11)}" data-cell-type="11" style="--swatch: ${CELL_COLORS[4]}">红专</button>`);
        pills.push(`<button type="button" class="mode-pill swatch${selected(12)}" data-cell-type="12" style="--swatch: ${CELL_COLORS[5]}">理实</button>`);
        pills.push(`<button type="button" class="mode-pill${selected(14)}" data-cell-type="14">字母 USTC</button>`);
        palette.forEach((entry, index) => {
            const t = CUSTOM_TYPE_BASE + index;
            pills.push(`
                <button type="button" class="mode-pill swatch${selected(t)}" data-cell-type="${t}"
                    style="--swatch: ${escapeHtml(entry.color)}">自定义</button>`);
        });
        pills.push(`
            <label class="editor-color-add">
                <input type="color" value="#4a9e6b" data-role="new-color">
                <button type="button" class="mode-pill" data-action="add-color">＋新颜色</button>
            </label>`);
        return pills.join('');
    }

    function charSection(pendingType) {
        const options = charOptionsFor(pendingType);
        if (pendingType[0] === 0) {
            return '<p class="mode-summary">空白/灰底格没有文字。</p>';
        }
        const buttons = options.map((char, index) => `
            <button type="button" class="mode-pill${pendingType[1] === index ? ' selected' : ''}"
                data-cell-char="${index}">${escapeHtml(char)}</button>`).join('');
        const customizer = pendingType[0] === 11 || pendingType[0] === 12 || pendingType[0] === 14
            ? ''
            : `
                <div class="editor-inline-add">
                    <input type="text" maxlength="2" placeholder="自定义字" data-role="new-char">
                    <button type="button" class="mode-pill" data-action="add-char">添加</button>
                </div>`;
        return `
            <div class="mode-pill-row">${buttons}
                <button type="button" class="mode-pill" data-action="random-char">随机</button>
            </div>
            ${customizer}
        `;
    }

    // 每条邻边：[label, x, y, orient, 可用]；orient 0 横路（上边）1 竖路（左边）
    function edgeSlots(i, j) {
        return [
            ['上边', i, j, 0, true],
            ['左边', i, j, 1, true],
            ['下边', i, j + 1, 0, j + 1 < h],
            ['右边', i + 1, j, 1, i + 1 < w],
        ];
    }

    function roadNameOptions(orient, selectedIdx) {
        const base = ROAD_NAMES[orient].map((roadName, index) =>
            `<option value="${index}"${selectedIdx === index ? ' selected' : ''}>${escapeHtml(roadName)}</option>`);
        const custom = roadNames.map((roadName, index) => {
            const value = CUSTOM_ROAD_BASE + index;
            return `<option value="${value}"${selectedIdx === value ? ' selected' : ''}>${escapeHtml(roadName)}（自定义）</option>`;
        });
        return [...base, ...custom, '<option value="__add">＋自定义路名…</option>'].join('');
    }

    function edgeRows(pendingEdges) {
        return pendingEdges.map((edge, index) => {
            if (!edge.available) {
                return `
                    <div class="editor-edge-row disabled">
                        <span>${edge.label}</span>
                        <small>棋盘边缘外侧不可设路名</small>
                    </div>`;
            }
            const addRow = edge.adding ? `
                <div class="editor-inline-add" data-edge-add>
                    <input type="text" maxlength="6" placeholder="自定义路名" data-role="new-road">
                    <button type="button" class="mode-pill" data-edge-add-confirm>添加</button>
                </div>` : '';
            return `
                <div class="editor-edge-row" data-edge-index="${index}">
                    <label>
                        <input type="checkbox" data-edge-on ${edge.on ? 'checked' : ''}>
                        <span>${edge.label}路名</span>
                    </label>
                    <select data-edge-name ${edge.on ? '' : 'disabled'}>${roadNameOptions(edge.orient, edge.idx)}</select>
                    <button type="button" class="mode-pill" data-edge-random ${edge.on ? '' : 'disabled'}>随机</button>
                    ${addRow}
                </div>`;
        }).join('');
    }

    function openCellDialog(i, j) {
        const pendingType = [...sign[i][j][2]];
        const pendingEdges = edgeSlots(i, j).map(([label, x, y, orient, available]) => ({
            label,
            x,
            y,
            orient,
            available,
            on: available ? Boolean(sign[x][y][orient][0]) : false,
            idx: available ? sign[x][y][orient][1] : 0,
        }));

        cellDialog = document.createElement('div');
        cellDialog.className = 'editor-dialog-root';
        root.appendChild(cellDialog);

        function renderDialog() {
            cellDialog.innerHTML = `
                <div class="editor-dialog-backdrop"></div>
                <section class="editor-dialog" aria-label="格子设置">
                    <header class="editor-dialog-header">
                        <h3>格子 (${i + 1}, ${j + 1})</h3>
                        <button type="button" class="editor-close" data-action="dialog-cancel" aria-label="取消">${CLOSE_ICON}</button>
                    </header>
                    <div class="editor-dialog-body">
                        <div class="editor-dialog-block">
                            <div class="editor-dialog-label">类型</div>
                            <div class="mode-pill-row">${typePills(pendingType)}</div>
                        </div>
                        <div class="editor-dialog-block">
                            <div class="editor-dialog-label">文字</div>
                            ${charSection(pendingType)}
                        </div>
                        <div class="editor-dialog-block">
                            <div class="editor-dialog-label">邻边路名</div>
                            ${edgeRows(pendingEdges)}
                        </div>
                    </div>
                    <footer class="editor-dialog-actions">
                        <button type="button" class="mode-secondary" data-action="dialog-cancel">取消</button>
                        <button type="button" class="mode-primary" data-action="dialog-apply">应用</button>
                    </footer>
                </section>
            `;
            bindDialog();
        }

        function closeDialog() {
            cellDialog?.remove();
            cellDialog = null;
        }

        function bindDialog() {
            cellDialog.querySelector('.editor-dialog-backdrop').addEventListener('click', closeDialog);
            cellDialog.querySelectorAll('[data-action="dialog-cancel"]').forEach((button) =>
                button.addEventListener('click', closeDialog));
            cellDialog.querySelector('[data-action="dialog-apply"]').addEventListener('click', () => {
                sign[i][j][2] = pendingType;
                for (const edge of pendingEdges) {
                    if (edge.available) {
                        sign[edge.x][edge.y][edge.orient] = [edge.on ? 1 : 0, edge.idx];
                    }
                }
                closeDialog();
                rebuildBoard();
            });

            cellDialog.querySelectorAll('[data-cell-type]').forEach((pill) => {
                pill.addEventListener('click', () => {
                    const t = Number(pill.dataset.cellType);
                    pendingType[0] = t;
                    pendingType[1] = t === 0 ? Number(pill.dataset.cellSub) : 0;
                    renderDialog();
                });
            });
            cellDialog.querySelector('[data-action="add-color"]')?.addEventListener('click', () => {
                const color = cellDialog.querySelector('[data-role="new-color"]').value;
                const index = ensurePaletteEntry(color);
                pendingType[0] = CUSTOM_TYPE_BASE + index;
                pendingType[1] = 0;
                renderDialog();
            });

            cellDialog.querySelectorAll('[data-cell-char]').forEach((pill) => {
                pill.addEventListener('click', () => {
                    pendingType[1] = Number(pill.dataset.cellChar);
                    renderDialog();
                });
            });
            cellDialog.querySelector('[data-action="random-char"]')?.addEventListener('click', () => {
                const options = charOptionsFor(pendingType);
                if (options.length) {
                    pendingType[1] = random(options.length);
                    renderDialog();
                }
            });
            cellDialog.querySelector('[data-action="add-char"]')?.addEventListener('click', () => {
                const input = cellDialog.querySelector('[data-role="new-char"]');
                const char = input.value.trim();
                if (!char) {
                    return;
                }
                // 书院色上加自定义字 → 落到同色的自定义 palette 项（判题按颜色键仍算同一书院）
                if (pendingType[0] >= 7 && pendingType[0] <= 10) {
                    const index = ensurePaletteEntry(CELL_COLORS[pendingType[0] - 7]);
                    palette[index].chars.push(char);
                    pendingType[0] = CUSTOM_TYPE_BASE + index;
                    pendingType[1] = palette[index].chars.length - 1;
                } else if (pendingType[0] >= CUSTOM_TYPE_BASE) {
                    const entry = palette[pendingType[0] - CUSTOM_TYPE_BASE];
                    entry.chars.push(char);
                    pendingType[1] = entry.chars.length - 1;
                }
                renderDialog();
            });

            cellDialog.querySelectorAll('.editor-edge-row[data-edge-index]').forEach((row) => {
                const edge = pendingEdges[Number(row.dataset.edgeIndex)];
                row.querySelector('[data-edge-on]').addEventListener('change', (event) => {
                    edge.on = event.target.checked;
                    renderDialog();
                });
                row.querySelector('[data-edge-name]').addEventListener('change', (event) => {
                    if (event.target.value === '__add') {
                        edge.adding = true;
                        renderDialog();
                        return;
                    }
                    edge.adding = false;
                    edge.idx = Number(event.target.value);
                });
                row.querySelector('[data-edge-random]').addEventListener('click', () => {
                    edge.adding = false;
                    edge.idx = random(ROAD_NAMES[edge.orient].length);
                    renderDialog();
                });
                row.querySelector('[data-edge-add-confirm]')?.addEventListener('click', () => {
                    const input = row.querySelector('[data-role="new-road"]');
                    const roadName = input.value.trim().slice(0, 6);
                    if (roadName) {
                        roadNames.push(roadName);
                        edge.idx = CUSTOM_ROAD_BASE + roadNames.length - 1;
                    }
                    edge.adding = false;
                    renderDialog();
                });
            });
        }

        renderDialog();
    }

    // ===== 生命周期 =====

    function close() {
        detachAnswerInputs?.();
        detachAnswerInputs = null;
        board?.destroy();
        board = null;
        offThemeChange();
        window.removeEventListener('resize', onResize);
        cellDialog?.remove();
        cellDialog = null;
        root.remove();
        onClose?.();
    }

    if (sign) {
        renderEditor();
    } else {
        renderSetup();
    }

    return { close };
}
