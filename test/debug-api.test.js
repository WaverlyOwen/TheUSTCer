"use strict";

import assert from 'node:assert/strict';
import test from 'node:test';

import { attachDebugGlobals, createDebugApi } from '../src/debug/api.js';

test('attachDebugGlobals only exposes debug helpers in dev mode', () => {
    const target = {};
    const api = { ping() {} };

    assert.equal(attachDebugGlobals(target, api, false), false);
    assert.equal('__ustcerDebug' in target, false);

    assert.equal(attachDebugGlobals(target, api, true), true);
    assert.equal(target.__ustcerDebug, api);
});

test('createDebugApi exposes stable helper methods and awaits async rerolls', async () => {
    const calls = [];
    let currentLevel = 3;
    const puzzleQueue = [
        {
            size: [7, 7],
            buildings: [{ buildingIndex: 0, markerCell: [0, 4] }],
            answer: { queue: [0, 1, 0] },
        },
        {
            size: [7, 7],
            buildings: [{ buildingIndex: 1, markerCell: [1, 1] }],
            answer: { queue: [2, 3] },
        },
    ];
    let puzzleIndex = 0;
    const userPath = {
        distance: 0,
        finished: false,
        clearCalled: false,
        clear() {
            this.clearCalled = true;
            this.distance = 0;
            this.finished = false;
        },
        step() {
            this.distance++;
            this.finished = this.distance === puzzleQueue[puzzleIndex].answer.queue.length;
            return true;
        },
    };
    const level = {
        get value() {
            return currentLevel;
        },
        size() {
            return [7, 7];
        },
        set(nextLevel) {
            currentLevel = nextLevel;
            calls.push(['setLevel', nextLevel]);
        },
    };

    const api = createDebugApi({
        level,
        actions: {
            submit() {
                calls.push(['submit']);
            },
        },
        getPuzzle: () => puzzleQueue[puzzleIndex],
        getUserPath: () => userPath,
        getBusy: () => false,
        reloadBoard: async (options) => {
            calls.push(['reload', options]);
            await Promise.resolve();
            puzzleIndex = Math.min(puzzleIndex + 1, puzzleQueue.length - 1);
        },
        syncUserLine: () => calls.push(['syncUserLine']),
        showAnswer: () => calls.push(['showAnswer']),
        hideAnswer: () => calls.push(['hideAnswer']),
        playEnding: () => calls.push(['playEnding']),
        resetProgress: () => calls.push(['resetProgress']),
    });

    assert.equal(typeof api.help, 'function');
    assert.equal(typeof api.state, 'function');
    assert.equal(typeof api.seekBuilding, 'function');

    assert.deepEqual(api.state().buildings, [{ building: '一', markerCell: [0, 4] }]);

    await api.setLevel(60);
    assert.deepEqual(calls.slice(0, 3), [
        ['hideAnswer'],
        ['setLevel', 60],
        ['reload', { fresh: true, prefetch: false }],
    ]);
    assert.deepEqual(api.state().buildings, [{ building: '二', markerCell: [1, 1] }]);

    calls.length = 0;
    api.solve();
    assert.equal(userPath.clearCalled, true);
    assert.deepEqual(calls, [
        ['hideAnswer'],
        ['syncUserLine'],
        ['submit'],
    ]);

    calls.length = 0;
    await api.resetProgress();
    assert.deepEqual(calls, [
        ['hideAnswer'],
        ['resetProgress'],
        ['setLevel', 0],
        ['reload', { fresh: true, prefetch: false }],
    ]);
});

test('seekBuildings waits for each async reroll before checking puzzle buildings again', async () => {
    const events = [];
    const puzzles = [
        {
            size: [7, 7],
            buildings: [{ buildingIndex: 0, markerCell: [0, 4] }],
            answer: { queue: [] },
        },
        {
            size: [7, 7],
            buildings: [{ buildingIndex: 2, markerCell: [3, 0] }],
            answer: { queue: [] },
        },
    ];
    let puzzleIndex = 0;

    const api = createDebugApi({
        level: {
            get value() {
                return 60;
            },
            size() {
                return [7, 7];
            },
            set() {},
        },
        actions: {
            submit() {},
        },
        getPuzzle: () => {
            events.push(`check:${puzzleIndex}`);
            return puzzles[puzzleIndex];
        },
        getUserPath: () => ({ distance: 0, finished: false }),
        getBusy: () => false,
        reloadBoard: async () => {
            events.push('reload:start');
            await Promise.resolve();
            puzzleIndex = 1;
            events.push('reload:done');
        },
        syncUserLine() {},
        showAnswer() {},
        hideAnswer() {},
        playEnding() {},
        resetProgress() {},
    });

    const result = await api.seekBuilding('三');

    assert.equal(result.attempts, 1);
    assert.deepEqual(result.buildings, [{ building: '三', markerCell: [3, 0] }]);
    assert.deepEqual(events.slice(0, 4), [
        'check:0',
        'reload:start',
        'reload:done',
        'check:1',
    ]);
});
