"use strict";

import { matchesLetter } from './letters.js';

// 判题并返回违规明细：
//   cells — 违规判定格（书院颜色冲突/红专理实不成对/字母区域形状不符），供反色高亮
//   roads — 未被穿过的黑色路名 [i, j, orient]（0 横路 1 竖路），供闪红
export function checkSolution(sign, size, userPath) {
    if (!userPath.finished) {
        return { ok: false, unfinished: true, cells: [], roads: [] };
    }

    const groupCount = userPath.group.length;
    const collegeCells = Array.from({ length: groupCount }, () => []);
    const pairCells = Array.from({ length: groupCount }, () => [[], [], [], []]);
    const letterCells = Array.from({ length: groupCount }, () => []);
    const regionCells = Array.from({ length: groupCount }, () => []);
    const badRoads = [];
    const barrier = userPath.createBarrier();

    for (let i = 0; i < size[0]; i++) {
        for (let j = 0; j < size[1]; j++) {
            const group = userPath.groupMap[i][j];
            regionCells[group].push([i, j]);
            const type = sign[i][j][2][0];
            if (type >= 7 && type <= 10) {
                collegeCells[group].push({ cell: [i, j], type });
            } else if (type === 11 || type === 12) {
                pairCells[group][(type - 11) * 2 + sign[i][j][2][1]].push([i, j]);
            } else if (type === 14) {
                letterCells[group].push({ cell: [i, j], letterIndex: sign[i][j][2][1] });
            }

            if (sign[i][j][0][0] && !barrier[i][j][0]) {
                badRoads.push([i, j, 0]);
            }
            if (sign[i][j][1][0] && !barrier[i][j][1]) {
                badRoads.push([i, j, 1]);
            }
        }
    }

    const badCells = [];
    for (let group = 0; group < groupCount; group++) {
        // 书院颜色冲突：一个区域内出现多种颜色的书院
        const collegeTypes = new Set(collegeCells[group].map(entry => entry.type));
        if (collegeTypes.size > 1) {
            badCells.push(...collegeCells[group].map(entry => entry.cell));
        }

        // 红专(11)/理实(12)：同款重复或不成对
        for (const base of [0, 2]) {
            const first = pairCells[group][base];
            const second = pairCells[group][base + 1];
            if (first.length > 1) {
                badCells.push(...first);
            }
            if (second.length > 1) {
                badCells.push(...second);
            }
            if ((first.length > 0) !== (second.length > 0)) {
                badCells.push(...first, ...second);
            }
        }

        // 字母区块：所在区域必须与字母形状全等（固定朝向，不允许旋转/镜像）
        for (const { cell, letterIndex } of letterCells[group]) {
            if (!matchesLetter(regionCells[group], letterIndex)) {
                badCells.push(cell);
            }
        }
    }

    return {
        ok: badCells.length === 0 && badRoads.length === 0,
        cells: badCells,
        roads: badRoads,
    };
}
