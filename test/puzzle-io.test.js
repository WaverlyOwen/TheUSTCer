"use strict";

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CUSTOM_ROAD_BASE,
    CUSTOM_TYPE_BASE,
    colorKeyOf,
    CELL_COLORS,
    decodeShareHash,
    deserializePuzzle,
    encodeShareHash,
    readableTextColor,
    serializePuzzle,
    validateRecord,
} from '../src/core/puzzle-io.js';
import { Path } from '../src/core/path.js';
import { checkSolution } from '../src/core/validator.js';

function blankSign(w, h) {
    return Array.from({ length: w + 1 }, () =>
        Array.from({ length: h + 1 }, () => [[0, 0], [0, 0], [0, 0]]));
}

// 沿左边和底边走到出口的完整路径：所有格子归入同一区域
function bottomPath(w, h) {
    const path = new Path([w, h]);
    for (let j = 0; j < h; j++) {
        assert.equal(path.step(1), true);
    }
    for (let i = 0; i <= w; i++) {
        assert.equal(path.step(0), true);
    }
    assert.equal(path.finished, true);
    return path;
}

function sampleRecord() {
    const sign = blankSign(3, 3);
    sign[0][0][2] = [7, 0];
    sign[1][1][2] = [CUSTOM_TYPE_BASE, 0];
    sign[2][0][0] = [1, 2];
    sign[0][2][1] = [1, CUSTOM_ROAD_BASE];
    return {
        v: 1,
        w: 3,
        h: 3,
        sign,
        answer: [1, 1, 1, 0, 0, 0, 0],
        palette: [{ color: '#123456', chars: ['甲', '乙'] }],
        roadNames: ['测试路'],
        name: '测试题',
        createdAt: 1000,
        origin: 'custom',
    };
}

test('分享链接编解码往返保持题目数据不变', () => {
    const record = sampleRecord();
    const decoded = decodeShareHash(encodeShareHash(record));
    assert.ok(decoded);
    assert.deepEqual(decoded.sign, record.sign);
    assert.deepEqual(decoded.answer, record.answer);
    assert.deepEqual(decoded.palette, record.palette);
    assert.deepEqual(decoded.roadNames, record.roadNames);
    assert.equal(decoded.name, record.name);
});

test('validateRecord 拒绝坏结构/越界类型码/坏路名号', () => {
    assert.equal(validateRecord(null), false);
    assert.equal(validateRecord({ ...sampleRecord(), v: 2 }), false);
    assert.equal(validateRecord({ ...sampleRecord(), w: 0 }), false);
    assert.equal(validateRecord({ ...sampleRecord(), w: 40 }), false);

    const badType = sampleRecord();
    badType.sign[0][0][2] = [15, 0];
    assert.equal(validateRecord(badType), false);

    const badCustomType = sampleRecord();
    badCustomType.sign[1][1][2] = [CUSTOM_TYPE_BASE + 1, 0]; // palette 只有 1 项
    assert.equal(validateRecord(badCustomType), false);

    const badRoad = sampleRecord();
    badRoad.sign[0][2][1] = [1, CUSTOM_ROAD_BASE + 1]; // roadNames 只有 1 项
    assert.equal(validateRecord(badRoad), false);

    const badAnswer = sampleRecord();
    badAnswer.answer = [0, 4];
    assert.equal(validateRecord(badAnswer), false);

    assert.equal(validateRecord(sampleRecord()), true);
});

test('decodeShareHash 拒绝非法 base64 与非法记录', () => {
    assert.equal(decodeShareHash('#p=%%%%'), null);
    assert.equal(decodeShareHash('#nope'), null);
    const bad = { ...sampleRecord(), sign: 'oops' };
    assert.equal(decodeShareHash(encodeShareHash(bad)), null);
});

test('deserializePuzzle 重放答案，坏答案按无答案处理', () => {
    const record = sampleRecord();
    const puzzle = deserializePuzzle(record);
    assert.deepEqual(puzzle.size, [3, 3]);
    assert.ok(puzzle.answer);
    assert.equal(puzzle.answer.finished, true);
    assert.deepEqual([...puzzle.answer.queue], record.answer);

    const truncated = { ...record, answer: [1, 1] };
    assert.equal(deserializePuzzle(truncated).answer, null);
    assert.equal(deserializePuzzle({ ...record, answer: null }).answer, null);
});

test('serializePuzzle 与 deserializePuzzle 互为往返', () => {
    const record = sampleRecord();
    const puzzle = deserializePuzzle(record);
    const back = serializePuzzle(puzzle, { name: record.name, origin: 'custom' });
    assert.deepEqual(back.sign, record.sign);
    assert.deepEqual(back.answer, record.answer);
    assert.deepEqual(back.palette, record.palette);
    assert.deepEqual(back.roadNames, record.roadNames);
});

test('colorKeyOf 按实际颜色统一书院色与自定义色', () => {
    const palette = [
        { color: CELL_COLORS[0].toUpperCase(), chars: ['甲'] },
        { color: '#101010', chars: ['乙'] },
    ];
    assert.equal(colorKeyOf([7, 0], palette), colorKeyOf([CUSTOM_TYPE_BASE, 0], palette));
    assert.notEqual(colorKeyOf([7, 0], palette), colorKeyOf([CUSTOM_TYPE_BASE + 1, 0], palette));
    assert.equal(colorKeyOf([0, 0], palette), null);
    assert.equal(colorKeyOf([11, 0], palette), null);
});

test('checkSolution：同区域不同自定义色冲突，同色键不冲突', () => {
    const w = 2;
    const h = 2;
    const palette = [
        { color: CELL_COLORS[0], chars: ['甲'] },
        { color: '#101010', chars: ['乙'] },
    ];
    const sign = blankSign(w, h);
    sign[0][0][2] = [7, 0];                       // 书院橙
    sign[1][0][2] = [CUSTOM_TYPE_BASE, 0];        // 自定义同橙 → 同键
    const okResult = checkSolution(sign, [w, h], bottomPath(w, h), palette);
    assert.equal(okResult.ok, true);

    sign[1][0][2] = [CUSTOM_TYPE_BASE + 1, 0];    // 自定义异色 → 冲突
    const badResult = checkSolution(sign, [w, h], bottomPath(w, h), palette);
    assert.equal(badResult.ok, false);
    assert.deepEqual(badResult.cells.sort(), [[0, 0], [1, 0]].sort());
});

test('readableTextColor 深底配白字、浅底配黑字', () => {
    assert.equal(readableTextColor('#101010'), '#ffffff');
    assert.equal(readableTextColor('#f2f2f2'), '#1c1c1c');
    assert.equal(readableTextColor('not-a-color'), '#ffffff');
});

test('validateRecord 卡住越界的格子子编号与路名号', () => {
    const base = () => ({ v: 1, w: 2, h: 2, sign: blankSign(2, 2), answer: null });
    const withCell = (cell) => {
        const record = base();
        record.sign[0][0][2] = cell;
        return record;
    };
    // 回归：此前子编号只查 Number.isFinite，[12,9]/[11,1.5]/[13,99] 都能过校验，
    // 玩家一画完路径 checkSolution 就 TypeError
    assert.equal(validateRecord(withCell([12, 1])), true);
    assert.equal(validateRecord(withCell([12, 9])), false);
    assert.equal(validateRecord(withCell([11, 1.5])), false);
    assert.equal(validateRecord(withCell([13, 4])), true);
    assert.equal(validateRecord(withCell([13, 99])), false);
    assert.equal(validateRecord(withCell([7, 0])), true);
    assert.equal(validateRecord(withCell([7, 5])), false);

    const road = base();
    road.sign[0][0][0] = [1, 99];
    assert.equal(validateRecord(road), false);
    const fractionalRoad = base();
    fractionalRoad.sign[0][0][0] = [1, 1.5];
    assert.equal(validateRecord(fractionalRoad), false);
});

test('答案重放带上阻断边：穿过阻断通道的答案按无答案处理', () => {
    const record = {
        v: 1,
        w: 1,
        h: 1,
        sign: blankSign(1, 1),
        answer: [0, 1, 0],
        blockedEdges: [[0, 0, 0]],
    };
    assert.equal(validateRecord(record), true);
    // 回归：此前 deserializePuzzle 用不带阻断边的 Path 重放，
    // 这条穿过阻断口的答案会被当成有效答案展示
    assert.equal(deserializePuzzle(record).answer, null);
    assert.notEqual(deserializePuzzle({ ...record, blockedEdges: [] }).answer, null);
});
