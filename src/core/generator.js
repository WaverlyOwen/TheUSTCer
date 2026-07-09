"use strict";

import { Path, movePoint } from './path.js';
import { shuffleArray, randomSet, random } from '../lib/random.js';
import { analyzePlacement, comboShapes, placementsByBuilding, compatiblePlacements, touchedSides } from './buildings.js';

// sign[i][j] = [[横路名开关, 路名编号], [竖路名开关, 路名编号], [格子类型, 类型编号]]
// 类型编码见 docs/reference.txt：7~10 书院，11 红专，12 理实，13 教学楼区块
const TYPE_SCALE = [2, 2, 2, 4, 4, 11, 11, 1, 3, 5, 5, 2, 2, 5, 4];
const SIGN_RATE = 0.7;
const BUILDING_ATTEMPTS = 48;
const BUILDING_CANDIDATE_LIMIT = 8;
// 每个字母组合最多收集这么多合格候选就换下一个组合；组合间均匀抽签保证字母均衡
const BUILDING_CANDIDATES_PER_PLAN = 2;
const LOCAL_COVERAGE_WINDOW = 3;
const MOVE_DX = [1, 0, -1, 0];
const MOVE_DY = [0, 1, 0, -1];

const DEFAULT_GENERATION_OPTIONS = {
    buildingMode: 'balanced', // balanced | force | none
    requireAllBuildingFamilies: false,
    preferredBuildingCount: null,
    maxBuildingCount: 5,
    forceBuildingCount: 1,
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
    // 单次变异 = 目标窗口 × 切点 × 途经点 次重排游走，乘积别超过 ~40（重排是最贵的操作）
    mutationTargetWindows: 2,
    mutationCutSamples: 4,
    mutationWaypointSamples: 5,
    normalCandidateAttempts: 40,
    normalCandidateLimit: 5,
    difficultyValue: null,
    // 单局生成时间预算（ms）：超时后逐级放宽质控接受最好候选，杜绝大盘假死
    generationBudgetMs: 5000,
};

function pushTopEntries(entries, entry, limit) {
    entries.push(entry);
    entries.sort((a, b) => b.score - a.score);
    if (entries.length > limit) {
        entries.length = limit;
    }
}

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
    settings.forceBuildingCount = Math.max(1, settings.forceBuildingCount | 0);
    settings.maxBuildingCount = Math.max(1, settings.maxBuildingCount | 0);
    settings.normalCandidateAttempts = Math.max(6, settings.normalCandidateAttempts | 0);
    settings.normalCandidateLimit = Math.max(1, settings.normalCandidateLimit | 0);
    settings.generationBudgetMs = Math.max(500, settings.generationBudgetMs | 0);
    return settings;
}

// 随机游走（原引擎）：偏向直行，保证不把 target 走死。
// state.last 记录上一步方向，跨段延续手感。
// 防死路检查两级：headArcSafe 的 O(1) 局部弧检查放行绝大多数步（开阔地带占用头部
// 不可能切断自由区），只有"可能分裂"时才做全盘 BFS —— needVerify 记录上一步是否
// 留下了分裂嫌疑（嫌疑存在时目标可能落在另一半，下一步必须 BFS 复核后才能清除）。
// alsoKeep：途经点腿必须同时守护最终终点——只守护当前途经点时，游走会把自己和
// 途经点一起封进小口袋（守护条件全程满足！），随后所有腿包括终点腿全部不可达。
function walkTo(path, target, state, alsoKeep = null) {
    const turnRate = 0.8;
    const keepReachable = () =>
        path.reach(target[0], target[1]) &&
        (!alsoKeep || path.reach(alsoKeep[0], alsoKeep[1]));
    if (!keepReachable()) {
        return false;
    }
    const cap = (path.size[0] + 1) * (path.size[1] + 1) * 8;
    let steps = 0;
    let needVerify = true;

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
                const arcSafe = path.headArcSafe();
                if (arcSafe && !needVerify) {
                    state.last = now;
                    stepped = true;
                    break;
                }
                if (keepReachable()) {
                    needVerify = !arcSafe;
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

// 蛇形分区途经点：把节点网格切成 ~4 节点宽的分区，蛇形顺序在每个分区里取一个
// 随机节点。基础游走由此获得"全盘扫掠"骨架——大盘不再出巨型空区（旧算法在大盘
// 反复被质控拒绝、把预算烧在变异修补上的根源），路径观感也更蜿蜒有趣。
// skipRate 按目标覆盖率反推：全扫的路径长约等于节点数，跳过率 ≈ 1 - 目标覆盖，
// 这样扫掠"稀疏但均匀地铺满全盘"，而不是致密地铺一半就被长度封顶截断（尾部成大空区）。
function sectorWaypoints(size, t) {
    const [w, h] = size;
    const sector = 4;
    const cols = Math.max(1, Math.round((w + 1) / sector));
    const rows = Math.max(1, Math.round((h + 1) / sector));
    const colWidth = (w + 1) / cols;
    const rowHeight = (h + 1) / rows;
    const coverageTarget = 0.45 + 0.25 * t;
    const skipRate = Math.min(0.55, Math.max(0.25, 1 - coverageTarget * 0.9));
    const transpose = Math.random() < 0.5;
    const outer = transpose ? rows : cols;
    const inner = transpose ? cols : rows;
    const waypoints = [];

    // 不许连跳：扫描序相邻、或相邻带同位置的两个分区都空缺，
    // 会留下超过质控窗口（5×5）的空洞，直接废掉候选
    let skippedPrevious = false;
    const skippedInBand = new Array(inner).fill(false);
    for (let a = 0; a < outer; a++) {
        for (let pass = 0; pass < inner; pass++) {
            const b = a % 2 === 0 ? pass : inner - 1 - pass;
            if (!skippedPrevious && !skippedInBand[b] && Math.random() < skipRate) {
                skippedPrevious = true;
                skippedInBand[b] = true;
                continue;
            }
            skippedPrevious = false;
            skippedInBand[b] = false;
            const col = transpose ? b : a;
            const row = transpose ? a : b;
            const x = Math.min(w, Math.floor(col * colWidth + Math.random() * colWidth));
            const y = Math.min(h, Math.floor(row * rowHeight + Math.random() * rowHeight));
            waypoints.push([x, y]);
        }
    }
    return waypoints;
}

function generateAnswer(size, settings = null) {
    const path = new Path(size);
    const state = { last: Math.floor(Math.random() * 2) };
    // 小盘自由游走已足够；大盘用途经点引导（单点失败跳过，尽力而为）。
    // 引导阶段按目标覆盖率封顶：扫得太满会把自由空间搅成碎迷宫，
    // 后续每步都要 BFS 且大量回退，单次游走可能失控到数十秒
    if (settings && size[0] * size[1] > 120) {
        const nodes = (size[0] + 1) * (size[1] + 1);
        const coverageTarget = 0.45 + 0.25 * settings.difficultyValue;
        // 上限是防"碎迷宫失控"的保险丝，不是密度控制（密度由 skipRate 决定）——
        // 设得太紧会把蛇形截断在尾带之前，留下大空白被质控拒绝
        const guideLimit = Math.floor(nodes * Math.min(0.8, coverageTarget * 1.2));
        for (const waypoint of sectorWaypoints(size, settings.difficultyValue)) {
            if (path.distance >= guideLimit ||
                (settings.deadlineAt && Date.now() > settings.deadlineAt)) {
                break;
            }
            if (path.map[path.index(waypoint[0], waypoint[1])]) {
                continue;
            }
            walkTo(path, waypoint, state, [size[0], size[1]]);
        }
    }
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
// 会留下超大空区，游荡途经点让字母题的区域划分接近普通题。
// alsoKeep 由调用方决定：字母题生成期间保留链会临时圈住终点角，不能守护终点
function wander(path, state, alsoKeep = null) {
    const waypoint = randomFreeNode(path);
    if (waypoint) {
        walkTo(path, waypoint, state, alsoKeep);
    }
}

// 字母题三段式生成：游走到链端 → 强制沿字母轮廓链走完 → 下一条链/终点。
// 字母内部边全程禁止穿越，保证字母区域不被再切分。
function generateAnswerWithBuildings(size, placements) {
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

        // 注意：保留中的链可能临时把终点角围住（属正常布局），这里不能守护终点；
        // 但游荡至少要守护马上要去的链入口，否则一半的尝试死在"荡完就进不去"上。
        // 被链圈死终点的罕见死局靠上层重试兜住
        path.releaseNodes([entry]);
        wander(path, state, entry);
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

    wander(path, state, [size[0], size[1]]);
    if (!walkTo(path, [size[0], size[1]], state)) {
        return null;
    }
    path.step(0);
    return path;
}

function markTouchedCells(touched, x, y, size) {
    if (x >= 0 && x < size[0] && y >= 0 && y < size[1]) {
        touched[x * size[1] + y] = 1;
    }
}

function createTouchMap(answer, size) {
    if (answer.touchMap &&
        answer.touchMapWidth === size[0] &&
        answer.touchMapHeight === size[1]) {
        return answer.touchMap;
    }

    const touched = new Uint8Array(size[0] * size[1]);
    let x = 0;
    let y = 0;

    for (const move of answer.queue) {
        const nextX = x + MOVE_DX[move];
        const nextY = y + MOVE_DY[move];
        if (move === 0 || move === 2) {
            const edgeX = Math.min(x, nextX);
            const edgeY = y;
            markTouchedCells(touched, edgeX, edgeY - 1, size);
            markTouchedCells(touched, edgeX, edgeY, size);
        } else {
            const edgeX = x;
            const edgeY = Math.min(y, nextY);
            markTouchedCells(touched, edgeX - 1, edgeY, size);
            markTouchedCells(touched, edgeX, edgeY, size);
        }
        x = nextX;
        y = nextY;
    }

    answer.touchMap = touched;
    answer.touchMapWidth = size[0];
    answer.touchMapHeight = size[1];
    return touched;
}

function createTouchPrefix(answer, size) {
    if (answer.touchPrefix &&
        answer.touchPrefixWidth === size[0] &&
        answer.touchPrefixHeight === size[1]) {
        return answer.touchPrefix;
    }

    const [w, h] = size;
    const stride = h + 1;
    const touched = createTouchMap(answer, size);
    const prefix = new Uint16Array((w + 1) * (h + 1));

    for (let x = 1; x <= w; x++) {
        let rowSum = 0;
        for (let y = 1; y <= h; y++) {
            rowSum += touched[(x - 1) * h + (y - 1)];
            prefix[x * stride + y] = prefix[(x - 1) * stride + y] + rowSum;
        }
    }

    answer.touchPrefix = prefix;
    answer.touchPrefixWidth = w;
    answer.touchPrefixHeight = h;
    return prefix;
}

function analyzeLocalCoverage(answer, size, window = LOCAL_COVERAGE_WINDOW, weakestLimit = 0) {
    const [w, h] = size;
    if (w < window || h < window) {
        return {
            window,
            blankWindows: 0,
            minTouches: window * window,
            weakestWindows: weakestLimit ? [] : undefined,
            averageTouches: window * window,
        };
    }

    if (weakestLimit === 0) {
        answer.coverageCache ??= new Map();
        const cached = answer.coverageCache.get(window);
        if (cached) {
            return cached;
        }
    }

    const stride = h + 1;
    const prefix = createTouchPrefix(answer, size);
    const weakestWindows = weakestLimit ? [] : null;
    let blankWindows = 0;
    let minTouches = Infinity;
    let touchSum = 0;
    let windowCount = 0;

    const readWindowTouches = (startX, startY) => {
        const endX = startX + window;
        const endY = startY + window;
        return prefix[endX * stride + endY] -
            prefix[startX * stride + endY] -
            prefix[endX * stride + startY] +
            prefix[startX * stride + startY];
    };

    for (let startX = 0; startX <= w - window; startX++) {
        for (let startY = 0; startY <= h - window; startY++) {
            const touches = readWindowTouches(startX, startY);
            windowCount++;
            touchSum += touches;
            minTouches = Math.min(minTouches, touches);
            if (!touches) {
                blankWindows++;
            }
            if (weakestLimit) {
                weakestWindows.push({
                    x: startX,
                    y: startY,
                    touches,
                    center: [startX + window / 2, startY + window / 2],
                });
                weakestWindows.sort((a, b) => a.touches - b.touches);
                if (weakestWindows.length > weakestLimit) {
                    weakestWindows.length = weakestLimit;
                }
            }
        }
    }

    const result = {
        window,
        blankWindows,
        minTouches,
        weakestWindows: weakestLimit ? weakestWindows : undefined,
        averageTouches: touchSum / windowCount,
    };
    if (weakestLimit === 0) {
        answer.coverageCache.set(window, result);
    }
    return result;
}

// 质控指标：任意滑动 4x4 方块中都至少要碰到一段答案线，避免大块空区。
export function hasLocalLineCoverage(answer, size, window = LOCAL_COVERAGE_WINDOW) {
    return analyzeLocalCoverage(answer, size, window).blankWindows === 0;
}

function coverageProfile(answer, size, settings) {
    const coarse = analyzeLocalCoverage(answer, size, settings.localCoverageWindow);
    const dense = settings.mutationWindow === settings.localCoverageWindow
        ? coarse
        : analyzeLocalCoverage(answer, size, settings.mutationWindow);
    return { coarse, dense };
}

// 区域划分质量检查：区域够多、没有孤格或占半盘的巨区。
// 区域数下限要封顶：√(cells/2) 在大盘上会涨到 20+，而打分目标才 8 个区域，
// 扫掠型路径天然十几个区域，不封顶会把所有大盘候选无差别拒掉
function validAnswer(answer, size, settings, profile = coverageProfile(answer, size, settings)) {
    const cells = size[0] * size[1];
    if (profile.coarse.blankWindows > 0) {
        return false;
    }
    const minGroups = Math.min(Math.sqrt(cells / 2), 12);
    if (answer.group.length < minGroups && Math.sqrt(cells) > 3) {
        return false;
    }
    for (const member of answer.group) {
        if ((member === 1 || member > cells / 2) && cells > 9) {
            return false;
        }
    }
    return true;
}

function turnRatio(answer) {
    if (answer.turnRatioCache !== undefined) {
        return answer.turnRatioCache;
    }
    let turns = 0;
    for (let i = 1; i < answer.queue.length; i++) {
        if (answer.queue[i] !== answer.queue[i - 1]) {
            turns++;
        }
    }
    answer.turnRatioCache = answer.queue.length > 1 ? turns / (answer.queue.length - 1) : 0;
    return answer.turnRatioCache;
}

// 难度打分：路径覆盖率与区域数越贴近该关卡的目标越好；
// 绕度（转弯占比）向随难度上升的目标靠拢——长直线走廊单调，全是急弯又噪
function scoreAnswer(answer, size, t, settings, profile = coverageProfile(answer, size, settings)) {
    const nodes = (size[0] + 1) * (size[1] + 1);
    const coverage = answer.distance / nodes;
    const coverageTarget = 0.45 + 0.25 * t;
    const cells = size[0] * size[1];
    const groupTarget = Math.min(8, Math.max(2, cells / 5));
    const largestGroupRatio = Math.max(...answer.group) / cells;
    const turnTarget = 0.35 + 0.2 * t;
    const local = profile.coarse;
    const dense = profile.dense;
    return -(Math.abs(coverage - coverageTarget) * 3 +
        Math.abs(answer.group.length - groupTarget) / groupTarget) +
        local.minTouches * 0.18 -
        local.blankWindows * 5 +
        dense.minTouches * 0.24 +
        dense.averageTouches * 0.025 -
        dense.blankWindows * 2.6 -
        largestGroupRatio * 1.15 -
        Math.abs(turnRatio(answer) - turnTarget) * 1.4;
}

// 教学楼题的放宽过滤：强制链走向让区域分布天然不如自由游走均匀，
// 只挡明显劣质盘（巨型空区/区域过少），孤格转为打分惩罚
function validBuildingAnswer(answer, size, settings, profile = coverageProfile(answer, size, settings)) {
    const cells = size[0] * size[1];
    if (profile.coarse.blankWindows > 0) {
        return false;
    }
    // 小盘（≤12 格）楼 + 余下就是 2 个区域，属正常形态
    if (answer.group.length < (cells <= 12 ? 2 : 3)) {
        return false;
    }
    for (const member of answer.group) {
        if (member > cells * 0.75) {
            return false;
        }
    }
    return true;
}

function scoreBuildingAnswer(answer, size, t, settings, profile = coverageProfile(answer, size, settings)) {
    const singletons = answer.group.filter(member => member === 1).length;
    return scoreAnswer(answer, size, t, settings, profile) - singletons * 0.15;
}

function needsRefinement(answer, size, settings) {
    const nodes = (size[0] + 1) * (size[1] + 1);
    const coverage = answer.distance / nodes;
    const profile = coverageProfile(answer, size, settings);
    return profile.coarse.blankWindows > 0 ||
        profile.dense.blankWindows > 0 ||
        profile.coarse.minTouches < settings.mutationMinTouches ||
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
            if ((x === 0 && y === 0) || (x === w && y === h)) {
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
    const coverage = analyzeLocalCoverage(answer, size, settings.mutationWindow, settings.mutationTargetWindows);
    const targetWindows = coverage.weakestWindows
        .map(window => ({ ...window, window: coverage.window }));
    if (!targetWindows.length) {
        return answer;
    }

    let best = answer;
    let bestScore = scoreAnswer(answer, size, t, settings);

    for (const targetWindow of targetWindows) {
        if (settings.deadlineAt && Date.now() > settings.deadlineAt) {
            break;
        }
        const cutCandidates = pickCutCandidates(answer, targetWindow, settings);
        for (const cut of cutCandidates) {
            if (settings.deadlineAt && Date.now() > settings.deadlineAt) {
                break;
            }
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
                    !walkTo(path, waypoint, state, [size[0], size[1]])) {
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
        if (settings.deadlineAt && Date.now() > settings.deadlineAt) {
            break;
        }
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

function buildBuildingPlans(byBuilding, count, requireAllFamilies = true) {
    const available = byBuilding
        .map((placements, index) => placements.length ? index : null)
        .filter(index => index !== null);
    if (!available.length) {
        return [];
    }
    if (requireAllFamilies && available.length !== byBuilding.length) {
        return [];
    }
    if (count > available.length) {
        return [];
    }
    // 挑 count 栋互不相同的楼的全部组合；<= C(5,k) = 10 个
    const plans = [];
    const pick = (start, chosen) => {
        if (chosen.length === count) {
            plans.push([...chosen]);
            return;
        }
        for (let i = start; i < available.length; i++) {
            chosen.push(available[i]);
            pick(i + 1, chosen);
            chosen.pop();
        }
    };
    pick(0, []);
    return shuffleArray(plans);
}

// 随机采样 k 栋楼的两两相容放置元组（全笛卡尔积在大盘上会爆，采样即可）
function compatiblePlacementTuples(byBuilding, plan, limit = 24, tries = 160) {
    const tuples = [];
    for (let attempt = 0; attempt < tries && tuples.length < limit; attempt++) {
        const chosen = [];
        let failed = false;
        for (const buildingIndex of plan) {
            const options = byBuilding[buildingIndex];
            let placed = null;
            for (let pickTry = 0; pickTry < 8; pickTry++) {
                const candidate = options[random(options.length)];
                if (chosen.every(existing => compatiblePlacements(existing, candidate))) {
                    placed = candidate;
                    break;
                }
            }
            if (!placed) {
                failed = true;
                break;
            }
            chosen.push(placed);
        }
        if (!failed) {
            tuples.push(chosen);
        }
    }
    return tuples;
}

function collectBuildingCandidates(size, plans, byBuilding, settings, deadline) {
    const candidates = [];
    // 大盘单次尝试贵得多，按面积收紧总配额（失败重试是烧预算的主力）
    const totalAttempts = settings.boardCells > 350 ? 12
        : settings.boardCells > 200 ? 20
        : BUILDING_ATTEMPTS;
    const planBudget = Math.max(1, Math.ceil(totalAttempts / Math.max(plans.length, 1)));
    let attemptsRemaining = totalAttempts;

    for (const plan of plans) {
        if (!attemptsRemaining || Date.now() > deadline) {
            break;
        }

        const placementOptions = plan.length === 1
            ? byBuilding[plan[0]].map(placement => [placement])
            : compatiblePlacementTuples(byBuilding, plan);
        if (!placementOptions.length) {
            continue;
        }

        const budget = Math.min(planBudget, attemptsRemaining);
        let collectedForPlan = 0;
        for (let attempt = 0; attempt < budget; attempt++) {
            // 单组合攒够就换下一个组合：既省预算，又保证多个字母组合都有候选可供均匀抽签
            if (collectedForPlan >= BUILDING_CANDIDATES_PER_PLAN || Date.now() > deadline) {
                break;
            }
            attemptsRemaining--;
            const chosen = randomItem(placementOptions);
            const candidate = generateAnswerWithBuildings(size, chosen);
            if (!candidate) {
                continue;
            }
            // 大盘先做廉价结构校验：注定不合格的候选不进昂贵的 refine
            if (size[0] * size[1] > 200 &&
                !validBuildingAnswer(candidate, size, settings)) {
                continue;
            }
            const refined = refineCandidate(candidate, size, settings.difficultyValue, settings);
            const profile = coverageProfile(refined, size, settings);
            if (validBuildingAnswer(refined, size, settings, profile)) {
                collectedForPlan++;
                pushTopEntries(candidates, {
                    candidate: refined,
                    chosen,
                    score: scoreBuildingAnswer(refined, size, settings.difficultyValue, settings, profile),
                }, BUILDING_CANDIDATE_LIMIT);
            }
        }
    }

    return candidates;
}

function ensurePairPresence(groupType, answer, buildingGroups) {
    for (const [, queue] of groupType) {
        if (queue.length) {
            return;
        }
    }
    for (let i = 0; i < answer.group.length; i++) {
        const member = answer.group[i];
        if (member >= 4 && !buildingGroups.has(i)) {
            const set = randomSet(2, member);
            groupType[i][1] = [...set].map((element, index) => [element, 11, index]);
            return;
        }
    }
}

function fillSigns(answer, size, t, buildings, settings) {
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
    const buildingGroups = new Set(
        buildings.map(building => answer.groupMap[building.markerCell[0]][building.markerCell[1]]));

    const sign = Array.from({ length: size[0] + 1 }, () =>
        Array.from({ length: size[1] + 1 }, () => [[0, 0], [0, 0], [0, 0]]));

    for (let i = 0; i < answer.group.length; i++) {
        const member = answer.group[i];
        let queue = [];
        if (pairMode !== 'off' && member >= 4 && !buildingGroups.has(i) && Math.random() >= noPairRate) {
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
        ensurePairPresence(groupType, answer, buildingGroups);
    }

    // remaining 作为组内格子的倒计数，标记红专/理实落在组内第几个格子上
    const remaining = answer.group.slice();
    const groupClueCount = new Array(answer.group.length).fill(0);
    const groupCells = answer.group.map(() => []);
    for (let i = 0; i < size[0]; i++) {
        for (let j = 0; j < size[1]; j++) {
            const group = answer.groupMap[i][j];
            remaining[group]--;
            groupCells[group].push([i, j]);
            const marked = groupType[group][1].find(cell => cell[0] === remaining[group]);
            if (marked) {
                sign[i][j][2] = [marked[1], marked[2]];
                groupClueCount[group]++;
            } else if (settings.collegesEnabled &&
                Math.random() < SIGN_RATE / Math.sqrt(Math.sqrt(remaining[group]))) {
                sign[i][j][2] = [groupType[group][0], random(TYPE_SCALE[groupType[group][0]])];
                groupClueCount[group]++;
            } else if ((i + j) % 2) {
                sign[i][j][2] = [0, 1];
            } else {
                sign[i][j][2] = [0, 0];
            }
        }
    }

    // 质量保底：完全没有线索的区域等于不受约束（怎么围都行），题面松散无趣——
    // 给这类区域（≥2 格、非字母区域）补一枚该组书院签
    if (settings.collegesEnabled) {
        for (let group = 0; group < answer.group.length; group++) {
            if (groupClueCount[group] > 0 || buildingGroups.has(group) || groupCells[group].length < 2) {
                continue;
            }
            const [x, y] = randomItem(groupCells[group]);
            sign[x][y][2] = [groupType[group][0], random(TYPE_SCALE[groupType[group][0]])];
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

    // 教学楼标记格（覆盖该格原有签；所在组已强制无配对约束，覆盖安全）
    for (const building of buildings) {
        const [x, y] = building.markerCell;
        sign[x][y][2] = [13, building.buildingIndex];
    }

    return sign;
}

function pickDesiredBuildingCount(byBuilding, settings) {
    if (settings.buildingMode === 'none') {
        return 0;
    }
    if (settings.buildingMode === 'force') {
        return Math.min(settings.forceBuildingCount, settings.maxBuildingCount);
    }
    // balanced：出现概率随难度爬升（小板低概率见楼，后期常驻）；
    // 出现后栋数也随难度上探，最多 5 栋且互不相同
    const available = byBuilding.filter(placements => placements.length > 0).length;
    if (!available) {
        return 0;
    }
    const appearChance = 0.12 + 0.7 * settings.difficultyValue;
    if (Math.random() >= appearChance) {
        return 0;
    }
    // 大盘多链成功率骤降、每次失败都烧一轮 refine——栋数按面积封顶
    const areaCap = settings.boardCells > 240 ? 2 : settings.boardCells > 140 ? 3 : 5;
    const cap = Math.min(settings.maxBuildingCount, available, areaCap);
    let count = 1;
    while (count < cap && Math.random() < 0.3 + 0.4 * settings.difficultyValue) {
        count++;
    }
    return count;
}

function canUseBuildings(byBuilding, settings) {
    if (settings.buildingMode === 'none') {
        return false;
    }
    if (settings.requireAllBuildingFamilies) {
        return byBuilding.every(placements => placements.length > 0);
    }
    return byBuilding.some(placements => placements.length > 0);
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
    // 大盘上"消灭所有 2×2 空白"≈铺满全盘，永远达不到 ⇒ needsRefinement 永真，
    // 每个候选都白跑整套变异游走。把变异目标窗口一并放大到与盘面匹配的尺度。
    settings.mutationWindow = Math.max(settings.mutationWindow, 3);
    if (area > 484) {
        settings.localCoverageWindow = Math.max(settings.localCoverageWindow, 5);
        settings.mutationWindow = Math.max(settings.mutationWindow, 4);
        // 超大盘单次变异重排 40 次游走太贵（每次 ~10ms），收紧采样规模
        settings.mutationTargetWindows = 1;
        settings.mutationCutSamples = Math.min(settings.mutationCutSamples, 3);
        settings.mutationWaypointSamples = Math.min(settings.mutationWaypointSamples, 3);
    }
}

// 组合教学楼：随难度低概率把 2~3 栋不同的楼拼成一个区域
function tryComboPlacement(size, settings) {
    const t = settings.difficultyValue;
    if (settings.buildingMode === 'none' || t < 0.8 || Math.random() > 0.18 + 0.12 * t) {
        return null;
    }
    const [w, h] = size;
    const count = t >= 0.98 && Math.random() < 0.3 ? 3 : 2;
    // 三楼组合限定含 四教+五教（小形状）：全量枚举首个调用即完成且成本可控；
    // 双楼组合不限
    const indices = count === 3
        ? [shuffleArray([0, 1, 2])[0], 3, 4].sort((a, b) => a - b)
        : shuffleArray([0, 1, 2, 3, 4]).slice(0, 2).sort((a, b) => a - b);
    const { shapes } = comboShapes(indices);
    for (let attempt = 0; attempt < 24; attempt++) {
        const combo = shapes[random(shapes.length)];
        const shape = combo.cells;
        let maxX = 0;
        let maxY = 0;
        for (const [x, y] of shape) {
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        }
        if (maxX >= w || maxY >= h) {
            continue;
        }
        const ox = random(w - maxX);
        const oy = random(h - maxY);
        if (!touchedSides(shape, ox, oy, w, h).length) {
            continue;
        }
        const placement = analyzePlacement(-1, shape, ox, oy, w, h);
        if (!placement) {
            continue;
        }
        placement.markers = combo.parts.map((part, index) => {
            const [px, py] = part[random(part.length)];
            return { buildingIndex: indices[index], markerCell: [px + ox, py + oy] };
        });
        return placement;
    }
    return null;
}

// 通道阻断：从答案未穿过的内部边里挑几条，画线阶段直接封死。
// 答案不经过 ⇒ 题目仍可解；被封的两格永远同区（渲染成融合格）。
function pickBlockedEdges(answer, size, settings) {
    const t = settings.difficultyValue;
    if (t < 0.06) {
        return [];
    }
    const [w, h] = size;
    const barrier = answer.createBarrier();
    const candidates = [];
    for (let ex = 0; ex < w; ex++) {
        for (let ey = 1; ey < h; ey++) {
            if (!barrier[ex][ey][0]) {
                candidates.push([ex, ey, 0]);
            }
        }
    }
    for (let ex = 1; ex < w; ex++) {
        for (let ey = 0; ey < h; ey++) {
            if (!barrier[ex][ey][1]) {
                candidates.push([ex, ey, 1]);
            }
        }
    }
    shuffleArray(candidates);
    // 与路名同量级：按候选边比例给配额（难度越高越密），解锁后至少 1 条
    const rate = 0.05 + 0.10 * t;
    const target = Math.max(1, Math.round(candidates.length * rate));
    return candidates.slice(0, target);
}

export function generatePuzzle(size, level = 0, options = {}) {
    const settings = createGenerationSettings(level, options);
    settings.boardCells = size[0] * size[1];
    scaleEffortForSize(settings, size);
    const t = settings.difficultyValue;
    const startedAt = Date.now();
    const deadline = startedAt + settings.generationBudgetMs;
    // 让深层的变异/修补循环也能感知预算，防止单次 refine 吃掉整个 deadline
    settings.deadlineAt = deadline;
    let answer = null;
    const buildings = [];
    const byBuilding = placementsByBuilding(size);

    // 高难度：先试组合楼（失败自然回落到单楼/普通流程）
    // 组合候选不做变异打磨：拼合链本身已是题面主特征，
    // 大盘上一次 refine 数百毫秒、失败即白费，是生成耗时的最大波动源
    const comboPlacement = tryComboPlacement(size, settings);
    if (comboPlacement) {
        const candidate = generateAnswerWithBuildings(size, [comboPlacement]);
        if (candidate && validBuildingAnswer(candidate, size, settings)) {
            answer = candidate;
            buildings.push(...comboPlacement.markers);
        }
    }

    if (!answer && canUseBuildings(byBuilding, settings)) {
        // 字母阶段最多占预算 60%，留时间给普通题兜底
        const buildingDeadline = startedAt + settings.generationBudgetMs * 0.6;
        const desired = pickDesiredBuildingCount(byBuilding, settings);
        for (let count = desired; count >= 1 && !answer; count--) {
            const plans = buildBuildingPlans(byBuilding, count, settings.requireAllBuildingFamilies);
            const candidates = collectBuildingCandidates(size, plans, byBuilding, settings, buildingDeadline);
            if (candidates.length) {
                // 先在"有合格候选的字母组合"里均匀抽一个，再取组内最高分——
                // 全局 argmax 会系统性偏向链形态更好 refine 的字母（U/C 刷屏的根源）
                const byPlanKey = new Map();
                for (const entry of candidates) {
                    const key = entry.chosen
                        .map(placement => placement.buildingIndex)
                        .sort((a, b) => a - b)
                        .join('+');
                    if (!byPlanKey.has(key)) {
                        byPlanKey.set(key, []);
                    }
                    byPlanKey.get(key).push(entry);
                }
                const group = randomItem([...byPlanKey.values()]);
                const best = group.reduce((bestSoFar, entry) =>
                    scoreBuildingAnswer(entry.candidate, size, t, settings) >
                        scoreBuildingAnswer(bestSoFar.candidate, size, t, settings) ? entry : bestSoFar);
                answer = best.candidate;
                for (const placement of best.chosen) {
                    buildings.push({
                        buildingIndex: placement.buildingIndex,
                        markerCell: placement.cells[random(placement.cells.length)],
                    });
                }
            }
        }
    }

    // 普通题：先多生成若干候选，再做局部变异修补，最后按得分择优
    if (!answer) {
        const candidates = [];
        const coveredFallbacks = [];
        const looseFallbacks = [];
        const rememberCandidate = (candidate) => {
            const profile = coverageProfile(candidate, size, settings);
            const score = scoreAnswer(candidate, size, t, settings, profile);
            pushTopEntries(looseFallbacks, { candidate, score }, settings.normalCandidateLimit);
            if (profile.coarse.blankWindows === 0) {
                pushTopEntries(coveredFallbacks, { candidate, score }, settings.normalCandidateLimit);
            }
            if (validAnswer(candidate, size, settings, profile)) {
                pushTopEntries(candidates, { candidate, score }, settings.normalCandidateLimit);
            }
        };

        for (let attempt = 0; attempt < settings.normalCandidateAttempts; attempt++) {
            // 攒够择优候选就停；过了预算也停（下方兜底层能从 covered/loose 里选）
            if (candidates.length >= settings.normalCandidateLimit || Date.now() > deadline) {
                break;
            }
            const candidate = generateAnswer(size, settings);
            if (!candidate) {
                continue;
            }
            const refined = refineCandidate(candidate, size, t, settings);
            rememberCandidate(refined);
        }
        // 兜底一级：继续采样并记住最好的"覆盖过关"候选，别被第一张尚可题面绑架。
        // 只用 75% 预算——严格候选迟迟不来时，早点接受 covered/loose 兜底
        const strictDeadline = startedAt + settings.generationBudgetMs * 0.75;
        let fallbackAttempts = 0;
        while (!candidates.length && fallbackAttempts < 600 && Date.now() <= strictDeadline) {
            const candidate = generateAnswer(size, settings);
            if (candidate) {
                rememberCandidate(refineCandidate(candidate, size, t, settings));
            }
            fallbackAttempts++;
        }
        // 兜底二级：若严格质控一个都没有，至少拿"覆盖过关"里最好的；再不济才退到任意最优
        if (candidates.length) {
            answer = candidates[0].candidate;
        } else if (coveredFallbacks.length) {
            answer = coveredFallbacks[0].candidate;
        }
        while (!answer) {
            const candidate = generateAnswer(size, settings);
            if (candidate) {
                rememberCandidate(refineCandidate(candidate, size, t, settings));
                answer = looseFallbacks[0]?.candidate ?? null;
            }
        }
    }

    const sign = fillSigns(answer, size, t, buildings, settings);
    const blockedEdges = pickBlockedEdges(answer, size, settings);
    return { size, sign, answer, buildings, settings, blockedEdges };
}
