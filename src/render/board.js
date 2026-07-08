"use strict";

import { PathAnimator } from './animator.js';
import { boardPalette } from '../lib/theme.js';
import { LETTER_NAMES } from '../core/letters.js';
import {
    CELL_NAMES,
    CUSTOM_ROAD_BASE,
    CUSTOM_TYPE_BASE,
    ROAD_NAMES,
    readableTextColor,
} from '../core/puzzle-io.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const FAIL_FLASH_STEPS = [true, false, true, false, true, false, true, false];
const FAIL_FLASH_INTERVAL_MS = 120;
const FAIL_FLASH_DURATION_MS = FAIL_FLASH_STEPS.length * FAIL_FLASH_INTERVAL_MS + 120;

function svgElement(tag, attributes = {}) {
    const element = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes)) {
        element.setAttribute(name, value);
    }
    return element;
}

function borderD(size) {
    const [w, h] = size;
    return `M 0 0
         L ${w * 50 - 10} 0
         A 20 20 0 0 1 ${w * 50 + 10} 20
         L ${w * 50 + 10} ${h * 50 - 10}
         A 10 10 0 0 0 ${w * 50 + 20} ${h * 50}
         L ${w * 50 + 40} ${h * 50}
         A 5 5 0 0 1 ${w * 50 + 40} ${h * 50 + 10}
         L 20 ${h * 50 + 10}
         A 20 20 0 0 1 0 ${h * 50 - 10}
         L 0 0
         Z`;
}

export class BoardView {
    constructor(puzzle, theme, { container = null, svgId = 'problem' } = {}) {
        this.puzzle = puzzle;
        this.theme = theme;
        this.container = container;
        // SVG fill/stroke 是属性不吃 CSS 变量，深浅色题板用 JS 侧调色板；
        // 切主题时由 main.js 重建 BoardView
        this.palette = boardPalette();
        const [w, h] = puzzle.size;

        this.svg = svgElement('svg', {
            id: svgId,
            viewBox: `-30 -30 ${(w + 2) * 50} ${(h + 1) * 50}`,
        });
        this.svg.classList.add('board');
        this.applyScale();

        this.svg.appendChild(svgElement('path', {
            d: borderD(puzzle.size),
            fill: this.palette.boardFill,
            stroke: this.palette.stroke,
            'stroke-width': '2',
        }));

        const cellG = svgElement('g');
        const textG = svgElement('g');
        const roadG = svgElement('g');
        this.drawSigns(cellG, textG, roadG);
        this.svg.appendChild(cellG);
        this.svg.appendChild(textG);
        this.svg.appendChild(roadG);

        this.answerLine = svgElement('path', {
            stroke: theme.lightColor,
            'stroke-width': '8',
            'stroke-linecap': 'round',
            fill: 'none',
        });
        this.userLine = svgElement('path', {
            stroke: theme.darkColor,
            'stroke-width': '8',
            'stroke-linecap': 'round',
            fill: 'none',
        });
        this.userLine.classList.add('user-line');
        this.svg.appendChild(this.answerLine);
        this.svg.appendChild(this.userLine);
        this.userAnimator = new PathAnimator(this.userLine);
        this.answerAnimator = new PathAnimator(this.answerLine);

        this.dot = svgElement('circle', {
            cx: '5',
            cy: '5',
            r: '10',
            fill: theme.lightColor,
            stroke: theme.darkColor,
            'stroke-width': '10',
        });
        this.dot.classList.add('dot');
        this.svg.appendChild(this.dot);

        (this.container ?? document.getElementById('board-pan') ?? document.body).appendChild(this.svg);
    }

    // 原 compareCssLengths 会插入临时节点强制布局，这里直接用视口尺寸计算。
    // 基准尺寸写进 dataset 供视口做矢量缩放（真实显示尺寸 = 基准 × zoom，
    // 由 viewport.apply() 写 style 宽高，SVG 矢量重绘保持清晰）。
    applyScale() {
        const [w, h] = this.puzzle.size;
        const vw = window.innerWidth / 100;
        const vh = window.innerHeight / 100;
        const scale = Math.min(
            1,
            (80 * vw) / ((w + 2) * 5 * vh),
            50 / ((h + 1) * 5),
        );
        const width = (w + 2) * 5 * scale * vh;
        const height = (h + 1) * 5 * scale * vh;
        this.svg.dataset.baseWidth = String(width);
        this.svg.dataset.baseHeight = String(height);
        this.svg.style.width = `${width}px`;
        this.svg.style.height = `${height}px`;
    }

    drawSigns(cellG, textG, roadG) {
        const { sign, size } = this.puzzle;
        // 保存引用供错误定位高亮（判定格反色、路名闪红）
        this.cellRects = Array.from({ length: size[0] }, () => Array(size[1]).fill(null));
        this.cellTexts = Array.from({ length: size[0] }, () => Array(size[1]).fill(null));
        this.roadTexts = new Map();
        this.failHighlights = [];
        this.failTimers = [];
        for (let i = 0; i < size[0]; i++) {
            for (let j = 0; j < size[1]; j++) {
                if (sign[i][j][0][0]) {
                    this.drawRoad(roadG, [i, j], [5, sign[i][j][0][1]]);
                }
                if (sign[i][j][1][0]) {
                    this.drawRoad(roadG, [i, j], [6, sign[i][j][1][1]]);
                }
                this.drawCell(cellG, textG, [i, j], sign[i][j][2]);
            }
        }
    }

    drawRoad(roadG, position, type) {
        const attributes = {
            'text-anchor': 'middle',
            'font-size': 8,
        };
        if (type[0] === 6) {
            attributes.x = 5 + 50 * position[0];
            attributes.y = 30 + 50 * position[1];
            attributes['writing-mode'] = 'vertical-rl';
        } else {
            attributes.x = 30 + 50 * position[0];
            attributes.y = 8 + 50 * position[1];
        }
        const road = svgElement('text', attributes);
        road.setAttribute('fill', this.palette.roadText);
        road.textContent = type[1] >= CUSTOM_ROAD_BASE
            ? (this.puzzle.roadNames?.[type[1] - CUSTOM_ROAD_BASE] ?? '')
            : (ROAD_NAMES[type[0] - 5][type[1]] ?? '');
        roadG.appendChild(road);
        this.roadTexts.set(`${position[0]},${position[1]},${type[0] === 6 ? 1 : 0}`, road);
    }

    drawCell(cellG, textG, position, type) {
        const cell = svgElement('rect', {
            x: 10 + 50 * position[0],
            y: 10 + 50 * position[1],
            width: 40,
            height: 40,
            rx: 10,
            ry: 10,
            stroke: this.palette.stroke,
            'stroke-width': 2,
        });

        let text = null;
        if (type[0]) {
            text = svgElement('text', {
                x: 30 + 50 * position[0],
                y: 41 + 50 * position[1],
                'text-anchor': 'middle',
                'font-size': 30,
            });
            if (type[0] >= CUSTOM_TYPE_BASE) {
                // 自定义色格：颜色/文字来自题目自带的 palette 表
                const entry = this.puzzle.palette?.[type[0] - CUSTOM_TYPE_BASE];
                const color = entry?.color ?? '#888888';
                text.textContent = entry?.chars?.[type[1]] ?? '';
                text.setAttribute('fill', readableTextColor(color));
                cell.setAttribute('fill', color);
            } else if (type[0] === 14) {
                // USTC 字母区块：所在区域必须与字母形状全等
                text.textContent = LETTER_NAMES[type[1]];
                text.setAttribute('font-weight', 'bold');
                text.setAttribute('fill', 'white');
                cell.setAttribute('fill', this.palette.letterCell);
            } else if (type[0] < 11) {
                text.textContent = CELL_NAMES[type[0] - 7][type[1]];
                text.setAttribute('fill', 'white');
                cell.setAttribute('fill', this.palette.cellColors[type[0] - 7]);
            } else {
                text.textContent = CELL_NAMES[type[0] - 7][type[1]];
                text.setAttribute('fill', this.palette.cellColors[type[0] - 7]);
                cell.setAttribute('fill', this.palette.boardFill);
            }
            textG.appendChild(text);
        } else {
            cell.setAttribute('fill', type[1] ? this.palette.shadeCell : this.palette.blankCell);
        }
        cellG.appendChild(cell);
        this.cellRects[position[0]][position[1]] = cell;
        this.cellTexts[position[0]][position[1]] = text;
    }

    updateUserLine(queue, partial = null) {
        this.userAnimator.setState(queue, partial);
    }

    showAnswer() {
        if (!this.puzzle.answer) {
            return;
        }
        this.answerAnimator.setState(this.puzzle.answer.queue);
    }

    hideAnswer() {
        this.answerAnimator.reset();
    }

    winEffect() {
        this.userAnimator.snap();
        this.userLine.classList.remove('fail');
        this.userLine.classList.add('win');
    }

    failEffect(details = null) {
        // 重新触发 CSS 动画；先还原上一次失败的高亮，避免连续失败叠加错乱
        this.clearFailFeedback();
        this.userLine.classList.remove('fail');
        void this.userLine.getBoundingClientRect();
        this.userLine.classList.add('fail');

        if (details) {
            this.prepareFailHighlights(details);
            this.runFailHighlights();
        }

        this.failTimers.push(setTimeout(() => {
            this.userLine.classList.remove('fail');
            this.restoreFailHighlights();
        }, FAIL_FLASH_DURATION_MS));
    }

    prepareFailHighlights(details) {
        const seenCells = new Set();
        const seenRoads = new Set();

        // 违规判定格：前景/背景色来回互换，做成闪动效果
        for (const [i, j] of details.cells ?? []) {
            const key = `${i},${j}`;
            if (seenCells.has(key)) {
                continue;
            }
            seenCells.add(key);

            const rect = this.cellRects[i]?.[j];
            const text = this.cellTexts[i]?.[j];
            if (!rect) {
                continue;
            }
            const rectFill = rect.getAttribute('fill');
            if (text) {
                const textFill = text.getAttribute('fill');
                this.failHighlights.push({
                    set(active) {
                        rect.setAttribute('fill', active ? textFill : rectFill);
                        text.setAttribute('fill', active ? rectFill : textFill);
                    },
                    restore() {
                        rect.setAttribute('fill', rectFill);
                        text.setAttribute('fill', textFill);
                    },
                });
            } else {
                const flashFill = this.palette.letterCell;
                this.failHighlights.push({
                    set(active) {
                        rect.setAttribute('fill', active ? flashFill : rectFill);
                    },
                    restore() {
                        rect.setAttribute('fill', rectFill);
                    },
                });
            }
        }

        // 未穿过的黑色路名：同步闪红
        for (const [i, j, orient] of details.roads ?? []) {
            const key = `${i},${j},${orient}`;
            if (seenRoads.has(key)) {
                continue;
            }
            seenRoads.add(key);

            const road = this.roadTexts.get(key);
            if (!road) {
                continue;
            }
            const roadFill = road.getAttribute('fill');
            const roadOpacity = road.getAttribute('opacity');
            this.failHighlights.push({
                set(active) {
                    if (active) {
                        road.setAttribute('fill', '#d64545');
                        road.setAttribute('opacity', '1');
                    } else {
                        if (roadFill === null) {
                            road.removeAttribute('fill');
                        } else {
                            road.setAttribute('fill', roadFill);
                        }
                        road.setAttribute('opacity', '0.28');
                    }
                },
                restore() {
                    if (roadFill === null) {
                        road.removeAttribute('fill');
                    } else {
                        road.setAttribute('fill', roadFill);
                    }
                    if (roadOpacity === null) {
                        road.removeAttribute('opacity');
                    } else {
                        road.setAttribute('opacity', roadOpacity);
                    }
                },
            });
        }
    }

    runFailHighlights() {
        if (!this.failHighlights.length) {
            return;
        }
        FAIL_FLASH_STEPS.forEach((active, index) => {
            this.failTimers.push(setTimeout(() => {
                for (const highlight of this.failHighlights) {
                    highlight.set(active);
                }
            }, index * FAIL_FLASH_INTERVAL_MS));
        });
    }

    clearFailFeedback() {
        for (const timer of this.failTimers) {
            clearTimeout(timer);
        }
        this.failTimers = [];
        this.restoreFailHighlights();
    }

    restoreFailHighlights() {
        for (const highlight of this.failHighlights) {
            highlight.restore();
        }
        this.failHighlights = [];
    }

    destroy() {
        this.clearFailFeedback();
        this.userLine.classList.remove('fail');
        this.userAnimator.destroy();
        this.answerAnimator.destroy();
        this.svg.remove();
    }
}
