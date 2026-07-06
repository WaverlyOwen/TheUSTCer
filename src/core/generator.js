"use strict";

import { Path, movePoint } from './path.js';
import { shuffleArray, randomSet, random } from '../lib/random.js';
import { placementsByLetter, compatiblePlacements } from './letters.js';

// sign[i][j] = [[横路名开关, 路名编号], [竖路名开关, 路名编号], [格子类型, 类型编号]]
// 类型编码见 docs/reference.txt：7~10 书院，11 红专，12 理实，14 USTC 字母区块
const TYPE_SCALE = [2, 2, 2, 4, 4, 11, 11, 1, 3, 5, 5, 2, 2, 5, 4];
const SIGN_RATE = 0.7;
const LETTER_ATTEMPTS = 128;
const LETTER_CANDIDATE_LIMIT = 8;
const LOCAL_COVERAGE_WINDOW = 4;

// 难度系数：0（新手）→ 1（level 60+）
function difficulty(level) {
    return Math.min(1, Math.max(0, level / 60));
}

// 随机游走（原引擎）：偏向直行，每步用 reach 保证不把 target 走死。
// state.last 记录上一步方向，跨段延续手感。
function walkTo(path, target, state) {
    const turnRate = 0.8;
    if (!path.reach(target[0], target[1])) {
        return false;
    }
    const cap = (path.size[0] + 1) * (path.size[1] + 1) * 8;
    let steps = 0;

    while (path.x !== target[0] || path.y !== target[1]) {
        if (++steps > cap) {
            return false;
        }
        let directions;
        if (Math.random() < 0.5) {
            directions = [(state.last + 1) % 4, (state.last + 3) % 4];
        } else {
            directions = [(state.last + 3) % 4, (state.last + 1) % 4];
        }
        if (Math.random() < turnRate) {
            directions = [...directions, state.last];
        } else {
            directions = [state.last, ...directions];
        }

        let stepped = false;
        for (const now of directions) {
            if (path.step(now)) {
                if (path.reach(target[0], target[1])) {
                    state.last = now;
                    stepped = true;
                    break;
                }
                path.back();
            }
        }
        if (!stepped) {
            return false;
        }
    }
    return true;
}

function generateAnswer(size) {
    const path = new Path(size);
    const state = { last: Math.floor(Math.random() * 2) };
    if (!walkTo(path, [size[0], size[1]], state)) {
        return null;
    }
    path.step(0);
    return path;
}

function nodesToMoves(nodes) {
    const moves = [];
    for (let i = 1; i < nodes.length; i++) {
        const dx = nodes[i][0] - nodes[i - 1][0];
        const dy = nodes[i][1] - nodes[i - 1][1];
        moves.push(dx === 1 ? 0 : dx === -1 ? 2 : dy === 1 ? 1 : 3);
    }
    return moves;
}

function randomFreeNode(path) {
    const [w, h] = path.size;
    for (let tries = 0; tries < 10; tries++) {
        const x = random(w + 1);
        const y = random(h + 1);
        if (!path.map[path.index(x, y)]) {
            return [x, y];
        }
    }
    return null;
}

// 途经一个随机空闲节点（尽力而为）：直奔目标的路径覆盖率太低，
// 会留下超大空区，游荡途经点让字母题的区域划分接近普通题
function wander(path, state) {
    const waypoint = randomFreeNode(path);
    if (waypoint) {
        walkTo(path, waypoint, state);
    }
}

// 字母题三段式生成：游走到链端 → 强制沿字母轮廓链走完 → 下一条链/终点。
// 字母内部边全程禁止穿越，保证字母区域不被再切分。
function generateAnswerWithLetters(size, placements) {
    const blocked = new Set();
    for (const placement of placements) {
        for (const key of placement.interiorEdgeKeys) {
            blocked.add(key);
        }
    }
    const path = new Path(size, blocked);
    for (const placement of placements) {
        path.reserveNodes(placement.chainNodes);
    }

    const state = { last: Math.floor(Math.random() * 2) };
    for (const placement of shuffleArray([...placements])) {
        const nodes = Math.random() < 0.5
            ? placement.chainNodes
            : [...placement.chainNodes].reverse();
        const entry = nodes[0];

        wander(path, state);
        path.releaseNodes([entry]);
        if (!walkTo(path, entry, state)) {
            return null;
        }
        path.releaseNodes(nodes.slice(1));
        for (const move of nodesToMoves(nodes)) {
            if (!path.step(move)) {
                return null;
            }
            state.last = move;
        }
    }

    wander(path, state);
    if (!walkTo(path, [size[0], size[1]], state)) {
        return null;
    }
    path.step(0);
    return path;
}

// 区域划分质量检查：区域够多、没有孤格或占半盘的巨区
function validAnswer(answer, size) {
    const cells = size[0] * size[1];
    if (!hasLocalLineCoverage(answer, size)) {
        return false;
    }
    if (answer.group.length < Math.sqrt(cells / 2) && Math.sqrt(cells) > 3) {
        return false;
    }
    for (const member of answer.group) {
        if ((member === 1 || member > cells / 2) && cells > 9) {
            return false;
        }
    }
    return true;
}

// 难度打分：路径覆盖率与区域数越贴近该关卡的目标越好
function scoreAnswer(answer, size, t) {
    const nodes = (size[0] + 1) * (size[1] + 1);
    const coverage = answer.distance / nodes;
    const coverageTarget = 0.45 + 0.25 * t;
    const cells = size[0] * size[1];
    const groupTarget = Math.min(8, Math.max(2, cells / 5));
    return -(Math.abs(coverage - coverageTarget) * 3 +
        Math.abs(answer.group.length - groupTarget) / groupTarget);
}

// 字母题的放宽过滤：强制链走向让区域分布天然不如自由游走均匀，
// 只挡明显劣质盘（巨型空区/区域过少），孤格转为打分惩罚
function validLetterAnswer(answer, size) {
    const cells = size[0] * size[1];
    if (!hasLocalLineCoverage(answer, size)) {
        return false;
    }
    if (answer.group.length < 3) {
        return false;
    }
    for (const member of answer.group) {
        if (member > cells * 0.75) {
            return false;
        }
    }
    return true;
}

function scoreLetterAnswer(answer, size, t) {
    const singletons = answer.group.filter(member => member === 1).length;
    return scoreAnswer(answer, size, t) - singletons * 0.15;
}

function markTouchedCells(touched, x, y, size) {
    if (x >= 0 && x < size[0] && y >= 0 && y < size[1]) {
        touched[x][y] = true;
    }
}

// 质控指标：任意滑动 4x4 方块中都至少要碰到一段答案线，避免大块空区。
export function hasLocalLineCoverage(answer, size, window = LOCAL_COVERAGE_WINDOW) {
    const [w, h] = size;
    if (w < window || h < window) {
        return true;
    }

    const touched = Array.from({ length: w }, () => Array(h).fill(false));
    let position = [0, 0];

    for (const move of answer.queue) {
        const next = movePoint(position, move, 1);
        if (move === 0 || move === 2) {
            const edgeX = Math.min(position[0], next[0]);
            const edgeY = position[1];
            markTouchedCells(touched, edgeX, edgeY - 1, size);
            markTouchedCells(touched, edgeX, edgeY, size);
        } else {
            const edgeX = position[0];
            const edgeY = Math.min(position[1], next[1]);
            markTouchedCells(touched, edgeX - 1, edgeY, size);
            markTouchedCells(touched, edgeX, edgeY, size);
        }
        position = next;
    }

    for (let startX = 0; startX <= w - window; startX++) {
        for (let startY = 0; startY <= h - window; startY++) {
            let covered = false;
            for (let x = startX; x < startX + window && !covered; x++) {
                for (let y = startY; y < startY + window; y++) {
                    if (touched[x][y]) {
                        covered = true;
                        break;
                    }
                }
            }
            if (!covered) {
                return false;
            }
        }
    }

    return true;
}

function randomItem(array) {
    return array[random(array.length)];
}

function buildLetterPlans(byLetter, count) {
    const available = byLetter
        .map((placements, index) => placements.length ? index : null)
        .filter(index => index !== null);
    if (available.length !== byLetter.length) {
        return [];
    }
    if (count === 1) {
        return shuffleArray(available.map(letterIndex => [letterIndex]));
    }
    const plans = [];
    for (let i = 0; i < available.length; i++) {
        for (let j = i + 1; j < available.length; j++) {
            plans.push([available[i], available[j]]);
        }
    }
    return shuffleArray(plans);
}

function compatiblePlacementPairs(firstPlacements, secondPlacements) {
    const pairs = [];
    for (const first of firstPlacements) {
        for (const second of secondPlacements) {
            if (compatiblePlacements(first, second)) {
                pairs.push([first, second]);
            }
        }
    }
    return pairs;
}

function collectLetterCandidates(size, plans, byLetter) {
    const candidates = [];
    const planBudget = Math.max(1, Math.ceil(LETTER_ATTEMPTS / Math.max(plans.length, 1)));
    let attemptsRemaining = LETTER_ATTEMPTS;

    for (const plan of plans) {
        if (!attemptsRemaining || candidates.length >= LETTER_CANDIDATE_LIMIT) {
            break;
        }

        let placementOptions;
        if (plan.length === 1) {
            placementOptions = byLetter[plan[0]].map(placement => [placement]);
        } else {
            placementOptions = compatiblePlacementPairs(byLetter[plan[0]], byLetter[plan[1]]);
        }
        if (!placementOptions.length) {
            continue;
        }

        const budget = Math.min(planBudget, attemptsRemaining);
        for (let attempt = 0; attempt < budget && candidates.length < LETTER_CANDIDATE_LIMIT; attempt++) {
            attemptsRemaining--;
            const chosen = randomItem(placementOptions);
            const candidate = generateAnswerWithLetters(size, chosen);
            if (candidate && validLetterAnswer(candidate, size)) {
                candidates.push({ candidate, chosen });
            }
        }
    }

    return candidates;
}

function fillSigns(answer, size, t, letters) {
    const groupType = [];
    const types = shuffleArray([7, 8, 9, 10]);
    const roadRate = 0.15 + 0.15 * t;
    // 无配对约束的概率随难度下降（高关更多红专/理实对）
    const noPairRate = 0.5 - 0.25 * t;
    const letterGroups = new Set(
        letters.map(letter => answer.groupMap[letter.markerCell[0]][letter.markerCell[1]]));

    const sign = Array.from({ length: size[0] + 1 }, () =>
        Array.from({ length: size[1] + 1 }, () => [[0, 0], [0, 0], [0, 0]]));

    for (let i = 0; i < answer.group.length; i++) {
        const member = answer.group[i];
        if (member >= 4 && !letterGroups.has(i) && Math.random() >= noPairRate) {
            let set, queue;
            switch (1 + random(3)) {
                case 1:
                    set = randomSet(2, member);
                    queue = [...set].map((element, index) => [element, 11, index]);
                    break;
                case 2:
                    set = randomSet(2, member);
                    queue = [...set].map((element, index) => [element, 12, index]);
                    break;
                case 3:
                default:
                    set = randomSet(4, member);
                    queue = [...set].map((element, index) => [element, 11 + Math.floor(index / 2), index % 2]);
                    break;
            }
            groupType.push([types[i % 4], queue]);
        } else {
            groupType.push([types[i % 4], []]);
        }
    }

    // remaining 作为组内格子的倒计数，标记红专/理实落在组内第几个格子上
    const remaining = answer.group.slice();
    for (let i = 0; i < size[0]; i++) {
        for (let j = 0; j < size[1]; j++) {
            const group = answer.groupMap[i][j];
            remaining[group]--;
            const marked = groupType[group][1].find(cell => cell[0] === remaining[group]);
            if (marked) {
                sign[i][j][2] = [marked[1], marked[2]];
            } else if (Math.random() < SIGN_RATE / Math.sqrt(Math.sqrt(remaining[group]))) {
                sign[i][j][2] = [groupType[group][0], random(TYPE_SCALE[groupType[group][0]])];
            } else if ((i + j) % 2) {
                sign[i][j][2] = [0, 1];
            } else {
                sign[i][j][2] = [0, 0];
            }
        }
    }

    // 沿答案路径撒路名，一部分标黑（必须穿过）
    let position = [0, 0];
    for (let i = 0; i < answer.distance; i++) {
        const now = answer.queue[i];
        if (now < 2) {
            sign[position[0]][position[1]][now] = [Number(Math.random() < roadRate), random(TYPE_SCALE[5 + now])];
            position = movePoint(position, now, 1);
        } else {
            position = movePoint(position, now, 1);
            sign[position[0]][position[1]][now % 2] = [Number(Math.random() < roadRate), random(TYPE_SCALE[5 + now])];
        }
    }

    // 字母标记格（覆盖该格原有签；所在组已强制无配对约束，覆盖安全）
    for (const letter of letters) {
        const [x, y] = letter.markerCell;
        sign[x][y][2] = [14, letter.letterIndex];
    }

    return sign;
}

export function generatePuzzle(size, level = 0) {
    const t = difficulty(level);
    let answer = null;
    const letters = [];
    const byLetter = placementsByLetter(size);

    // 字母题只在当前棋盘已能合法放下四个字母时开放，避免小盘偏科
    if (byLetter.every(placements => placements.length > 0)) {
        const roll = Math.random();
        const desired = roll < 0.3 ? 2 : (roll < 0.7 ? 1 : 0);
        for (let count = desired; count >= 1 && !answer; count--) {
            const plans = buildLetterPlans(byLetter, count);
            const candidates = collectLetterCandidates(size, plans, byLetter);
            if (candidates.length) {
                const best = candidates.reduce((bestSoFar, entry) =>
                    scoreLetterAnswer(entry.candidate, size, t) >
                        scoreLetterAnswer(bestSoFar.candidate, size, t) ? entry : bestSoFar);
                answer = best.candidate;
                for (const placement of best.chosen) {
                    letters.push({
                        letterIndex: placement.letterIndex,
                        markerCell: placement.cells[random(placement.cells.length)],
                    });
                }
            }
        }
    }

    // 普通题：多候选按难度目标择优
    if (!answer) {
        const candidates = [];
        for (let attempt = 0; attempt < 40 && candidates.length < 5; attempt++) {
            const candidate = generateAnswer(size);
            if (candidate && validAnswer(candidate, size)) {
                candidates.push(candidate);
            }
        }
        let fallbackAttempts = 0;
        while (!candidates.length && fallbackAttempts < 600) {
            // 兜底：极端情况下只放宽旧的区域分布过滤，但保留 4x4 黑线覆盖质控
            const candidate = generateAnswer(size);
            if (candidate && hasLocalLineCoverage(candidate, size)) {
                candidates.push(candidate);
            }
            fallbackAttempts++;
        }
        while (!candidates.length) {
            const candidate = generateAnswer(size);
            if (candidate && hasLocalLineCoverage(candidate, size)) {
                candidates.push(candidate);
            }
        }
        answer = candidates.reduce((best, candidate) =>
            scoreAnswer(candidate, size, t) > scoreAnswer(best, size, t) ? candidate : best);
    }

    const sign = fillSigns(answer, size, t, letters);
    return { size, sign, answer, letters };
}
