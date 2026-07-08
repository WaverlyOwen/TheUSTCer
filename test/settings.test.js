"use strict";

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    SENSITIVITY_MAX,
    SENSITIVITY_MIN,
    getSensitivity,
    setSensitivity,
} from '../src/lib/settings.js';

test('灵敏度夹在区间内，非法值回退默认 1', () => {
    assert.equal(setSensitivity(99), SENSITIVITY_MAX);
    assert.equal(setSensitivity(0.01), SENSITIVITY_MIN);
    assert.equal(setSensitivity('abc'), 1);
    assert.equal(setSensitivity(1.25), 1.25);
    assert.equal(getSensitivity(), 1.25);
});
