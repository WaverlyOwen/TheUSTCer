"use strict";

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    LETTER_MASKS,
    LETTER_NAMES,
    findPlacements,
    hasAllLetterPlacements,
    matchesLetter,
    placementsByLetter,
} from '../src/core/letters.js';

// 从掩码（x=区域格）还原字母的规范化格子集
function maskCells(mask) {
    const cells = [];
    for (let row = 0; row < mask.length; row++) {
        for (let col = 0; col < mask[row].length; col++) {
            if (mask[row][col] === 'x') {
                cells.push([col, row]);
            }
        }
    }
    return cells;
}

function translate(cells, dx, dy) {
    return cells.map(([x, y]) => [x + dx, y + dy]);
}

function rotateClockwise(cells) {
    const maxY = Math.max(...cells.map(([, y]) => y));
    return cells.map(([x, y]) => [maxY - y, x]);
}

function mirrorHorizontally(cells) {
    const maxX = Math.max(...cells.map(([x]) => x));
    return cells.map(([x, y]) => [maxX - x, y]);
}

test('matchesLetter accepts translations, rejects rotation and mirror', () => {
    const uCells = maskCells(LETTER_MASKS[0]);
    const sCells = maskCells(LETTER_MASKS[1]);
    assert.equal(matchesLetter(translate(uCells, 2, 1), 0), true);
    assert.equal(matchesLetter(rotateClockwise(uCells), 0), false);
    assert.equal(matchesLetter(mirrorHorizontally(sCells), 1), false);
});

test('every placement is geometrically the correct letter', () => {
    for (const size of [[6, 6], [8, 8], [10, 10]]) {
        for (const placement of findPlacements(size)) {
            assert.equal(matchesLetter(placement.cells, placement.letterIndex), true);
        }
    }
});

test('placements touch a board edge; strict placements touch exactly one', () => {
    const byLetter = placementsByLetter([9, 9]);
    for (const placements of byLetter) {
        assert.ok(placements.length > 0);
        // 9×9 足够大，应全部是单边贴放
        for (const placement of placements) {
            assert.equal(placement.sides.length, 1);
        }
    }
});

test('all four USTC letters are available on modest boards', () => {
    assert.equal(hasAllLetterPlacements([6, 6]), true);
    const byLetter = placementsByLetter([7, 7]);
    // 均衡：四个字母在同一尺寸下放置数相同
    const counts = byLetter.map((placements) => placements.length);
    assert.equal(new Set(counts).size, 1);
    assert.equal(LETTER_NAMES.length, 4);
});
