"use strict";

// USTC 字母区块：路径圈出的区域必须与字母形状完全一致（固定朝向，不旋转、不镜像）。
// 字母贴住棋盘外框放置时，"内部轮廓"（轮廓减去与外框重合的部分）恰好构成
// 一条两端落在外框上的开放链——路径沿链走一遍即可圈出该字母。
// 贴边规则：任意一条外框边都可以贴，但不得同时接触两条边（贴角/横跨会让题目变平凡）；
// 仅当某字母在小板上不存在单边放置时，才豁免允许贴 2-3 条边（字母题刚解锁的尺寸）。

// x = 区域格（字形按正立方向书写；不对称设计增加可贴边的放置数）
export const LETTER_MASKS = [
    ['xooo',
     'xoox',
     'xoox',
     'xoox',
     'xxxx'],           // U —— 左臂高一格
    ['xxxo',
     'xooo',
     'xxxx',
     'ooox',
     'oxxx'],           // S
    ['xxxx',
     'oxoo',
     'oxoo',
     'oxoo',
     'oxoo'],           // T —— 竖笔偏左
    ['oxxo',
     'xxoo',
     'xooo',
     'xxoo',
     'oxxx'],           // C —— 圆角开口朝右
];

export const LETTER_NAMES = ['U', 'S', 'T', 'C'];

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

// 固定朝向的字母形状（不旋转）
const SHAPES = LETTER_MASKS.map(mask => normalize(maskToCells(mask)));
const SHAPE_KEYS = SHAPES.map(cellsKey);

// 判题：区域格子平移归一化后是否恰为该字母形状（不允许旋转/镜像）
export function matchesLetter(regionCells, letterIndex) {
    return SHAPE_KEYS[letterIndex] === cellsKey(normalize(regionCells));
}

// 放置触碰到的外框边
function touchedSides(shape, ox, oy, w, h) {
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
function analyzePlacement(letterIndex, shape, ox, oy, w, h) {
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
    for (const [node, neighbors] of adjacency) {
        if (neighbors.length > 2) {
            return null;
        }
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
        letterIndex,
        cells: shape.map(([x, y]) => [x + ox, y + oy]),
        cellKeys,
        chainNodes: orderedNodes.map(node => [(node / stride) | 0, node % stride]),
        chainNodeKeys: new Set(orderedNodes),
        interiorEdgeKeys,
    };
}

// 枚举某个字母的全部几何合法放置，附带贴边信息
function placementsForLetter(letterIndex, w, h) {
    const shape = SHAPES[letterIndex];
    let maxX = 0;
    let maxY = 0;
    for (const [x, y] of shape) {
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    }
    const results = [];
    for (let ox = 0; ox + maxX < w; ox++) {
        for (let oy = 0; oy + maxY < h; oy++) {
            const sides = touchedSides(shape, ox, oy, w, h);
            if (!sides.length) {
                continue;
            }
            const placement = analyzePlacement(letterIndex, shape, ox, oy, w, h);
            if (placement) {
                placement.sides = sides;
                placement.flushSide = sides[0];
                results.push(placement);
            }
        }
    }
    return results;
}

// 每个字母：优先只取"恰好贴一条边"的放置；小板放不下单边时豁免为贴多边
export function placementsByLetter(size) {
    const [w, h] = size;
    return SHAPES.map((_, letterIndex) => {
        const all = placementsForLetter(letterIndex, w, h);
        const strict = all.filter(placement => placement.sides.length === 1);
        return strict.length ? strict : all;
    });
}

// 兼容旧接口：拍平的全部放置
export function findPlacements(size) {
    return placementsByLetter(size).flat();
}

export function hasAllLetterPlacements(size) {
    return placementsByLetter(size).every(placements => placements.length > 0);
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
