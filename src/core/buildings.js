"use strict";

// 教学楼区块：路径圈出的区域必须与某栋教学楼的形状完全一致，
// 允许旋转与镜像（与字母题不同），五栋楼都能装进 2×3。
// 楼贴住棋盘外框放置时，"内部轮廓"（轮廓减去与外框重合的部分）恰好构成
// 一条两端落在外框上的开放链——路径沿链走一遍即可圈出该楼。
// 贴边规则：任意一条外框边都可以贴；优先"恰好贴一条边"，小板放不下时豁免。
// 不同的楼必须各占独立区域（不做 Witness 式多形状拼砌，控制生成/判题成本）。

// x = 区域格。五栋教学楼的原始掩码：
export const BUILDING_MASKS = [
    ['xox',
     'xxx'],   // 一教：物理实验教学中心，形似凹
    ['oxo',
     'xxx'],   // 二教：临接水上报告厅，凸型
    ['oxx',
     'xxo'],   // 三教：非垂直结构抽象为 Z 型
    ['xx',
     'xx'],    // 四教：在线教育 App，图标是正方形
    ['xxx'],   // 五教：临近东区北门，一条直线
];

export const BUILDING_NAMES = ['一', '二', '三', '四', '五'];
export const BUILDING_TITLES = ['一教 · 凹', '二教 · 凸', '三教 · Z', '四教 · 方', '五教 · 线'];

function maskToCells(mask) {
    const cells = [];
    for (let row = 0; row < mask.length; row++) {
        for (let col = 0; col < mask[row].length; col++) {
            if (mask[row][col] === 'x') {
                cells.push([col, row]);
            }
        }
    }
    return cells;
}

function normalize(cells) {
    let minX = Infinity;
    let minY = Infinity;
    for (const [x, y] of cells) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
    }
    return cells
        .map(([x, y]) => [x - minX, y - minY])
        .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

function cellsKey(cells) {
    return cells.map(cell => cell.join(',')).join(';');
}

// 一栋楼的全部朝向（4 旋转 × 2 镜像，按形状键去重）
function orientationsOf(mask) {
    const seen = new Map();
    let cells = maskToCells(mask);
    for (let mirror = 0; mirror < 2; mirror++) {
        for (let rotation = 0; rotation < 4; rotation++) {
            const shape = normalize(cells);
            seen.set(cellsKey(shape), shape);
            cells = cells.map(([x, y]) => [-y, x]);   // 旋转 90°
        }
        cells = cells.map(([x, y]) => [-x, y]);       // 镜像
    }
    return [...seen.values()];
}

const ORIENTATIONS = BUILDING_MASKS.map(orientationsOf);
const ORIENTATION_KEYS = ORIENTATIONS.map(shapes => new Set(shapes.map(cellsKey)));

// 判题：区域格子归一化后是否与该楼的某个朝向完全一致
export function matchesBuilding(regionCells, buildingIndex) {
    return ORIENTATION_KEYS[buildingIndex].has(cellsKey(normalize(regionCells)));
}

// 放置触碰到的外框边
export function touchedSides(shape, ox, oy, w, h) {
    let top = false;
    let bottom = false;
    let left = false;
    let right = false;
    for (const [x, y] of shape) {
        const cx = x + ox;
        const cy = y + oy;
        if (cy === 0) top = true;
        if (cy === h - 1) bottom = true;
        if (cx === 0) left = true;
        if (cx === w - 1) right = true;
    }
    const sides = [];
    if (top) sides.push('top');
    if (bottom) sides.push('bottom');
    if (left) sides.push('left');
    if (right) sides.push('right');
    return sides;
}

// 边编码 (ex, ey, axis)：axis 0 为横边 (ex,ey)-(ex+1,ey)，axis 1 为竖边 (ex,ey)-(ex,ey+1)。
// key 与 path.js 的 edgeKey 编码一致：(ex * stride + ey) * 2 + axis
export function analyzePlacement(buildingIndex, shape, ox, oy, w, h) {
    const stride = h + 1;
    const cellKeys = new Set(shape.map(([x, y]) => (x + ox) * h + (y + oy)));
    const inRegion = (x, y) => x >= 0 && x < w && y >= 0 && y < h && cellKeys.has(x * h + y);

    const chainEdges = [];
    const interiorEdgeKeys = [];
    for (const [vx, vy] of shape) {
        const cx = vx + ox;
        const cy = vy + oy;
        // 上边（区域内相邻边只从下方格子计一次，避免重复）
        if (inRegion(cx, cy - 1)) {
            interiorEdgeKeys.push((cx * stride + cy) * 2);
        } else if (cy !== 0) {
            chainEdges.push([cx, cy, 0]);
        }
        // 下边
        if (!inRegion(cx, cy + 1) && cy + 1 !== h) {
            chainEdges.push([cx, cy + 1, 0]);
        }
        // 左边（区域内相邻边只从右侧格子计一次）
        if (inRegion(cx - 1, cy)) {
            interiorEdgeKeys.push((cx * stride + cy) * 2 + 1);
        } else if (cx !== 0) {
            chainEdges.push([cx, cy, 1]);
        }
        // 右边
        if (!inRegion(cx + 1, cy) && cx + 1 !== w) {
            chainEdges.push([cx + 1, cy, 1]);
        }
    }

    if (!chainEdges.length) {
        return null;
    }

    // 内部轮廓必须是一条简单开放链：所有节点度 ≤2，恰两个度 1 端点且在边框上
    const adjacency = new Map();
    const addEdge = (a, b) => {
        if (!adjacency.has(a)) adjacency.set(a, []);
        if (!adjacency.has(b)) adjacency.set(b, []);
        adjacency.get(a).push(b);
        adjacency.get(b).push(a);
    };
    for (const [ex, ey, axis] of chainEdges) {
        const a = ex * stride + ey;
        const b = axis === 0 ? (ex + 1) * stride + ey : ex * stride + (ey + 1);
        addEdge(a, b);
    }

    const endpoints = [];
    for (const [, neighbors] of adjacency) {
        if (neighbors.length > 2) {
            return null;
        }
    }
    for (const [node, neighbors] of adjacency) {
        if (neighbors.length === 1) {
            endpoints.push(node);
        }
    }
    if (endpoints.length !== 2) {
        return null;
    }
    const onBorder = (node) => {
        const x = (node / stride) | 0;
        const y = node % stride;
        return x === 0 || x === w || y === 0 || y === h;
    };
    if (!endpoints.every(onBorder)) {
        return null;
    }
    // 链不得占用起点 (0,0) 与终点 (W,H) 节点
    if (adjacency.has(0) || adjacency.has(w * stride + h)) {
        return null;
    }

    // 顺链走出有序节点序列，并确认连通（无游离环）
    const orderedNodes = [endpoints[0]];
    let prev = -1;
    let current = endpoints[0];
    while (true) {
        const next = adjacency.get(current).find(node => node !== prev);
        if (next === undefined) {
            break;
        }
        prev = current;
        current = next;
        orderedNodes.push(current);
    }
    if (orderedNodes.length !== chainEdges.length + 1) {
        return null;
    }

    return {
        buildingIndex,
        cells: shape.map(([x, y]) => [x + ox, y + oy]),
        cellKeys,
        chainNodes: orderedNodes.map(node => [(node / stride) | 0, node % stride]),
        chainNodeKeys: new Set(orderedNodes),
        interiorEdgeKeys,
    };
}

// 枚举某栋楼（含所有朝向）的全部几何合法放置，附带贴边信息
function placementsForBuilding(buildingIndex, w, h) {
    const results = [];
    for (const shape of ORIENTATIONS[buildingIndex]) {
        let maxX = 0;
        let maxY = 0;
        for (const [x, y] of shape) {
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        }
        for (let ox = 0; ox + maxX < w; ox++) {
            for (let oy = 0; oy + maxY < h; oy++) {
                const sides = touchedSides(shape, ox, oy, w, h);
                if (!sides.length) {
                    continue;
                }
                const placement = analyzePlacement(buildingIndex, shape, ox, oy, w, h);
                if (placement) {
                    placement.sides = sides;
                    results.push(placement);
                }
            }
        }
    }
    return results;
}

// 每栋楼：优先只取"恰好贴一条边"的放置；小板放不下单边时豁免为贴多边。
// 结果只依赖尺寸，按尺寸缓存（经典逐关、无尽爬坡、重抽都在反复用同一批尺寸）
const placementsCache = new Map();

export function placementsByBuilding(size) {
    const [w, h] = size;
    const cacheKey = `${w}x${h}`;
    if (placementsCache.has(cacheKey)) {
        return placementsCache.get(cacheKey);
    }
    const result = BUILDING_MASKS.map((_, buildingIndex) => {
        const all = placementsForBuilding(buildingIndex, w, h);
        const strict = all.filter(placement => placement.sides.length === 1);
        return strict.length ? strict : all;
    });
    placementsCache.set(cacheKey, result);
    return result;
}

export function hasAnyBuildingPlacement(size) {
    return placementsByBuilding(size).some(placements => placements.length > 0);
}

// ===== 组合教学楼：算法枚举"若干栋楼拼成一块"的全部连通精确拼合 =====
// 判题时区域归一化后查形状键集合；生成时从形状列表随机取一个走链式放置。
// 多重集（去重排序的楼编号）→ { keys: Set, shapes: [{cells, parts}] }，惰性计算并缓存。

const comboCache = new Map();

function comboKeyOf(indices) {
    return [...indices].sort((a, b) => a - b).join('+');
}

function shapeUnion(base, addition, dx, dy) {
    const seen = new Set(base.map(([x, y]) => `${x},${y}`));
    for (const [x, y] of addition) {
        const key = `${x + dx},${y + dy}`;
        if (seen.has(key)) {
            return null;   // 重叠
        }
        seen.add(key);
    }
    return [...base, ...addition.map(([x, y]) => [x + dx, y + dy])];
}

function isConnected(cells) {
    const set = new Set(cells.map(([x, y]) => `${x},${y}`));
    const queue = [cells[0]];
    const visited = new Set([`${cells[0][0]},${cells[0][1]}`]);
    while (queue.length) {
        const [x, y] = queue.pop();
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
            const key = `${nx},${ny}`;
            if (set.has(key) && !visited.has(key)) {
                visited.add(key);
                queue.push([nx, ny]);
            }
        }
    }
    return visited.size === cells.length;
}

// 枚举 indices（2~3 栋互不相同的楼）的全部拼合形状。
// parts 记录每栋楼在拼合中的格子（放置数字标记用）。
export function comboShapes(indices) {
    const cacheKey = comboKeyOf(indices);
    if (comboCache.has(cacheKey)) {
        return comboCache.get(cacheKey);
    }
    // 逐栋合并：partials = [{cells, parts}]
    let partials = ORIENTATIONS[indices[0]].map(shape => ({
        cells: shape,
        parts: [shape],
    }));
    for (const buildingIndex of indices.slice(1)) {
        const next = [];
        const seenKeys = new Set();
        for (const partial of partials) {
            let maxX = 0;
            let maxY = 0;
            for (const [x, y] of partial.cells) {
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
            }
            for (const shape of ORIENTATIONS[buildingIndex]) {
                for (let dx = -3; dx <= maxX + 3; dx++) {
                    for (let dy = -3; dy <= maxY + 3; dy++) {
                        const union = shapeUnion(partial.cells, shape, dx, dy);
                        if (!union || !isConnected(union)) {
                            continue;
                        }
                        const normalized = normalize(union);
                        // 以"拼合形状 + 各部分位置"整体去重
                        const placedPart = shape.map(([x, y]) => [x + dx, y + dy]);
                        const dedupKey = cellsKey(normalized) + '|' +
                            [...partial.parts, placedPart].map(part => cellsKey(normalize(part))).join('#');
                        if (seenKeys.has(dedupKey)) {
                            continue;
                        }
                        seenKeys.add(dedupKey);
                        next.push({
                            cells: union,
                            parts: [...partial.parts, placedPart],
                        });
                    }
                }
            }
        }
        partials = next;
    }
    const keys = new Set(partials.map(entry => cellsKey(normalize(entry.cells))));
    const result = { keys, shapes: partials };
    comboCache.set(cacheKey, result);
    return result;
}

// 空闲预热：把双楼全组合 + 三楼白名单的拼形枚举挪出生成关键路径，
// 每次只算一个多重集，避免一次性长任务卡 UI
export function warmComboCache(delayMs = 400) {
    const multisets = [];
    for (let a = 0; a < 5; a++) {
        for (let b = a + 1; b < 5; b++) {
            multisets.push([a, b]);
        }
    }
    multisets.push([0, 3, 4], [1, 3, 4], [2, 3, 4]);
    let index = 0;
    const tick = () => {
        if (index >= multisets.length) {
            return;
        }
        comboShapes(multisets[index++]);
        setTimeout(tick, delayMs);
    };
    setTimeout(tick, delayMs);
}

// 判题：区域是否恰为这些楼的某种拼合
export function matchesCombo(regionCells, indices) {
    return comboShapes(indices).keys.has(cellsKey(normalize(regionCells)));
}

// 两个放置是否互不干扰（格子与链节点均不相交）
export function compatiblePlacements(a, b) {
    for (const key of a.cellKeys) {
        if (b.cellKeys.has(key)) {
            return false;
        }
    }
    for (const node of a.chainNodeKeys) {
        if (b.chainNodeKeys.has(node)) {
            return false;
        }
    }
    return true;
}
