"use strict";

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    challengeGenerationOptions,
    formatDuration,
    normalizeChallengeConfig,
    unlocksForLevel,
} from '../src/core/game-state.js';
import { gpaValueForLevel } from '../src/core/level.js';

test('normalizeChallengeConfig keeps at least one clue family enabled', () => {
    const config = normalizeChallengeConfig({
        width: 99,
        height: 2,
        letters: false,
        colleges: false,
        pairs: false,
        roads: false,
        difficulty: 'unknown',
    });

    assert.equal(config.width, 36);
    assert.equal(config.height, 4);
    assert.equal(config.colleges, true);
    assert.equal(config.difficulty, 'standard');
});

test('challengeGenerationOptions follows clue toggles and difficulty', () => {
    const config = normalizeChallengeConfig({
        width: 12,
        height: 8,
        letters: true,
        colleges: false,
        pairs: true,
        roads: false,
        difficulty: 'hard',
    });
    const options = challengeGenerationOptions(config);

    assert.equal(options.letterMode, 'force');
    assert.equal(options.requireAllLetterFamilies, false);
    assert.equal(options.forceLetterCount, 1);
    assert.equal(options.collegesEnabled, false);
    assert.equal(options.pairsMode, 'dense');
    assert.equal(options.roadsMode, 'off');
    assert.equal(options.localCoverageWindow, 3);
});

test('unlocks turn on in GPA threshold order', () => {
    let timedLevel = null;
    let challengeLevel = null;
    for (let level = 0; level < 200; level++) {
        const unlocks = unlocksForLevel(level);
        if (timedLevel === null && unlocks.timed) {
            timedLevel = level;
        }
        if (challengeLevel === null && unlocks.challenge) {
            challengeLevel = level;
        }
    }

    assert.notEqual(timedLevel, null);
    assert.notEqual(challengeLevel, null);
    assert.ok(timedLevel < challengeLevel);
    assert.ok(gpaValueForLevel(timedLevel) >= 3.0);
    assert.ok(gpaValueForLevel(challengeLevel) >= 3.7);
});

test('formatDuration supports mm:ss and hh:mm:ss output', () => {
    assert.equal(formatDuration(125000, false), '02:05');
    assert.equal(formatDuration(3723000), '01:02:03');
});
