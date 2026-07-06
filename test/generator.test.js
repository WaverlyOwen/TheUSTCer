"use strict";

import assert from 'node:assert/strict';
import test from 'node:test';

import { generatePuzzle, hasLocalLineCoverage } from '../src/core/generator.js';

test('generator keeps letters disabled before all four families fit', () => {
    for (let i = 0; i < 50; i++) {
        const puzzle = generatePuzzle([7, 6], 55);
        assert.equal(puzzle.letters.length, 0);
    }
});

test('generator eventually produces all four letters once 7x7 opens', () => {
    const seen = new Set();
    for (let i = 0; i < 1200 && seen.size < 4; i++) {
        const puzzle = generatePuzzle([9, 9], 80);
        for (const { letterIndex } of puzzle.letters) {
            seen.add(letterIndex);
        }
    }
    assert.deepEqual([...seen].sort((a, b) => a - b), [0, 1, 2, 3]);
});

test('double-letter puzzles never repeat the same letter', () => {
    let sawDoubleLetterPuzzle = false;
    for (let i = 0; i < 400; i++) {
        const puzzle = generatePuzzle([10, 9], 85);
        if (puzzle.letters.length === 2) {
            sawDoubleLetterPuzzle = true;
            assert.notEqual(puzzle.letters[0].letterIndex, puzzle.letters[1].letterIndex);
        }
    }
    assert.equal(sawDoubleLetterPuzzle, true);
});

test('generated answers satisfy the 4x4 local line coverage gate', () => {
    for (const [size, level] of [
        [[7, 7], 60],
        [[9, 9], 80],
        [[10, 9], 85],
    ]) {
        for (let i = 0; i < 40; i++) {
            const puzzle = generatePuzzle(size, level);
            assert.equal(hasLocalLineCoverage(puzzle.answer, size), true);
        }
    }
});
