"use strict";

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    MAX_CHALLENGE_LETTER_AREA,
    TIMED_START_LEVEL,
    challengeLettersSupported,
    challengeGenerationOptions,
    formatDuration,
    MODE_CLASSIC,
    MODE_TIMED,
    normalizeChallengeConfig,
    shouldBlockInteraction,
    timedSession,
    unlocksForLevel,
} from '../src/core/game-state.js';
import { gpaValueForLevel, sizeForLevel } from '../src/core/level.js';

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

test('normalizeChallengeConfig disables letters when the board is too large', () => {
    const config = normalizeChallengeConfig({
        width: 23,
        height: 22,
        letters: true,
        colleges: false,
        pairs: true,
        roads: false,
    });

    assert.equal(challengeLettersSupported(config), false);
    assert.equal(config.width * config.height > MAX_CHALLENGE_LETTER_AREA, true);
    assert.equal(config.letters, false);
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

test('challengeGenerationOptions never advertises letters when size rules disallow them', () => {
    const options = challengeGenerationOptions(normalizeChallengeConfig({
        width: 24,
        height: 24,
        letters: true,
        colleges: true,
        pairs: false,
        roads: false,
        difficulty: 'standard',
    }));

    assert.equal(options.letterMode, 'none');
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

test('classic completion only blocks input while the ending overlay is visible', () => {
    assert.equal(shouldBlockInteraction({
        currentMode: MODE_CLASSIC,
        endingVisible: false,
    }), false);
    assert.equal(shouldBlockInteraction({
        currentMode: MODE_CLASSIC,
        endingVisible: true,
    }), true);
    assert.equal(shouldBlockInteraction({
        currentMode: MODE_TIMED,
        timedEnded: true,
    }), true);
});

test('timed mode starts from the 3x3 board tier', () => {
    const run = timedSession(10);

    assert.equal(run.level, TIMED_START_LEVEL);
    assert.deepEqual(sizeForLevel(run.level), [3, 3]);
    assert.equal(run.cleared, 0);
});
