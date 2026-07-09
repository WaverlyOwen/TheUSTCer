"use strict";

import assert from 'node:assert/strict';
import test from 'node:test';

import {
        TIMED_START_LEVEL,
    ENDLESS_RAMP_END,
    endlessSizeForQuestion,
    challengeBuildingsSupported,
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
        buildings: false,
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

test('教学楼在大盘保持可用，且旧存档 letters 字段迁移为 buildings', () => {
    const big = normalizeChallengeConfig({ width: 36, height: 36, letters: true });
    assert.equal(challengeBuildingsSupported(big), true);
    assert.equal(big.buildings, true);

    const legacyOff = normalizeChallengeConfig({ width: 10, height: 10, letters: false, colleges: true });
    assert.equal(legacyOff.buildings, false);
});

test('challengeGenerationOptions follows clue toggles and difficulty', () => {
    const config = normalizeChallengeConfig({
        width: 12,
        height: 8,
        buildings: true,
        colleges: false,
        pairs: true,
        roads: false,
        difficulty: 'hard',
    });
    const options = challengeGenerationOptions(config);

    assert.equal(options.buildingMode, 'force');
    assert.equal(options.requireAllBuildingFamilies, false);
    assert.equal(options.forceBuildingCount, 2);
    assert.equal(options.collegesEnabled, false);
    assert.equal(options.pairsMode, 'dense');
    assert.equal(options.roadsMode, 'off');
    assert.equal(options.localCoverageWindow, 3);
});

test('challengeGenerationOptions keeps buildings on for any legal challenge size', () => {
    const options = challengeGenerationOptions(normalizeChallengeConfig({
        width: 24,
        height: 24,
        buildings: true,
        colleges: true,
        pairs: false,
        roads: false,
    }));
    assert.equal(options.buildingMode, 'force');
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

test('无尽爬坡在第 53 题到达 16×16 峰值，之后才进随机段', () => {
    assert.deepEqual(endlessSizeForQuestion(1), [3, 3]);
    assert.deepEqual(endlessSizeForQuestion(52), [15, 15]);
    // 回归：此前 `<` 把峰值题排除在爬坡外，16×16 永远不出现
    assert.deepEqual(endlessSizeForQuestion(ENDLESS_RAMP_END), [16, 16]);
    // 随机段：两维独立取 [8, 16]
    assert.deepEqual(endlessSizeForQuestion(ENDLESS_RAMP_END + 1, () => 0), [8, 8]);
    assert.deepEqual(endlessSizeForQuestion(ENDLESS_RAMP_END + 1, (span) => span - 1), [16, 16]);
});
