"use strict";

import { LETTER_MASKS, LETTER_NAMES, findPlacements } from '../core/letters.js';

const BOARD_SIZE = [7, 7];
const CELL = 22;
const PADDING = 14;
const REGION_FILL = '#dfe5f2';
const MARKER_FILL = '#3a3f4b';
const PATH_STROKE = '#38578a';
const BORDER_STROKE = '#1f2430';
const EDGE_TEXT = {
    top: '上边',
    bottom: '底边',
    left: '左边',
    right: '右边',
};

function renderMaskSvg(mask, label) {
    const width = mask[0].length;
    const height = mask.length;
    const svgWidth = width * 14;
    const svgHeight = height * 14 + 18;
    const cells = [];
    for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
            cells.push(`
                <rect
                    x="${col * 14}"
                    y="${row * 14}"
                    width="12"
                    height="12"
                    rx="3"
                    ry="3"
                    fill="${mask[row][col] === 'x' ? MARKER_FILL : '#eceff4'}"
                    stroke="#c9ced8"
                    stroke-width="1"
                ></rect>`);
        }
    }
    return `
        <svg width="9vh" height="11vh" viewBox="0 0 ${svgWidth} ${svgHeight}">
            ${cells.join('')}
            <text x="${svgWidth / 2}" y="${height * 14 + 14}" text-anchor="middle" font-size="12" font-weight="bold" fill="${MARKER_FILL}">${label}</text>
        </svg>`;
}

function renderBoardExample(letterIndex) {
    const placement = findPlacements(BOARD_SIZE).find(entry => entry.letterIndex === letterIndex);
    const [w, h] = BOARD_SIZE;
    const width = w * CELL;
    const height = h * CELL;
    const markerCell = placement.cells[Math.floor(placement.cells.length / 2)];
    const regionKeys = new Set(placement.cells.map(([x, y]) => `${x},${y}`));
    const pathPoints = placement.chainNodes
        .map(([x, y]) => `${PADDING + x * CELL},${PADDING + y * CELL}`)
        .join(' ');

    const cells = [];
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const key = `${x},${y}`;
            let fill = (x + y) % 2 ? '#f2f3f5' : 'white';
            if (regionKeys.has(key)) {
                fill = REGION_FILL;
            }
            if (x === markerCell[0] && y === markerCell[1]) {
                fill = MARKER_FILL;
            }
            cells.push(`
                <rect
                    x="${PADDING + x * CELL + 2}"
                    y="${PADDING + y * CELL + 2}"
                    width="${CELL - 4}"
                    height="${CELL - 4}"
                    rx="6"
                    ry="6"
                    fill="${fill}"
                    stroke="#d8dce4"
                    stroke-width="1"
                ></rect>`);
        }
    }

    return `
        <svg width="20vh" height="20vh" viewBox="0 0 ${width + PADDING * 2} ${height + PADDING * 2}" class="example">
            <rect
                x="${PADDING}"
                y="${PADDING}"
                width="${width}"
                height="${height}"
                rx="18"
                ry="18"
                fill="white"
                stroke="${BORDER_STROKE}"
                stroke-width="2"
            ></rect>
            ${cells.join('')}
            <polyline
                points="${pathPoints}"
                fill="none"
                stroke="${PATH_STROKE}"
                stroke-width="7"
                stroke-linecap="round"
                stroke-linejoin="round"
            ></polyline>
            <text
                x="${PADDING + markerCell[0] * CELL + CELL / 2}"
                y="${PADDING + markerCell[1] * CELL + CELL * 0.72}"
                text-anchor="middle"
                font-size="18"
                font-weight="bold"
                fill="white"
            >${LETTER_NAMES[letterIndex]}</text>
        </svg>`;
}

function renderOverviewSlide() {
    return `
        <div class="slide">
            <div style="display:flex;justify-content:center;align-items:flex-start;gap:0.8rem;flex-wrap:wrap;">
                ${LETTER_MASKS.map((mask, index) => renderMaskSvg(mask, LETTER_NAMES[index])).join('')}
            </div>
            <p>字母题里的 U / S / T / C 都是固定朝向：不可旋转，不可镜像，而且整个字母不能同时贴住两条边（棋盘太小放不下单边时才有豁免）。</p>
        </div>`;
}

function renderExampleSlide(letterIndex) {
    const placement = findPlacements(BOARD_SIZE).find(entry => entry.letterIndex === letterIndex);
    return `
        <div class="slide">
            ${renderBoardExample(letterIndex)}
            <p>示例 ${LETTER_NAMES[letterIndex]}：路径和边框围出的浅色区域恰好是 ${LETTER_NAMES[letterIndex]}，并且这个字母只贴了${EDGE_TEXT[placement.flushSide]}这一条边。</p>
        </div>`;
}

export function createLetterTutorialSlides() {
    return [
        renderOverviewSlide(),
        ...LETTER_NAMES.map((_, index) => renderExampleSlide(index)),
    ].join('');
}
