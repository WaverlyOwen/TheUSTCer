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

test('createDebugApi exposes stable helper methods', () => {
    const calls = [];
    let currentLevel = 3;
    const puzzle = {
        size: [7, 7],
        letters: [{ letterIndex: 0, markerCell: [0, 4] }],
        answer: { queue: [0, 1, 0] },
    };
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
            this.finished = this.distance === puzzle.answer.queue.length;
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
        getPuzzle: () => puzzle,
        getUserPath: () => userPath,
        getBusy: () => false,
        reloadBoard: (options) => calls.push(['reload', options]),
        syncUserLine: () => calls.push(['syncUserLine']),
        showAnswer: () => calls.push(['showAnswer']),
        hideAnswer: () => calls.push(['hideAnswer']),
        playEnding: () => calls.push(['playEnding']),
        resetProgress: () => calls.push(['resetProgress']),
    });

    assert.equal(typeof api.help, 'function');
    assert.equal(typeof api.state, 'function');
    assert.equal(typeof api.seekLetter, 'function');

    assert.deepEqual(api.state().letters, [{ letter: 'U', markerCell: [0, 4] }]);

    api.setLevel(60);
    assert.deepEqual(calls.slice(0, 3), [
        ['hideAnswer'],
        ['setLevel', 60],
        ['reload', { fresh: true, prefetch: false }],
    ]);

    calls.length = 0;
    api.solve();
    assert.equal(userPath.clearCalled, true);
    assert.deepEqual(calls, [
        ['hideAnswer'],
        ['syncUserLine'],
        ['submit'],
    ]);

    calls.length = 0;
    api.resetProgress();
    assert.deepEqual(calls, [
        ['hideAnswer'],
        ['resetProgress'],
        ['setLevel', 0],
        ['reload', { fresh: true, prefetch: false }],
    ]);
});
