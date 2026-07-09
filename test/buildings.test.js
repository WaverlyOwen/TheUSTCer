"use strict";

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BUILDING_MASKS,
    BUILDING_NAMES,
    comboShapes,
    matchesBuilding,
    placementsByBuilding,
    compatiblePlacements,
} from '../src/core/buildings.js';
import { Path } from '../src/core/path.js';
import { blankSign } from '../src/core/puzzle-io.js';
import { checkSolution } from '../src/core/validator.js';
import { TUTORIAL_CHAPTERS } from '../src/ui/tutorial-data.js';

test('五栋楼命名齐全且都能塞进 2×3', () => {
    assert.equal(BUILDING_MASKS.length, 5);
    assert.equal(BUILDING_NAMES.length, 5);
    for (const mask of BUILDING_MASKS) {
        assert.ok(mask.length <= 3);
        assert.ok(Math.max(...mask.map(row => row.length)) <= 3);
    }
});

test('matchesBuilding 接受旋转与镜像，拒绝异形', () => {
    // 五教（1×3 直线）竖排也算
    assert.equal(matchesBuilding([[2, 0], [2, 1], [2, 2]], 4), true);
    assert.equal(matchesBuilding([[0, 0], [1, 0], [2, 0]], 4), true);
    // 三教 Z 的镜像（S 形）也算
    assert.equal(matchesBuilding([[0, 0], [1, 0], [1, 1], [2, 1]], 2), true);
    // 四教方块不等于直线
    assert.equal(matchesBuilding([[0, 0], [1, 0], [2, 0]], 3), false);
    // 一教（凹）不能长着二教（凸）的样子
    assert.equal(matchesBuilding([[1, 0], [0, 1], [1, 1], [2, 1]], 0), false);
    assert.equal(matchesBuilding([[1, 0], [0, 1], [1, 1], [2, 1]], 1), true);
});

test('2×3 小盘已有可用放置，大盘放置互不干扰可组合', () => {
    const tiny = placementsByBuilding([3, 2]);
    assert.ok(tiny.some(placements => placements.length > 0));

    const roomy = placementsByBuilding([9, 9]);
    assert.ok(roomy.every(placements => placements.length > 0));
    // 至少能找到一对互容放置（不同楼）
    let compatible = false;
    outer: for (const a of roomy[0]) {
        for (const b of roomy[4]) {
            if (compatiblePlacements(a, b)) {
                compatible = true;
                break outer;
            }
        }
    }
    assert.equal(compatible, true);
});

test('教程全部棋盘示例的路径与判定自洽', () => {
    for (const chapter of TUTORIAL_CHAPTERS) {
    for (const slide of chapter.slides) {
        if (!slide.board || slide.bad) {
            continue;
        }
        const { w, h, cells, moves } = slide.board;
        const sign = blankSign(w, h);
        for (const [i, j, type, sub] of cells) {
            sign[i][j][2] = [type, sub];
        }
        const path = new Path([w, h]);
        for (const move of moves) {
            assert.equal(path.step(move), true, `${slide.caption.slice(0, 8)} 路径非法`);
        }
        assert.equal(path.finished, true, `${slide.caption.slice(0, 8)} 未到出口`);
        if (slide.board.bad) {
            continue;
        }
        const result = checkSolution(sign, [w, h], path);
        assert.equal(result.ok, true, `${slide.caption.slice(0, 8)} 判定失败: ${JSON.stringify(result)}`);
    }
    }
});

test('组合拼形整体归一化：无负坐标，parts 恰好铺满拼形', () => {
    // 回归：此前 comboShapes 存原始并集（dx/dy 可到 -3），
    // tryComboPlacement 按 0 基算 maxX/maxY 会把楼摆出棋盘
    for (const indices of [[0, 1], [3, 4], [0, 3, 4]]) {
        const { shapes } = comboShapes(indices);
        assert.ok(shapes.length > 0);
        for (const { cells, parts } of shapes) {
            assert.equal(Math.min(...cells.map(([x]) => x)), 0);
            assert.equal(Math.min(...cells.map(([, y]) => y)), 0);
            assert.equal(parts.length, indices.length);
            const cellKeys = new Set(cells.map(cell => cell.join(',')));
            const partCells = parts.flat();
            assert.equal(partCells.length, cells.length);
            for (const cell of partCells) {
                assert.ok(cellKeys.has(cell.join(',')), `part 格子 ${cell} 不在拼形内`);
            }
        }
    }
});
