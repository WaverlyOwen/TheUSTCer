"use strict";

import assert from 'node:assert/strict';
import test from 'node:test';

import { generatePuzzle } from '../src/core/generator.js';
import { Path } from '../src/core/path.js';
import { CELL_COLORS, CUSTOM_TYPE_BASE, blankSign, blockedEdgeSet } from '../src/core/puzzle-io.js';
import { analyzePuzzle, difficultyLabel, ratePuzzle, solvePuzzle } from '../src/core/solver.js';
import { checkSolution } from '../src/core/validator.js';

function replay(puzzle, moves) {
    const path = new Path(puzzle.size, blockedEdgeSet(puzzle.blockedEdges ?? [], puzzle.size[1]));
    for (const move of moves) {
        assert.equal(path.step(move), true, `illegal move ${move}`);
    }
    return path;
}

function assertValidSolution(puzzle, moves) {
    const path = replay(puzzle, moves);
    assert.equal(path.finished, true);
    const result = checkSolution(puzzle.sign, puzzle.size, path, puzzle.palette ?? []);
    assert.equal(result.ok, true, `solution rejected: ${JSON.stringify(result)}`);
}

// 穷举器（与求解器独立实现）：枚举全部自避路径，返回是否有解以及最短解长度
function bruteForce(puzzle) {
    const path = new Path(puzzle.size, blockedEdgeSet(puzzle.blockedEdges ?? [], puzzle.size[1]));
    let shortest = Infinity;
    const dfs = () => {
        for (let d = 0; d < 4; d++) {
            if (!path.step(d)) {
                continue;
            }
            if (path.finished) {
                if (checkSolution(puzzle.sign, puzzle.size, path, puzzle.palette ?? []).ok) {
                    shortest = Math.min(shortest, path.queue.length);
                }
            } else {
                dfs();
            }
            path.back();
        }
    };
    dfs();
    return { solvable: shortest !== Infinity, shortest };
}

function seededRandom(seed) {
    let state = seed >>> 0 || 1;
    return () => {
        state ^= state << 13;
        state >>>= 0;
        state ^= state >>> 17;
        state ^= state << 5;
        state >>>= 0;
        return state / 4294967296;
    };
}

// 随机小题（含书院/红专理实/教学楼/路名/阻断边），供穷举交叉检验
function randomPuzzle(w, h, rng) {
    const sign = blankSign(w, h);
    const blockedEdges = [];
    for (let i = 0; i < w; i++) {
        for (let j = 0; j < h; j++) {
            const roll = rng();
            if (roll < 0.25) {
                sign[i][j][2] = [7 + Math.floor(rng() * 4), 0];
            } else if (roll < 0.4) {
                sign[i][j][2] = [11 + Math.floor(rng() * 2), Math.floor(rng() * 2)];
            } else if (roll < 0.47) {
                sign[i][j][2] = [13, Math.floor(rng() * 5)];
            }
            if (rng() < 0.12) {
                sign[i][j][0] = [1, 0];
            }
            if (rng() < 0.12) {
                sign[i][j][1] = [1, 0];
            }
            if (rng() < 0.05) {
                blockedEdges.push([i, j, Math.floor(rng() * 2)]);
            }
        }
    }
    return { size: [w, h], sign, palette: [], blockedEdges };
}

test('求解器能解出生成器出的题，且解通过判题器', () => {
    for (const [size, level] of [[[3, 3], 20], [[6, 6], 50], [[9, 9], 80], [[12, 10], 100]]) {
        for (let i = 0; i < 6; i++) {
            const puzzle = generatePuzzle(size, level);
            const result = solvePuzzle(puzzle, { maxNodes: 5_000_000 });
            assert.equal(result.status, 'solved', `${size} #${i}: ${result.status} after ${result.nodes} nodes`);
            assertValidSolution(puzzle, result.moves);
        }
    }
});

test('小棋盘穷举交叉检验：可解性与最短解长度一致', () => {
    const rng = seededRandom(20260907);
    let solvable = 0;
    let unsolvable = 0;
    for (let i = 0; i < 120; i++) {
        const w = 1 + Math.floor(rng() * 3);
        const h = 1 + Math.floor(rng() * 3);
        const puzzle = randomPuzzle(w, h, rng);
        const expected = bruteForce(puzzle);
        const solved = solvePuzzle(puzzle);
        const rated = ratePuzzle(puzzle);
        if (expected.solvable) {
            solvable++;
            assert.equal(solved.status, 'solved', `#${i} ${w}x${h} should be solvable`);
            assertValidSolution(puzzle, solved.moves);
            assert.equal(rated.status, 'solved');
            assertValidSolution(puzzle, rated.moves);
            assert.equal(rated.moves.length, expected.shortest, `#${i} shortest length`);
            assert.ok(rated.difficulty >= 0);
        } else {
            unsolvable++;
            assert.equal(solved.status, 'unsolvable', `#${i} ${w}x${h} should be unsolvable`);
            assert.equal(rated.status, 'unsolvable');
        }
    }
    // 样本要两边都覆盖到，否则检验没有意义
    assert.ok(solvable > 10 && unsolvable > 10, `solvable=${solvable} unsolvable=${unsolvable}`);
});

test('落单的红 / 阻断边上的路名 / 相邻异色被阻断 → 无解', () => {
    const lone = { size: [3, 3], sign: blankSign(3, 3), palette: [], blockedEdges: [] };
    lone.sign[1][1][2] = [11, 0];
    assert.equal(solvePuzzle(lone).status, 'unsolvable');
    assert.equal(solvePuzzle(lone).nodes, 0);   // 静态失衡：build 即判无解，不进入搜索

    const roadOnBlocked = { size: [3, 3], sign: blankSign(3, 3), palette: [], blockedEdges: [[1, 1, 0]] };
    roadOnBlocked.sign[1][1][0] = [1, 0];
    assert.equal(solvePuzzle(roadOnBlocked).status, 'unsolvable');

    const gluedColors = { size: [3, 3], sign: blankSign(3, 3), palette: [], blockedEdges: [[1, 1, 1]] };
    gluedColors.sign[0][1][2] = [7, 0];
    gluedColors.sign[1][1][2] = [8, 0];
    assert.equal(solvePuzzle(gluedColors).status, 'unsolvable');
});

test('静态判定：红专失衡 / 强制边分叉 / 强制边压必合并格对，均 0 节点判无解', () => {
    // 红专失衡：只有红没有专（与 C++ 原版 lone_red_4x4 同构）
    const lone = { size: [4, 4], sign: blankSign(4, 4), palette: [], blockedEdges: [] };
    lone.sign[2][2][2] = [11, 0];
    assert.equal(solvePuzzle(lone).status, 'unsolvable');
    assert.equal(solvePuzzle(lone).nodes, 0);

    // 强制边分叉：四条黑路汇聚于内部格点 (1,1)，简单弧最多用掉两条相邻边
    const fork = { size: [3, 3], sign: blankSign(3, 3), palette: [], blockedEdges: [] };
    fork.sign[1][0][1][0] = 1;   // 竖边 (1,0)-(1,1)
    fork.sign[1][1][1][0] = 1;   // 竖边 (1,1)-(1,2)
    fork.sign[0][1][0][0] = 1;   // 横边 (0,1)-(1,1)
    fork.sign[1][1][0][0] = 1;   // 横边 (1,1)-(2,1)
    assert.equal(solvePuzzle(fork).status, 'unsolvable');
    assert.equal(solvePuzzle(fork).nodes, 0);

    // 强制边压"必合并格对"：同一栋五教的两格之间的公共边被黑路要求画开
    const bld = { size: [3, 3], sign: blankSign(3, 3), palette: [], blockedEdges: [] };
    bld.sign[0][1][2] = [13, 4];
    bld.sign[1][1][2] = [13, 4];
    bld.sign[2][1][2] = [13, 4];
    bld.sign[1][1][1][0] = 1;    // 五教两格公共竖边上的黑路
    assert.equal(solvePuzzle(bld).status, 'unsolvable');
    assert.equal(solvePuzzle(bld).nodes, 0);
});

test('自定义色按实际颜色参与书院判定', () => {
    // 两个自定义色项：一个与书院橙同色，一个是新颜色
    const palette = [
        { color: CELL_COLORS[0].toUpperCase(), chars: ['甲'] },
        { color: '#101010', chars: ['乙'] },
    ];
    const sameColor = { size: [2, 1], sign: blankSign(2, 1), palette, blockedEdges: [] };
    sameColor.sign[0][0][2] = [7, 0];
    sameColor.sign[1][0][2] = [CUSTOM_TYPE_BASE, 0];
    // 2×1 只有一条路走到出口，两格必然同区：同色应可解
    const sameResult = solvePuzzle(sameColor);
    assert.equal(sameResult.status, 'solved');
    assertValidSolution(sameColor, sameResult.moves);

    const differentColor = { size: [2, 1], sign: blankSign(2, 1), palette, blockedEdges: [] };
    differentColor.sign[0][0][2] = [7, 0];
    differentColor.sign[1][0][2] = [CUSTOM_TYPE_BASE + 1, 0];
    assert.equal(solvePuzzle(differentColor).status, 'solved');
    assertValidSolution(differentColor, solvePuzzle(differentColor).moves);
});

test('教学楼题：区域形状必须吻合', () => {
    // 2×2 棋盘，左上格标四教（方 2×2）：整盘一区才吻合，唯一解是绕外圈
    const square = { size: [2, 2], sign: blankSign(2, 2), palette: [], blockedEdges: [] };
    square.sign[0][0][2] = [13, 3];
    const result = solvePuzzle(square);
    assert.equal(result.status, 'solved');
    assertValidSolution(square, result.moves);

    // 五教（直线 3 格）放进 2×2 不可能
    const line = { size: [2, 2], sign: blankSign(2, 2), palette: [], blockedEdges: [] };
    line.sign[0][0][2] = [13, 4];
    assert.equal(solvePuzzle(line).status, 'unsolvable');
});

test('节点预算与时间预算会以 budget 状态返回', () => {
    const puzzle = generatePuzzle([9, 9], 80);
    const tight = solvePuzzle(puzzle, { maxNodes: 1 });
    assert.equal(tight.status, 'budget');
    assert.ok(tight.nodes <= 2);
    const timed = solvePuzzle(generatePuzzle([16, 16], 160), { timeBudgetMs: 0 });
    assert.ok(timed.status === 'budget' || timed.status === 'solved');
    // 预算中断后求解器状态必须干净，可以直接复用同一题再解
    const again = solvePuzzle(puzzle, { maxNodes: 5_000_000 });
    assert.equal(again.status, 'solved');
});

test('analyzePuzzle 给出最短解与难度分', () => {
    const puzzle = generatePuzzle([6, 6], 50);
    const result = analyzePuzzle(puzzle, { timeBudgetMs: 4000 });
    assert.equal(result.status, 'solved');
    assertValidSolution(puzzle, result.moves);
    assert.ok(typeof result.difficulty === 'number');
    assert.ok(['入门', '简单', '中等', '困难', '极难'].includes(difficultyLabel(result.difficulty)));
    assert.equal(difficultyLabel(null), '未知');
    assert.equal(difficultyLabel(5.2), '极难');
    assert.equal(difficultyLabel(1.5), '入门');
});
