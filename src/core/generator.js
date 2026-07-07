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
const LOCAL_COVERAGE_WINDOW = 3;

const DEFAULT_GENERATION_OPTIONS = {
    letterMode: 'balanced', // balanced | force | none
    requireAllLetterFamilies: true,
    preferredLetterCount: null,
    maxLetterCount: 2,
    forceLetterCount: 1,
    allowDoubleLetters: true,
    collegesEnabled: true,
    pairsMode: 'normal', // off | normal | dense
    roadsMode: 'normal', // off | normal | dense
    // 硬性接受过滤窗口：任一该尺寸方块内都要有答案线，防大块空区（越小越慢，3 是速度/密度折中）
    localCoverageWindow: LOCAL_COVERAGE_WINDOW,
    // 变异修补的目标窗口：把 2x2 空白区域挑出来，用周围的边把路径引进去填密（best-effort，不做硬拒绝）
    mutationWindow: 2,
    mutationPasses: 2,
    mutationMinTouches: 2,
    mutationMinimumCoverage: 0.34,
    minimumPrefixSteps: 6,
    minimumTailSteps: 10,
    mutationTargetWindows: 3,
    mutationCutSamples: 6,
    mutationWaypointSamples: 8,
    normalCandidateAttempts: 40,
    normalCandidateLimit: 5,
    difficultyValue: null,
    // 单局生成时间预算（ms）：超时后逐级放宽质控接受最好候选，杜绝大盘假死
    generationBudgetMs: 5000,
};

// 难度系数：0（新手）→ 1（level 60+）
function difficulty(level) {
    return Math.min(1, Math.max(0, level / 60));
}

function createGenerationSettings(level, options = {}) {
    const settings = {
        ...DEFAULT_GENERATION_OPTIONS,
        ...options,
    };
    settings.difficultyValue = settings.difficultyValue ?? difficulty(level);
    settings.localCoverageWindow = Math.max(2, settings.localCoverageWindow | 0);
    settings.mutationWindow = Math.max(2, settings.mutationWindow | 0);
    settings.mutationPasses = Math.max(0, settings.mutationPasses | 0);
    settings.mutationMinTouches = Math.max(1, settings.mutationMinTouches | 0);
    settings.minimumPrefixSteps = Math.max(2, settings.minimumPrefixSteps | 0);
    settings.minimumTailSteps = Math.max(4, settings.minimumTailSteps | 0);
    settings.forceLetterCount = Math.max(1, settings.forceLetterCount | 0);
    settings.maxLetterCount = Math.max(1, settings.maxLetterCount | 0);
    settings.normalCandidateAttempts = Math.max(6, settings.normalCandidateAttempts | 0);
    settings.normalCandidateLimit = Math.max(1, settings.normalCandidateLimit | 0);
    settings.generationBudgetMs = Math.max(500, settings.generationBudgetMs | 0);
    return settings;
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
    path.mutationMinCut = 0;
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

    // 字母链全部走完后，尾部允许做局部变异；前段保留字母结构。
    path.mutationMinCut = path.distance;

    wander(path, state);
    if (!walkTo(path, [size[0], size[1]], state)) {
        return null;
    }
    path.step(0);
    return path;
}

function markTouchedCells(touched, x, y, size) {
    if (x >= 0 && x < size[0] && y >= 0 && y < size[1]) {
        touched[x][y] = true;
    }
}

function createTouchMap(answer, size) {
    const touched = Array.from({ length: size[0] }, () => Array(size[1]).fill(false));
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

    return touched;
}

function analyzeLocalCoverage(answer, size, window = LOCAL_COVERAGE_WINDOW) {
    const [w, h] = size;
    if (w < window || h < window) {
        return {
            window,
            blankWindows: 0,
            minTouches: window * window,
            weakestWindows: [],
            averageTouches: window * window,
        };
    }

    const touched = createTouchMap(answer, size);
    const windows = [];
    let blankWindows = 0;
    let minTouches = Infinity;
    let touchSum = 0;

    for (let startX = 0; startX <= w - window; startX++) {
        for (let startY = 0; startY <= h - window; startY++) {
            let touches = 0;
            for (let x = startX; x < startX + window; x++) {
                for (let y = startY; y < startY + window; y++) {
                    if (touched[x][y]) {
                        touches++;
                    }
                }
            }
            touchSum += touches;
            minTouches = Math.min(minTouches, touches);
            if (!touches) {
                blankWindows++;
            }
            windows.push({
                x: startX,
                y: startY,
                touches,
                center: [startX + window / 2, startY + window / 2],
            });
        }
    }

    windows.sort((a, b) => a.touches - b.touches);
    return {
        window,
        blankWindows,
        minTouches,
        weakestWindows: windows,
        averageTouches: touchSum / windows.length,
    };
}

// 质控指标：任意滑动 4x4 方块中都至少要碰到一段答案线，避免大块空区。
export function hasLocalLineCoverage(answer, size, window = LOCAL_COVERAGE_WINDOW) {
    return analyzeLocalCoverage(answer, size, window).blankWindows === 0;
}

// 区域划分质量检查：区域够多、没有孤格或占半盘的巨区
function validAnswer(answer, size, settings) {
    const cells = size[0] * size[1];
    if (!hasLocalLineCoverage(answer, size, settings.localCoverageWindow)) {
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
function scoreAnswer(answer, size, t, settings) {
    const nodes = (size[0] + 1) * (size[1] + 1);
    const coverage = answer.distance / nodes;
    const coverageTarget = 0.45 + 0.25 * t;
    const cells = size[0] * size[1];
    const groupTarget = Math.min(8, Math.max(2, cells / 5));
    const local = analyzeLocalCoverage(answer, size, settings.localCoverageWindow);
    return -(Math.abs(coverage - coverageTarget) * 3 +
        Math.abs(answer.group.length - groupTarget) / groupTarget) +
        local.minTouches * 0.18 -
        local.blankWindows * 5;
}

// 字母题的放宽过滤：强制链走向让区域分布天然不如自由游走均匀，
// 只挡明显劣质盘（巨型空区/区域过少），孤格转为打分惩罚
function validLetterAnswer(answer, size, settings) {
    const cells = size[0] * size[1];
    if (!hasLocalLineCoverage(answer, size, settings.localCoverageWindow)) {
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

function scoreLetterAnswer(answer, size, t, settings) {
    const singletons = answer.group.filter(member => member === 1).length;
    return scoreAnswer(answer, size, t, settings) - singletons * 0.15;
}

function needsRefinement(answer, size, settings) {
    const nodes = (size[0] + 1) * (size[1] + 1);
    const coverage = answer.distance / nodes;
    const local = analyzeLocalCoverage(answer, size, settings.localCoverageWindow);
    return local.blankWindows > 0 ||
        local.minTouches < settings.mutationMinTouches ||
        coverage < settings.mutationMinimumCoverage;
}

function randomItem(array) {
    return array[random(array.length)];
}

function pathNodes(queue) {
    const nodes = [[0, 0]];
    let position = [0, 0];
    for (const move of queue) {
        position = movePoint(position, move, 1);
        nodes.push(position);
    }
    return nodes;
}

function replayPath(size, queue, blockedEdges = null) {
    const path = new Path(size, blockedEdges);
    for (const move of queue) {
        if (!path.step(move)) {
            return null;
        }
    }
    return path;
}

function pickCutCandidates(answer, targetWindow, settings) {
    const nodes = pathNodes(answer.queue);
    const target = targetWindow.center;
    const minCut = Math.max(answer.mutationMinCut ?? 0, settings.minimumPrefixSteps);
    const maxCut = Math.min(answer.distance - settings.minimumTailSteps, nodes.length - 2);
    if (maxCut < minCut) {
        return [];
    }

    const cuts = [];
    for (let index = minCut; index <= maxCut; index++) {
        const [x, y] = nodes[index];
        cuts.push({
            index,
            distanceToTarget: Math.hypot(x - target[0], y - target[1]),
        });
    }
    cuts.sort((a, b) => a.distanceToTarget - b.distanceToTarget);
    return cuts.slice(0, settings.mutationCutSamples);
}

function pickWaypoints(path, targetWindow, size, settings) {
    const [w, h] = size;
    const candidates = [];
    const minX = Math.max(0, targetWindow.x - 1);
    const maxX = Math.min(w, targetWindow.x + targetWindow.window + 1);
    const minY = Math.max(0, targetWindow.y - 1);
    const maxY = Math.min(h, targetWindow.y + targetWindow.window + 1);

    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            if ((x === 0 && y === 0) || (x === w + 1 && y === h)) {
                continue;
            }
            if (x === path.x && y === path.y) {
                candidates.push([x, y]);
                continue;
            }
            if (x >= 0 && x <= w && y >= 0 && y <= h && !path.map[path.index(x, y)]) {
                candidates.push([x, y]);
            }
        }
    }

    candidates.sort((a, b) =>
        Math.hypot(a[0] - targetWindow.center[0], a[1] - targetWindow.center[1]) -
        Math.hypot(b[0] - targetWindow.center[0], b[1] - targetWindow.center[1]));
    return candidates.slice(0, settings.mutationWaypointSamples);
}

function mutateAnswer(answer, size, t, settings) {
    const coverage = analyzeLocalCoverage(answer, size, settings.mutationWindow);
    const targetWindows = coverage.weakestWindows.slice(0, settings.mutationTargetWindows)
        .map(window => ({ ...window, window: coverage.window }));
    if (!targetWindows.length) {
        return answer;
    }

    let best = answer;
    let bestScore = scoreAnswer(answer, size, t, settings);

    for (const targetWindow of targetWindows) {
        const cutCandidates = pickCutCandidates(answer, targetWindow, settings);
        for (const cut of cutCandidates) {
            const prefixQueue = answer.queue.slice(0, cut.index);
            const prefixPath = replayPath(size, prefixQueue, answer.blockedEdges);
            if (!prefixPath) {
                continue;
            }
            const waypoints = pickWaypoints(prefixPath, targetWindow, size, settings);
            for (const waypoint of waypoints) {
                const path = replayPath(size, prefixQueue, answer.blockedEdges);
                if (!path) {
                    continue;
                }
                path.mutationMinCut = answer.mutationMinCut ?? 0;
                const state = {
                    last: prefixQueue.length ? prefixQueue[prefixQueue.length - 1] : Math.floor(Math.random() * 2),
                };
                if (!(path.x === waypoint[0] && path.y === waypoint[1]) &&
                    !walkTo(path, waypoint, state)) {
                    continue;
                }
                wander(path, state);
                if (!walkTo(path, [size[0], size[1]], state)) {
                    continue;
                }
                path.step(0);

                const candidateScore = scoreAnswer(path, size, t, settings);
                if (candidateScore > bestScore) {
                    best = path;
                    bestScore = candidateScore;
                }
            }
        }
    }

    return best;
}

function refineCandidate(answer, size, t, settings) {
    let current = answer;
    for (let pass = 0; pass < settings.mutationPasses; pass++) {
        if (!needsRefinement(current, size, settings)) {
            break;
        }
        const mutated = mutateAnswer(current, size, t, settings);
        if (mutated === current) {
            break;
        }
        current = mutated;
    }
    return current;
}

function buildLetterPlans(byLetter, count, requireAllFamilies = true) {
    const available = byLetter
        .map((placements, index) => placements.length ? index : null)
        .filter(index => index !== null);
    if (!available.length) {
        return [];
    }
    if (requireAllFamilies && available.length !== byLetter.length) {
        return [];
    }
    if (count > available.length) {
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

function collectLetterCandidates(size, plans, byLetter, settings, deadline) {
    const candidates = [];
    const planBudget = Math.max(1, Math.ceil(LETTER_ATTEMPTS / Math.max(plans.length, 1)));
    let attemptsRemaining = LETTER_ATTEMPTS;

    for (const plan of plans) {
        if (!attemptsRemaining || candidates.length >= LETTER_CANDIDATE_LIMIT || Date.now() > deadline) {
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
            if (Date.now() > deadline) {
                break;
            }
            attemptsRemaining--;
            const chosen = randomItem(placementOptions);
            const candidate = generateAnswerWithLetters(size, chosen);
            if (!candidate) {
                continue;
            }
            const refined = refineCandidate(candidate, size, settings.difficultyValue, settings);
            if (validLetterAnswer(refined, size, settings)) {
                candidates.push({ candidate: refined, chosen });
            }
        }
    }

    return candidates;
}

function ensurePairPresence(groupType, answer, letterGroups) {
    for (const [, queue] of groupType) {
        if (queue.length) {
            return;
        }
    }
    for (let i = 0; i < answer.group.length; i++) {
        const member = answer.group[i];
        if (member >= 4 && !letterGroups.has(i)) {
            const set = randomSet(2, member);
            groupType[i][1] = [...set].map((element, index) => [element, 11, index]);
            return;
        }
    }
}

function fillSigns(answer, size, t, letters, settings) {
    const groupType = [];
    const types = shuffleArray([7, 8, 9, 10]);
    const roadRate = settings.roadsMode === 'off'
        ? 0
        : settings.roadsMode === 'dense'
            ? 0.26 + 0.16 * t
            : 0.15 + 0.15 * t;
    const pairMode = settings.pairsMode ?? 'normal';
    // 无配对约束的概率随难度下降（高关更多红专/理实对）
    const noPairRate = pairMode === 'off'
        ? 1
        : pairMode === 'dense'
            ? 0.08
            : 0.5 - 0.25 * t;
    const letterGroups = new Set(
        letters.map(letter => answer.groupMap[letter.markerCell[0]][letter.markerCell[1]]));

    const sign = Array.from({ length: size[0] + 1 }, () =>
        Array.from({ length: size[1] + 1 }, () => [[0, 0], [0, 0], [0, 0]]));

    for (let i = 0; i < answer.group.length; i++) {
        const member = answer.group[i];
        let queue = [];
        if (pairMode !== 'off' && member >= 4 && !letterGroups.has(i) && Math.random() >= noPairRate) {
            let set;
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
        }
        groupType.push([types[i % 4], queue]);
    }

    if (pairMode !== 'off') {
        ensurePairPresence(groupType, answer, letterGroups);
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
            } else if (settings.collegesEnabled &&
                Math.random() < SIGN_RATE / Math.sqrt(Math.sqrt(remaining[group]))) {
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
    const roadSlots = [];
    for (let i = 0; i < answer.distance; i++) {
        const now = answer.queue[i];
        if (now < 2) {
            roadSlots.push([position[0], position[1], now]);
            sign[position[0]][position[1]][now] = [
                Number(Math.random() < roadRate),
                random(TYPE_SCALE[5 + now]),
            ];
            position = movePoint(position, now, 1);
        } else {
            position = movePoint(position, now, 1);
            roadSlots.push([position[0], position[1], now % 2]);
            sign[position[0]][position[1]][now % 2] = [
                Number(Math.random() < roadRate),
                random(TYPE_SCALE[5 + now]),
            ];
        }
    }

    if (roadRate > 0 && roadSlots.length) {
        const hasBlackRoad = roadSlots.some(([x, y, orient]) => sign[x][y][orient][0]);
        if (!hasBlackRoad) {
            const [x, y, orient] = randomItem(roadSlots);
            sign[x][y][orient][0] = 1;
        }
    }

    // 字母标记格（覆盖该格原有签；所在组已强制无配对约束，覆盖安全）
    for (const letter of letters) {
        const [x, y] = letter.markerCell;
        sign[x][y][2] = [14, letter.letterIndex];
    }

    return sign;
}

function pickDesiredLetterCount(byLetter, settings) {
    if (settings.letterMode === 'none') {
        return 0;
    }
    if (settings.letterMode === 'force') {
        return Math.min(settings.forceLetterCount, settings.maxLetterCount);
    }
    const roll = Math.random();
    if (settings.difficultyValue >= 0.9 && settings.allowDoubleLetters && roll < 0.3) {
        return 2;
    }
    return roll < 0.7 ? 1 : 0;
}

function canUseLetters(byLetter, settings) {
    if (settings.letterMode === 'none') {
        return false;
    }
    if (settings.requireAllLetterFamilies) {
        return byLetter.every(placements => placements.length > 0);
    }
    return byLetter.some(placements => placements.length > 0);
}

// 大盘上单次 refine/候选都很贵，按面积调低打磨强度换取生成时间可控（质量对大盘影响可接受）。
// 关键：硬性接受过滤窗口随面积放大——大盘要求"无 3×3 空区"几乎不可能满足，会烧光预算；
// 放宽到 4/5 后随机游走基本一次过，而 2×2 的密补仍由 mutationWindow 负责。
function scaleEffortForSize(settings, size) {
    const area = size[0] * size[1];
    if (area <= 256) {
        return;
    }
    settings.mutationPasses = Math.min(settings.mutationPasses, 1);
    settings.mutationTargetWindows = Math.min(settings.mutationTargetWindows, 2);
    settings.mutationCutSamples = Math.min(settings.mutationCutSamples, 4);
    settings.mutationWaypointSamples = Math.min(settings.mutationWaypointSamples, 5);
    settings.normalCandidateAttempts = Math.min(settings.normalCandidateAttempts, 12);
    settings.normalCandidateLimit = Math.min(settings.normalCandidateLimit, 2);
    settings.localCoverageWindow = Math.max(settings.localCoverageWindow, 4);
    if (area > 484) {
        settings.localCoverageWindow = Math.max(settings.localCoverageWindow, 5);
        // 超大盘（>22×22）字母只占一格视觉意义有限，且强制链会拖垮生成——直接跳过
        settings.letterMode = 'none';
    }
}

export function generatePuzzle(size, level = 0, options = {}) {
    const settings = createGenerationSettings(level, options);
    scaleEffortForSize(settings, size);
    const t = settings.difficultyValue;
    const startedAt = Date.now();
    const deadline = startedAt + settings.generationBudgetMs;
    let answer = null;
    const letters = [];
    const byLetter = placementsByLetter(size);

    if (canUseLetters(byLetter, settings)) {
        // 字母阶段最多占预算 60%，留时间给普通题兜底
        const letterDeadline = startedAt + settings.generationBudgetMs * 0.6;
        const desired = pickDesiredLetterCount(byLetter, settings);
        for (let count = desired; count >= 1 && !answer; count--) {
            const plans = buildLetterPlans(byLetter, count, settings.requireAllLetterFamilies);
            const candidates = collectLetterCandidates(size, plans, byLetter, settings, letterDeadline);
            if (candidates.length) {
                // 先在"有合格候选的字母组合"里均匀抽一个，再取组内最高分——
                // 全局 argmax 会系统性偏向链形态更好 refine 的字母（U/C 刷屏的根源）
                const byPlanKey = new Map();
                for (const entry of candidates) {
                    const key = entry.chosen
                        .map(placement => placement.letterIndex)
                        .sort((a, b) => a - b)
                        .join('+');
                    if (!byPlanKey.has(key)) {
                        byPlanKey.set(key, []);
                    }
                    byPlanKey.get(key).push(entry);
                }
                const group = randomItem([...byPlanKey.values()]);
                const best = group.reduce((bestSoFar, entry) =>
                    scoreLetterAnswer(entry.candidate, size, t, settings) >
                        scoreLetterAnswer(bestSoFar.candidate, size, t, settings) ? entry : bestSoFar);
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

    // 普通题：先多生成若干候选，再做局部变异修补，最后按得分择优
    if (!answer) {
        const candidates = [];
        for (let attempt = 0;
            attempt < settings.normalCandidateAttempts &&
            candidates.length < settings.normalCandidateLimit;
            attempt++) {
            if (Date.now() > deadline && candidates.length) {
                break;
            }
            const candidate = generateAnswer(size);
            if (!candidate) {
                continue;
            }
            const refined = refineCandidate(candidate, size, t, settings);
            if (validAnswer(refined, size, settings)) {
                candidates.push(refined);
            }
        }
        // 兜底一级：放宽区域分布过滤，但保留局部覆盖质控（限时）
        let fallbackAttempts = 0;
        while (!candidates.length && fallbackAttempts < 600 && Date.now() <= deadline) {
            const candidate = generateAnswer(size);
            if (candidate) {
                const refined = refineCandidate(candidate, size, t, settings);
                if (hasLocalLineCoverage(refined, size, settings.localCoverageWindow)) {
                    candidates.push(refined);
                }
            }
            fallbackAttempts++;
        }
        // 兜底二级：超时后不再挑剔，接受首个能生成的路径，保证任何尺寸不假死
        while (!candidates.length) {
            const candidate = generateAnswer(size);
            if (candidate) {
                candidates.push(refineCandidate(candidate, size, t, settings));
            }
        }
        answer = candidates.reduce((best, candidate) =>
            scoreAnswer(candidate, size, t, settings) > scoreAnswer(best, size, t, settings) ? candidate : best);
    }

    const sign = fillSigns(answer, size, t, letters, settings);
    return { size, sign, answer, letters, settings };
}
