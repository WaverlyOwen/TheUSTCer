"use strict";

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    LETTER_FLUSH_SIDES,
    findPlacements,
    hasAllLetterPlacements,
    matchesLetter,
    placementsByLetter,
} from '../src/core/letters.js';

const U_CELLS = [
    [0, 0], [3, 0],
    [0, 1], [3, 1],
    [0, 2], [3, 2],
    [0, 3], [3, 3],
    [0, 4], [1, 4], [2, 4], [3, 4],
];
const S_CELLS = [
    [0, 0], [1, 0], [2, 0], [3, 0],
    [0, 1],
    [0, 2], [1, 2], [2, 2], [3, 2],
    [3, 3],
    [0, 4], [1, 4], [2, 4], [3, 4],
];

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

test('matchesLetter only accepts translated shapes', () => {
    assert.equal(matchesLetter(translate(U_CELLS, 2, 1), 0), true);
    assert.equal(matchesLetter(rotateClockwise(U_CELLS), 0), false);
    assert.equal(matchesLetter(mirrorHorizontally(S_CELLS), 1), false);
});

test('findPlacements only returns single-edge placements on the allowed side', () => {
    const placements = findPlacements([7, 7]);
    assert.ok(placements.length > 0);
    for (const placement of placements) {
        assert.equal(LETTER_FLUSH_SIDES[placement.letterIndex].includes(placement.flushSide), true);
    }
});

test('7x7 is the first size that supports all four letters', () => {
    assert.equal(hasAllLetterPlacements([7, 6]), false);
    assert.equal(hasAllLetterPlacements([7, 7]), true);

    const byLetter = placementsByLetter([7, 7]);
    for (const placements of byLetter) {
        assert.ok(placements.length > 0);
    }
});
