"use strict";

import assert from 'node:assert/strict';
import test from 'node:test';

import { generatePuzzle, hasLocalLineCoverage } from '../src/core/generator.js';
import { checkSolution } from '../src/core/validator.js';

test('generator eventually produces all five buildings on a modest board', () => {
    const seen = new Set();
    for (let i = 0; i < 1200 && seen.size < 5; i++) {
        const puzzle = generatePuzzle([9, 9], 80);
        for (const { buildingIndex } of puzzle.buildings) {
            seen.add(buildingIndex);
        }
    }
    assert.deepEqual([...seen].sort((a, b) => a - b), [0, 1, 2, 3, 4]);
});

test('multi-building puzzles never repeat the same building', () => {
    let sawMultiBuildingPuzzle = false;
    for (let i = 0; i < 400; i++) {
        const puzzle = generatePuzzle([10, 9], 85);
        if (puzzle.buildings.length >= 2) {
            sawMultiBuildingPuzzle = true;
            const indices = puzzle.buildings.map(({ buildingIndex }) => buildingIndex);
            assert.equal(new Set(indices).size, indices.length);
        }
    }
    assert.equal(sawMultiBuildingPuzzle, true);
});

test('buildings can appear on small boards at low levels', () => {
    let sawBuilding = false;
    for (let i = 0; i < 300 && !sawBuilding; i++) {
        const puzzle = generatePuzzle([3, 2], 15);
        sawBuilding = puzzle.buildings.length > 0;
    }
    assert.equal(sawBuilding, true);
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

test('generated puzzles stay self-consistent and validate with their own answers', () => {
    for (const [size, level] of [
        [[7, 7], 60],
        [[10, 9], 85],
        [[16, 12], 100],
    ]) {
        for (let i = 0; i < 12; i++) {
            const puzzle = generatePuzzle(size, level);
            const result = checkSolution(puzzle.sign, puzzle.size, puzzle.answer);
            assert.equal(result.ok, true);
        }
    }
});

test('hard challenge generation keeps dense local coverage on medium boards', () => {
    for (let i = 0; i < 20; i++) {
        const puzzle = generatePuzzle([12, 10], 100, {
            buildingMode: 'balanced',
            localCoverageWindow: 3,
            mutationWindow: 2,
            mutationPasses: 3,
            mutationMinTouches: 3,
            mutationMinimumCoverage: 0.42,
            normalCandidateAttempts: 52,
            normalCandidateLimit: 6,
            difficultyValue: 0.95,
        });
        assert.equal(hasLocalLineCoverage(puzzle.answer, puzzle.size, 3), true);
        const coverage = puzzle.answer.distance / ((puzzle.size[0] + 1) * (puzzle.size[1] + 1));
        assert.ok(coverage >= 0.38);
    }
});
