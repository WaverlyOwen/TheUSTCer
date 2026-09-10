"use strict";

import { BUILDING_MASKS, matchesBuilding, matchesCombo } from './buildings.js';
import { colorKeyOf } from './puzzle-io.js';

// 剪枝求解器：由 zhou-tian-xing/TheUSTCer-solver 的 C++ 实现（issue #1）移植为纯 JS，
// 与 path.js / validator.js 共用一套编码：
//   格 (x,y)：x∈[0,w) y∈[0,h)，格下标 C = x*h + y
//   格点 V = x*(h+1) + y，边 E = 2V + axis（axis 0 横边 (x,y)-(x+1,y)，1 竖边 (x,y)-(x,y+1)）
//   方向 0右 1下 2左 3上；从 (0,0) 出发走到出口角 (w,h)，再向右跨出棋盘（answer 末位 0）
//
// 全部剪枝只删"必然无解"的分支，DFS 保持完备：
//   0) 静态判定（build 一次）：红专/理实全局数量失衡、强制边图分叉（起点/出口角外
//      挂 ≥3 条强制边、起终点挂 ≥2 条）或成环、强制边与"必合并格对"冲突 ⇒ 无解。
//      必合并格对（全局唯一的一对红-专/理-实）的公共边记入 mustMerge[]；
//      相邻两格同楼标记则相反——必须切开（并入 mustCut 强制边）。
//   1) 强制边：黑路名边 ∪ 必须切开的边（相邻两格书院异色 / 同为红专理实中的同一标记）。
//      端点挂着未覆盖强制边 ⇒ 下一步唯一；另一端已占用 ⇒ 死；挂两条 ⇒ 死。
//   2) 出口可达：每步一次格点 BFS，出口角不可达即死；可达集同时是 2b、3 的输入。
//   2b) 强制边全局必达（剪枝 1 的"全局化"）：未覆盖强制边必须被走到，而走到它至少
//      要有一个端点在可达集内（可达集单调收缩）。用洪泛规模做"级联门控"：本步
//      规模恰好少 1 = 无格点口袋合拢、任何端点可达性都没变，免扫描；少 ≥2 才扫
//      一次 O(强制边数) 的全表（reqStranded）。
//   3) 封闭区域：自避路径只在"端点从内部走到矩形边界"时围出新区域，此刻按
//      validator.js 的规则验证该区域（区域一旦封闭永不改变），违规即死。
//   3') 必合并墙（applyMove 内 O(1)）：切开 mustMerge[] 两侧格的墙一步都画不得
//       （仅"唯一红-专/理-实对"；同楼相邻已由 mustCut 强制画开）。
//   4) 焊死组（glue）：端点离开某格点后，该点上未画的内部边永远画不成，两侧格子
//      必然同区。用可回滚并查集维护每组的书院色 / 红专理实计数 / 楼标记，
//      出现"同区必违规"的组合立刻剪。
//
// 相比 C++ 原版的差异：自定义色格（类型 20+）按 colorKeyOf 的实际颜色参与书院判定，
// 与判题器一致；教学楼判形直接复用 buildings.js 的朝向表 / 组合表。

const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];
const BUILDING_CELL_COUNTS = BUILDING_MASKS.map(mask =>
    mask.reduce((count, row) => count + row.split('x').length - 1, 0));
const DEADLINE_CHECK_MASK = 2047;

function now() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

class BudgetExceeded extends Error {}

export class PuzzleSolver {
    constructor(puzzle) {
        const [w, h] = puzzle.size;
        this.w = w;
        this.h = h;
        this.W = h + 1;
        this.nv = (w + 1) * (h + 1);
        this.nc = w * h;
        const { nv, nc } = this;

        // ---- 静态题面 ----
        this.cellColor = new Int32Array(nc).fill(-1);   // 书院色编号（书院四色与自定义色统一按实际颜色编号）
        this.cellMark = new Int8Array(nc).fill(-1);     // 0红 1专 2理 3实
        this.cellBuilding = new Int8Array(nc).fill(-1); // 教学楼编号
        this.blocked = new Uint8Array(2 * nv);
        this.reqEdge = [];
        this.reqVa = [];
        this.reqVb = [];
        this.reqCa = [];
        this.reqCb = [];
        this.reqByEdge = new Int32Array(2 * nv).fill(-1);
        this.reqAtV = null;
        this.cov = null;
        this.uncovered = 0;
        this.mustMerge = null;      // 边→1：两侧格"必须同区"，沿它画墙即死（build 里建）

        // ---- 邻接查表 ----
        this.xOf = new Int32Array(nv);
        this.yOf = new Int32Array(nv);
        this.nxtV = new Int32Array(4 * nv).fill(-1);
        this.nxtE = new Int32Array(4 * nv);
        this.edgeCa = new Int32Array(2 * nv).fill(-1);   // 边两侧的格子（-1 = 该侧没有格）
        this.edgeCb = new Int32Array(2 * nv).fill(-1);
        for (let v = 0; v < nv; v++) {
            const x = (v / this.W) | 0;
            const y = v % this.W;
            this.xOf[v] = x;
            this.yOf[v] = y;
            for (let d = 0; d < 4; d++) {
                const nx = x + DX[d];
                const ny = y + DY[d];
                if (nx < 0 || nx > w || ny < 0 || ny > h) {
                    continue;
                }
                this.nxtV[v * 4 + d] = nx * this.W + ny;
                this.nxtE[v * 4 + d] = d === 0 ? v * 2
                    : d === 1 ? v * 2 + 1
                    : d === 2 ? (nx * this.W + y) * 2
                    : (x * this.W + ny) * 2 + 1;
            }
            // 横边 (x,y)-(x+1,y)：上方格 (x,y-1)、下方格 (x,y)；竖边 (x,y)-(x,y+1)：左方格 (x-1,y)、右方格 (x,y)
            if (x < w) {
                this.edgeCa[v * 2] = y >= 1 ? this.cellId(x, y - 1) : -1;
                this.edgeCb[v * 2] = y < h ? this.cellId(x, y) : -1;
            }
            if (y < h) {
                this.edgeCa[v * 2 + 1] = x >= 1 ? this.cellId(x - 1, y) : -1;
                this.edgeCb[v * 2 + 1] = x < w ? this.cellId(x, y) : -1;
            }
        }

        // ---- 动态搜索状态 ----
        this.occ = new Uint8Array(nv);
        this.wall = new Uint8Array(2 * nv);
        this.seal = new Int32Array(nc);
        this.sealedCnt = 0;
        this.sealLog = [];
        this.moves = [];
        this.solution = null;

        // ---- 临时缓冲（自增戳，免清零）----
        this.cellVis = new Int32Array(nc);
        this.passStamp = 0;
        this.compMark = new Int32Array(nc);
        this.compSeq = 0;
        this.compCells = [];
        this.queue = new Int32Array(Math.max(nv, nc));
        this.vertVis = new Int32Array(nv);
        this.vertStamp = 0;
        this.headId = 0;
        this.floodSize = 0;         // 最近一次 bfsReach 的可达格点数（级联门控用）

        // ---- 焊死组 ----
        this.glPar = new Int32Array(nc).fill(-1);
        this.glSize = new Int32Array(nc).fill(1);
        this.glColor = new Int32Array(nc).fill(-1);
        this.glMark = new Uint8Array(nc * 4);
        this.glBld = new Uint8Array(nc);
        this.glueLog = [];

        // ---- 预算与统计 ----
        this.nodes = 0;
        this.nodeBudget = Infinity;
        this.deadline = Infinity;
        this.budgetHit = false;
        this.randSeed = 0;
        this.depthLimit = Infinity;
        this.depthCut = false;

        this.impossible = !this.build(puzzle);
    }

    cellId(x, y) {
        return x * this.h + y;
    }

    edgeId(x, y, axis) {
        return (x * this.W + y) * 2 + axis;
    }

    onFrame(x, y) {
        return x === 0 || x === this.w || y === 0 || y === this.h;
    }

    addReq(e) {
        if (this.reqByEdge[e] >= 0) {
            return;
        }
        const v = e >> 1;
        this.reqByEdge[e] = this.reqEdge.length;
        this.reqEdge.push(e);
        this.reqVa.push(v);
        this.reqVb.push((e & 1) ? v + 1 : v + this.W);
        this.reqCa.push(this.edgeCa[e]);
        this.reqCb.push(this.edgeCb[e]);
    }

    build(puzzle) {
        const { w, h, nv } = this;
        const sign = puzzle.sign;
        const palette = puzzle.palette ?? [];
        const colorIds = new Map();
        const roads = [];
        for (let x = 0; x < w; x++) {
            for (let y = 0; y < h; y++) {
                const entry = sign[x][y];
                const type = entry[2];
                const c = this.cellId(x, y);
                const colorKey = colorKeyOf(type, palette);
                if (colorKey !== null) {
                    if (!colorIds.has(colorKey)) {
                        colorIds.set(colorKey, colorIds.size);
                    }
                    this.cellColor[c] = colorIds.get(colorKey);
                } else if (type[0] === 11 || type[0] === 12) {
                    this.cellMark[c] = (type[0] - 11) * 2 + type[1];
                } else if (type[0] === 13) {
                    this.cellBuilding[c] = type[1];
                }
                if (entry[0][0]) {
                    roads.push(this.edgeId(x, y, 0));
                }
                if (entry[1][0]) {
                    roads.push(this.edgeId(x, y, 1));
                }
            }
        }
        for (const [ex, ey, axis] of puzzle.blockedEdges ?? []) {
            const e = this.edgeId(ex, ey, axis);
            if (e < 0 || e >= 2 * nv) {
                return false;
            }
            this.blocked[e] = 1;
        }
        for (const e of roads) {
            this.addReq(e);
        }
        // 必须切开的内部格边：书院异色 / 同标记
        const mustCut = (a, b) =>
            (this.cellColor[a] >= 0 && this.cellColor[b] >= 0 && this.cellColor[a] !== this.cellColor[b]) ||
            (this.cellMark[a] >= 0 && this.cellMark[a] === this.cellMark[b]) ||
            // 同一栋楼的标记必须分属不同区域（同区域重复楼标记违规，见 validator.js），
            // 相邻两格同楼 ⇒ 公共边必须被路径画开（与 glue 的 glBld 相交判死同语义）
            (this.cellBuilding[a] >= 0 && this.cellBuilding[a] < BUILDING_MASKS.length &&
             this.cellBuilding[a] === this.cellBuilding[b]);
        for (let x = 0; x < w; x++) {
            for (let y = 1; y < h; y++) {
                if (mustCut(this.cellId(x, y - 1), this.cellId(x, y))) {
                    this.addReq(this.edgeId(x, y, 0));
                }
            }
        }
        for (let x = 1; x < w; x++) {
            for (let y = 0; y < h; y++) {
                if (mustCut(this.cellId(x - 1, y), this.cellId(x, y))) {
                    this.addReq(this.edgeId(x, y, 1));
                }
            }
        }
        for (const e of this.reqEdge) {
            if (this.blocked[e]) {
                return false;   // 强制边落在阻断边上：必无解
            }
        }
        // ===== 静态必无解判定（build 一次，O(格+边)），与 C++ 原版 2026-09 版同口径 =====
        // 1) 红专/理实"成对"是逐区域规则（每区域红数==专数且 ≤1，理实同理）；对全部
        //    区域求和即得全局红数必须==专数，失衡 ⇒ 无论如何划分都有"有红无专"区域。
        // 2) 路径是简单弧：一个格点至多被经过一次、用掉两条相邻边 ⇒ 起点 (0,0)/出口角
        //    之外挂 ≥3 条强制边的格点（起点/出口角挂 ≥2 条）永远覆盖不全。
        // 3) 强制边图成环：环上每个格点都挂两条未覆盖强制边，从环外进环即被剪枝 1
        //    判死、从起点沿环走则终点必是已占用格点 ⇒ 环永远无法整体覆盖。
        // 4) 必合并格对（同栋楼两格；全局唯一的一对红-专/理-实）之间不能画墙：公共边
        //    记入 mustMerge[]，搜索中沿它走一步即死；若该边本身还是强制边 ⇒ 无解。
        {
            const markCnt = [0, 0, 0, 0];       // 0红 1专 2理 3实
            const markPos = [-1, -1, -1, -1];
            for (let c = 0; c < this.nc; c++) {
                const m = this.cellMark[c];
                if (m >= 0 && m < 4) {
                    markCnt[m]++;
                    if (markCnt[m] === 1) {
                        markPos[m] = c;
                    }
                }
            }
            if (markCnt[0] !== markCnt[1] || markCnt[2] !== markCnt[3]) {
                return false;
            }
            const exitV = this.nv - 1;
            const deg = new Int32Array(nv);
            const uf = new Int32Array(nv).fill(-1);
            const ufFind = (a) => {
                while (uf[a] >= 0) {
                    a = uf[a];
                }
                return a;
            };
            for (let i = 0; i < this.reqEdge.length; i++) {
                for (const v of [this.reqVa[i], this.reqVb[i]]) {
                    const cap = (v === 0 || v === exitV) ? 1 : 2;
                    if (++deg[v] > cap) {
                        return false;
                    }
                }
                let ra = ufFind(this.reqVa[i]);
                let rb = ufFind(this.reqVb[i]);
                if (ra === rb) {
                    return false;   // 强制边图成环
                }
                if (uf[ra] > uf[rb]) {
                    [ra, rb] = [rb, ra];
                }
                uf[ra] += uf[rb];
                uf[rb] = ra;
            }
            const mustMerge = new Uint8Array(2 * nv);
            const mustMergePair = (a, b) => {
                // 只有"全局唯一的一对红-专 / 理-实"必须同区（成对规则）；
                // 楼标记相反——同楼相邻必须切开，已并入上面的 mustCut。
                for (let g = 0; g < 2; g++) {
                    if (markCnt[g * 2] === 1 && markCnt[g * 2 + 1] === 1 &&
                        ((a === markPos[g * 2] && b === markPos[g * 2 + 1]) ||
                         (a === markPos[g * 2 + 1] && b === markPos[g * 2]))) {
                        return true;
                    }
                }
                return false;
            };
            for (let x = 0; x < w; x++) {
                for (let y = 1; y < h; y++) {
                    if (mustMergePair(this.cellId(x, y - 1), this.cellId(x, y))) {
                        mustMerge[this.edgeId(x, y, 0)] = 1;
                    }
                }
            }
            for (let x = 1; x < w; x++) {
                for (let y = 0; y < h; y++) {
                    if (mustMergePair(this.cellId(x - 1, y), this.cellId(x, y))) {
                        mustMerge[this.edgeId(x, y, 1)] = 1;
                    }
                }
            }
            for (const e of this.reqEdge) {
                if (mustMerge[e]) {
                    return false;   // 强制边要求画开必合并格对
                }
            }
            this.mustMerge = mustMerge;
        }
        if (!this.glueInit()) {
            return false;
        }
        const reqAtV = Array.from({ length: nv }, () => []);
        for (let i = 0; i < this.reqEdge.length; i++) {
            reqAtV[this.reqVa[i]].push(i);
            reqAtV[this.reqVb[i]].push(i);
        }
        this.reqAtV = reqAtV;
        this.cov = new Uint8Array(this.reqEdge.length);
        this.uncovered = this.reqEdge.length;
        return true;
    }

    // ===== 焊死组：union by size、无路径压缩，按步深回滚 =====

    glueFind(a) {
        while (this.glPar[a] >= 0) {
            a = this.glPar[a];
        }
        return a;
    }

    glueUnion(a, b) {
        let ra = this.glueFind(a);
        let rb = this.glueFind(b);
        if (ra === rb) {
            return true;
        }
        if (this.glSize[ra] < this.glSize[rb]) {
            [ra, rb] = [rb, ra];
        }
        if (this.glBld[ra] & this.glBld[rb]) {
            return false;   // 同一栋楼标记两次
        }
        const colorA = this.glColor[ra];
        const colorB = this.glColor[rb];
        if (colorA >= 0 && colorB >= 0 && colorA !== colorB) {
            return false;   // 两种书院色
        }
        const marks = [0, 0, 0, 0];
        for (let i = 0; i < 4; i++) {
            marks[i] = this.glMark[ra * 4 + i] + this.glMark[rb * 4 + i];
            if (marks[i] > 1) {
                return false;   // 同标记两次
            }
        }
        this.glueLog.push({
            mvIdx: this.moves.length,
            child: rb,
            root: ra,
            oldSize: this.glSize[ra],
            oldColor: colorA,
            oldMarks: [
                this.glMark[ra * 4], this.glMark[ra * 4 + 1],
                this.glMark[ra * 4 + 2], this.glMark[ra * 4 + 3],
            ],
            oldBld: this.glBld[ra],
        });
        this.glPar[rb] = ra;
        this.glSize[ra] += this.glSize[rb];
        this.glColor[ra] = colorA >= 0 ? colorA : colorB;
        for (let i = 0; i < 4; i++) {
            this.glMark[ra * 4 + i] = marks[i];
        }
        this.glBld[ra] |= this.glBld[rb];
        return true;
    }

    // 格点 v 处所有"已死"的内部边（非墙、非阻断、非刚画的 skipE）两侧焊合
    glueFuseAt(v, skipE) {
        for (let d = 0; d < 4; d++) {
            if (this.nxtV[v * 4 + d] < 0) {
                continue;
            }
            const e = this.nxtE[v * 4 + d];
            if (e === skipE || this.wall[e] || this.blocked[e]) {
                continue;
            }
            const ca = this.edgeCa[e];
            const cb = this.edgeCb[e];
            if (ca >= 0 && cb >= 0 && !this.glueUnion(ca, cb)) {
                return false;
            }
        }
        return true;
    }

    glueInit() {
        for (let c = 0; c < this.nc; c++) {
            this.glColor[c] = this.cellColor[c];
            if (this.cellMark[c] >= 0) {
                this.glMark[c * 4 + this.cellMark[c]] = 1;
            }
            const building = this.cellBuilding[c];
            if (building >= 0 && building < BUILDING_MASKS.length) {
                this.glBld[c] = 1 << building;
            }
        }
        for (let e = 0; e < 2 * this.nv; e++) {
            if (!this.blocked[e]) {
                continue;
            }
            const ca = this.edgeCa[e];
            const cb = this.edgeCb[e];
            if (ca >= 0 && cb >= 0 && !this.glueUnion(ca, cb)) {
                return false;
            }
        }
        return true;
    }

    // ===== 封闭区域验证（validator.js 语义，按便宜 → 昂贵排序）=====

    regionSatisfied(comp, tag) {
        let color = -1;
        const pairCnt = [0, 0, 0, 0];
        const buildings = [];
        for (const c of comp) {
            const cellColor = this.cellColor[c];
            if (cellColor >= 0) {
                if (color === -1) {
                    color = cellColor;
                } else if (color !== cellColor) {
                    return false;
                }
            } else if (this.cellMark[c] >= 0) {
                pairCnt[this.cellMark[c]]++;
            } else if (this.cellBuilding[c] >= 0) {
                buildings.push(this.cellBuilding[c]);
            }
        }
        let buildingIdxs = null;
        if (buildings.length) {
            buildingIdxs = [...buildings].sort((a, b) => a - b);
            let need = 0;
            for (let i = 0; i < buildingIdxs.length; i++) {
                if (i > 0 && buildingIdxs[i] === buildingIdxs[i - 1]) {
                    return false;   // 同一栋楼出现两次
                }
                need += BUILDING_CELL_COUNTS[buildingIdxs[i]] ?? Infinity;
            }
            if (comp.length !== need) {
                return false;   // 格数对不上，形状必不可能对
            }
        }
        for (let g = 0; g < 2; g++) {
            const a = pairCnt[g * 2];
            const b = pairCnt[g * 2 + 1];
            if (a > 1 || b > 1 || (a > 0) !== (b > 0)) {
                return false;
            }
        }
        // 区域内未覆盖的强制边：两侧都在区域内 ⇒ 永远画不上
        for (let i = 0; i < this.reqEdge.length; i++) {
            if (this.cov[i]) {
                continue;
            }
            const ca = this.reqCa[i];
            const cb = this.reqCb[i];
            if (ca >= 0 && cb >= 0 && this.compMark[ca] === tag && this.compMark[cb] === tag) {
                return false;
            }
        }
        if (buildingIdxs) {
            const cells = comp.map(c => [(c / this.h) | 0, c % this.h]);
            return buildingIdxs.length === 1
                ? matchesBuilding(cells, buildingIdxs[0])
                : matchesCombo(cells, buildingIdxs);
        }
        return true;
    }

    // 对每个尚未密封的连通分量调用 visit(comp, tag)，返回 false 即终止
    eachUnsealed(visit) {
        this.passStamp++;
        for (let seed = 0; seed < this.nc; seed++) {
            if (this.seal[seed] !== 0 || this.cellVis[seed] === this.passStamp) {
                continue;
            }
            const tag = ++this.compSeq;
            this.floodFrom(seed, tag);
            if (!visit(this.compCells, tag)) {
                return false;
            }
        }
        return true;
    }

    floodFrom(seed, tag) {
        const { h, w, queue } = this;
        const comp = this.compCells;
        comp.length = 0;
        let read = 0;
        let write = 0;
        queue[write++] = seed;
        this.cellVis[seed] = this.passStamp;
        this.compMark[seed] = tag;
        comp.push(seed);
        while (read < write) {
            const c = queue[read++];
            const x = (c / h) | 0;
            const y = c % h;
            // 上/下邻居隔着横边，左/右邻居隔着竖边
            if (y > 0 && !this.wall[this.edgeId(x, y, 0)]) {
                this.floodPush(c - 1, tag, queue, write) && write++;
            }
            if (y + 1 < h && !this.wall[this.edgeId(x, y + 1, 0)]) {
                this.floodPush(c + 1, tag, queue, write) && write++;
            }
            if (x > 0 && !this.wall[this.edgeId(x, y, 1)]) {
                this.floodPush(c - h, tag, queue, write) && write++;
            }
            if (x + 1 < w && !this.wall[this.edgeId(x + 1, y, 1)]) {
                this.floodPush(c + h, tag, queue, write) && write++;
            }
        }
    }

    floodPush(c, tag, queue, write) {
        if (this.cellVis[c] === this.passStamp) {
            return false;
        }
        this.cellVis[c] = this.passStamp;
        this.compMark[c] = tag;
        this.compCells.push(c);
        queue[write] = c;
        return true;
    }

    // 分量是否已定型：不存在仍可能被画出的内部格边
    compIsFinal(tag) {
        const { h, w } = this;
        for (const c of this.compCells) {
            const x = (c / h) | 0;
            const y = c % h;
            if (y > 0 && this.compMark[c - 1] === tag && this.edgeDrawable(this.edgeId(x, y, 0))) {
                return false;
            }
            if (y + 1 < h && this.compMark[c + 1] === tag && this.edgeDrawable(this.edgeId(x, y + 1, 0))) {
                return false;
            }
            if (x > 0 && this.compMark[c - h] === tag && this.edgeDrawable(this.edgeId(x, y, 1))) {
                return false;
            }
            if (x + 1 < w && this.compMark[c + h] === tag && this.edgeDrawable(this.edgeId(x + 1, y, 1))) {
                return false;
            }
        }
        return true;
    }

    // 边此刻起是否还可能成为墙：一端在可达集∪端点、另一端未占用
    edgeDrawable(e) {
        if (this.blocked[e]) {
            return false;
        }
        const a = e >> 1;
        const b = (e & 1) ? a + 1 : a + this.W;
        const reachable = (u) => this.vertVis[u] === this.vertStamp || u === this.headId;
        return (reachable(a) && !this.occ[b]) || (reachable(b) && !this.occ[a]);
    }

    closureScan() {
        return this.eachUnsealed((comp, tag) => {
            if (!this.compIsFinal(tag)) {
                return true;
            }
            if (!this.regionSatisfied(comp, tag)) {
                return false;
            }
            ++this.sealedCnt;
            this.sealLog.push({ depth: this.moves.length, cells: [...comp] });
            for (const c of comp) {
                this.seal[c] = this.sealedCnt;
            }
            return true;
        });
    }

    // 从端点 BFS 可达的未占用格点；返回出口角是否可达。
    // floodSize 记下本次洪泛规模（含端点自身），供"级联门控"判断用。
    bfsReach(headV) {
        const { queue } = this;
        this.vertStamp++;
        this.headId = headV;
        let read = 0;
        let write = 0;
        queue[write++] = headV;
        this.vertVis[headV] = this.vertStamp;
        while (read < write) {
            const v = queue[read++];
            for (let d = 0; d < 4; d++) {
                const t = this.nxtV[v * 4 + d];
                if (t < 0 || this.blocked[this.nxtE[v * 4 + d]] || this.occ[t] ||
                    this.vertVis[t] === this.vertStamp) {
                    continue;
                }
                this.vertVis[t] = this.vertStamp;
                queue[write++] = t;
            }
        }
        this.floodSize = write;
        return this.vertVis[this.nv - 1] === this.vertStamp;
    }

    // 剪枝 2b（强制边全局必达）：是否存在"永远走不到"的未覆盖强制边——两端都不在
    // 可达集（vertVis 戳）内。可达集只收缩不扩张，此刻不可达 = 永远不可达 ⇒ 必死。
    reqStranded() {
        for (let i = 0; i < this.reqEdge.length; i++) {
            if (this.cov[i]) {
                continue;
            }
            if (this.vertVis[this.reqVa[i]] !== this.vertStamp &&
                this.vertVis[this.reqVb[i]] !== this.vertStamp) {
                return true;
            }
        }
        return false;
    }

    finish() {
        if (this.uncovered !== 0) {
            return false;
        }
        return this.eachUnsealed((comp, tag) => this.regionSatisfied(comp, tag));
    }

    applyMove(d, headV, nextV, e) {
        this.occ[nextV] = 1;
        this.wall[e] = 1;
        const r0 = this.reqByEdge[e];
        if (r0 >= 0 && !this.cov[r0]) {
            this.cov[r0] = 1;
            this.uncovered--;
        }
        this.moves.push(d);
        if (this.mustMerge[e]) {   // 墙把"必须同区"的两格切开 ⇒ 死（kill 须在入栈后）
            this.undoMove(nextV, e);
            return false;
        }
        for (const r of this.reqAtV[nextV]) {
            if (this.cov[r]) {
                continue;
            }
            const other = this.reqVa[r] === nextV ? this.reqVb[r] : this.reqVa[r];
            if (this.occ[other]) {
                this.undoMove(nextV, e);
                return false;
            }
        }
        if (!this.glueFuseAt(headV, e)) {
            this.undoMove(nextV, e);
            return false;
        }
        return true;
    }

    undoMove(nextV, e) {
        this.occ[nextV] = 0;
        this.wall[e] = 0;
        const r = this.reqByEdge[e];
        if (r >= 0 && this.cov[r]) {
            this.cov[r] = 0;
            this.uncovered++;
        }
        this.moves.pop();
        const depth = this.moves.length + 1;
        while (this.sealLog.length && this.sealLog[this.sealLog.length - 1].depth === depth) {
            for (const c of this.sealLog.pop().cells) {
                this.seal[c] = 0;
            }
        }
        while (this.glueLog.length && this.glueLog[this.glueLog.length - 1].mvIdx === depth) {
            const g = this.glueLog.pop();
            this.glPar[g.child] = -1;
            this.glSize[g.root] = g.oldSize;
            this.glColor[g.root] = g.oldColor;
            for (let i = 0; i < 4; i++) {
                this.glMark[g.root * 4 + i] = g.oldMarks[i];
            }
            this.glBld[g.root] = g.oldBld;
        }
    }

    nextRandom() {
        let r = this.randSeed >>> 0;
        r ^= r << 13;
        r >>>= 0;
        r ^= r >>> 17;
        r ^= r << 5;
        r >>>= 0;
        this.randSeed = r || 1;
        return r;
    }

    // stampSize：本状态（端点为 headV）的可达格点数，由父步的 bfsReach（或 run 的
    // 起点洪泛）算出并随递归传入，用于"级联门控"（见剪枝 2b 注释）。
    explore(headV, stampSize) {
        if (this.moves.length >= this.depthLimit) {
            this.depthCut = true;
            return false;
        }
        if (this.nodes >= this.nodeBudget ||
            ((this.nodes & DEADLINE_CHECK_MASK) === 0 && now() > this.deadline)) {
            throw new BudgetExceeded();
        }
        this.nodes++;
        const x = this.xOf[headV];
        const y = this.yOf[headV];

        // 剪枝 1：端点处的强制边
        let forced = -1;
        for (const r of this.reqAtV[headV]) {
            if (this.cov[r]) {
                continue;
            }
            const other = this.reqVa[r] === headV ? this.reqVb[r] : this.reqVa[r];
            if (this.occ[other]) {
                return false;
            }
            if (forced === -1) {
                forced = other;
            } else if (forced !== other) {
                return false;
            }
        }
        let dirs;
        if (forced >= 0) {
            const fx = this.xOf[forced];
            const fy = this.yOf[forced];
            dirs = [fx === x + 1 ? 0 : fx === x - 1 ? 2 : fy === y + 1 ? 1 : 3];
        } else if (this.randSeed) {
            dirs = [0, 1, 2, 3];
            for (let i = 3; i > 0; i--) {
                const j = this.nextRandom() % (i + 1);
                [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
            }
        } else {
            dirs = [0, 1, 2, 3];
        }

        for (const d of dirs) {
            const nextV = this.nxtV[headV * 4 + d];
            if (nextV < 0) {
                continue;
            }
            const e = this.nxtE[headV * 4 + d];
            if (this.blocked[e] || this.occ[nextV]) {
                continue;
            }
            if (!this.applyMove(d, headV, nextV, e)) {
                continue;
            }
            if (nextV === this.nv - 1) {
                // 出口角：格点不可重访，只能立刻出口
                const ok = this.finish();
                if (ok) {
                    this.solution = [...this.moves, 0];
                }
                this.undoMove(nextV, e);
                if (ok) {
                    return true;
                }
                continue;
            }
            // 迭代加深：超过深度限制的孩子不再展开（也省掉下面两次扫描）
            if (this.moves.length >= this.depthLimit) {
                this.depthCut = true;
                this.undoMove(nextV, e);
                continue;
            }
            // 剪枝 2：出口可达
            if (!this.bfsReach(nextV)) {
                this.undoMove(nextV, e);
                continue;
            }
            // 剪枝 2b（强制边全局必达，见 reqStranded）。级联门控：每步可达集只会因
            // "刚占用的那一个格点"而缩小——恰好少 1 = 无格点口袋合拢、任何未覆盖
            // 强制边端点的可达性都没变，免扫描；少 ≥2 才做一次 O(强制边数) 扫描。
            const childStamp = this.floodSize;
            if (childStamp <= stampSize - 2 && this.reqStranded()) {
                this.undoMove(nextV, e);
                continue;
            }
            // 剪枝 3：端点从内部到达边界时围出新区域
            let good = true;
            if (this.onFrame(this.xOf[nextV], this.yOf[nextV]) && !this.onFrame(x, y)) {
                good = this.closureScan();
            }
            let found = false;
            try {
                found = good && this.explore(nextV, childStamp);
            } finally {
                this.undoMove(nextV, e);
            }
            if (found) {
                return true;
            }
        }
        return false;
    }

    // 一次搜索：返回 'solved' | 'unsolvable' | 'budget'
    run({ maxNodes = Infinity, deadline = Infinity, seed = 0, depthLimit = Infinity } = {}) {
        this.nodeBudget = maxNodes;
        this.deadline = deadline;
        this.randSeed = seed >>> 0;
        this.depthLimit = depthLimit;
        this.depthCut = false;
        this.budgetHit = false;
        this.solution = null;
        this.moves.length = 0;
        this.nodes = 0;
        if (this.impossible) {
            return 'unsolvable';
        }
        this.occ.fill(0);
        this.occ[0] = 1;
        // 起点洪泛：既是子步级联门控的基准（stampSize），也让"起点处出口已不可达 /
        // 有强制边永远走不到"的题在第一步前就判无解（可达集单调收缩，起点不可达 =
        // 永远不可达，与深度限制无关）。
        if (!this.bfsReach(0) || this.reqStranded()) {
            return 'unsolvable';
        }
        let found = false;
        try {
            found = this.explore(0, this.floodSize);
        } catch (error) {
            if (!(error instanceof BudgetExceeded)) {
                throw error;
            }
            this.budgetHit = true;
        }
        // 无论正常结束还是中途抛出预算异常，undoMove 都已通过 finally 回滚到根状态
        if (found) {
            return 'solved';
        }
        return this.budgetHit ? 'budget' : 'unsolvable';
    }
}

function normalizeOptions({ maxNodes = Infinity, timeBudgetMs = Infinity, seed = 0 } = {}) {
    return {
        maxNodes,
        deadline: Number.isFinite(timeBudgetMs) ? now() + timeBudgetMs : Infinity,
        seed,
    };
}

// DFS 求任意一解。puzzle: { size, sign, palette?, blockedEdges? }（生成器产物 / deserializePuzzle 同构）
// options: { maxNodes, timeBudgetMs, seed, restartNodes, maxRestarts }
//   默认单次固定序搜索（与历史行为一致）；传 restartNodes > 0 且 maxRestarts > 0 时，
//   首次超预算则随机重启：每次尝试预算 restartNodes、种子递增，最多 maxRestarts 次。
//   实测（bench/data 四盘 × 20 种子扫描）：固定序搜不动的题在随机方向顺序下解通常
//   "浅而密"，小预算多次重试远优于把预算全压在一次尝试上。
export function solvePuzzle(puzzle, options = {}) {
    const solver = new PuzzleSolver(puzzle);
    const { restartNodes = 0, maxRestarts = 0 } = options;
    const norm = normalizeOptions(options);
    let status = solver.run(norm);
    let nodes = solver.nodes;
    let moves = solver.solution;
    let seedBase = (options.seed ?? 0) >>> 0 || 1;
    let attempt = 0;
    while (status === 'budget' && restartNodes > 0 && maxRestarts > 0 &&
           attempt < maxRestarts && now() < norm.deadline) {
        attempt++;
        status = solver.run({ maxNodes: restartNodes, deadline: norm.deadline, seed: seedBase + attempt });
        nodes += solver.nodes;
        moves = solver.solution;
    }
    return { status, moves, nodes };
}

// 迭代加深求最短解并评级。难度分 = lg(搜到最短解那一层之前的剪枝树节点数)，
// 与 issue #1 里 hardness.py 用 BFS 展开数取对数的口径一致：
// 深度限制 L 的 DFS 恰好枚举深度 < L 的全部剪枝树节点，与展开顺序无关。
export function ratePuzzle(puzzle, options = {}) {
    const solver = new PuzzleSolver(puzzle);
    const { maxNodes, deadline } = normalizeOptions(options);
    if (solver.impossible) {
        return { status: 'unsolvable', moves: null, nodes: 0, difficulty: null };
    }
    let spent = 0;
    let lastCompleted = 0;   // 上一轮（完整枚举到深度限制）的节点数
    for (let limit = solver.w + solver.h; limit <= solver.nv; limit++) {
        const status = solver.run({ maxNodes: maxNodes - spent, deadline, depthLimit: limit });
        spent += solver.nodes;
        if (status === 'solved') {
            return {
                status,
                moves: solver.solution,
                nodes: solver.nodes,
                difficulty: Math.log10(Math.max(1, solver.nodes)),
            };
        }
        if (status === 'budget') {
            // 每轮节点数随深度限制单调不减，故两者都是最终一轮节点数的下界
            const bound = Math.max(lastCompleted, solver.nodes);
            return { status, moves: null, nodes: spent, difficulty: Math.log10(Math.max(1, bound)) };
        }
        if (!solver.depthCut) {
            return { status: 'unsolvable', moves: null, nodes: solver.nodes, difficulty: null };
        }
        lastCompleted = solver.nodes;
    }
    return { status: 'unsolvable', moves: null, nodes: spent, difficulty: null };
}

export const DIFFICULTY_TIERS = [
    [2, '入门'],
    [3, '简单'],
    [4, '中等'],
    [5, '困难'],
    [Infinity, '极难'],
];

export function difficultyLabel(difficulty) {
    if (difficulty === null || difficulty === undefined || Number.isNaN(difficulty)) {
        return '未知';
    }
    return DIFFICULTY_TIERS.find(([upper]) => difficulty < upper)[1];
}

// 题目工坊用的完整流程：随机方向顺序重启求解（无固定序先导）→ 有解则用剩余时间
// 评级。尝试预算自 restartNodes 起**逐次翻倍**，每次换种子（随机方向顺序）。
// 依据（bench/data 语料实测，2026-09）：固定序"右下左上"在不少盘上本身就是差顺序
// （9×9 s2 固定序 67 万节点、随机序 ~1 万内即中），固定先导等于先烧一大笔预算；
// 随机序下解通常"浅而密"，小预算起步多次重试远优于大预算孤注一掷（200 次随机
// 重排模拟：固定 2M/次均值 0.96M/p90 2.32M；翻倍 0.01M 起 0.13M/p90 0.30M 量级）。
// 代价与取舍：无解题与顺序无关（每种顺序都要走完同一棵剪枝树），去掉先导后
// 中等规模无解树要多花 ~2× 节点、接近超时线才下"无解"结论——调用方应给足
// 时间预算（编辑器 6s→10s 即为此保险）；有解盘的体验全面改善。
// rate=false 时只做求解（可解性），不做难度评级——评级（ratePuzzle 的迭代加深
// 全树枚举）通常比求解贵两个数量级，适合拆成独立入口按需触发。
// 返回 { status, moves, nodes, difficulty, difficultyIsBound, shortest }
export function analyzePuzzle(puzzle, { timeBudgetMs = 3000, restartNodes = 10_000, rate = true } = {}) {
    const deadline = now() + timeBudgetMs;
    const solver = new PuzzleSolver(puzzle);
    let status = 'budget';
    let nodes = 0;
    let moves = null;
    let attempt = 0;
    let budget = restartNodes;
    while (status === 'budget' && now() < deadline) {
        attempt++;
        status = solver.run({ maxNodes: budget, deadline, seed: attempt });
        nodes += solver.nodes;
        moves = solver.solution;
        budget = Math.min(budget * 2, 2 ** 30);   // 封顶，防 << 溢出成负数导致空转
    }
    if (status !== 'solved') {
        return { status, moves: null, nodes, difficulty: null, difficultyIsBound: false, shortest: false };
    }
    if (!rate) {
        return { status, moves, nodes, difficulty: null, difficultyIsBound: false, shortest: false };
    }
    const rating = ratePuzzle(puzzle, { timeBudgetMs: Math.max(50, deadline - now()) });
    if (rating.status === 'solved') {
        return {
            status,
            moves: rating.moves,
            nodes: nodes + rating.nodes,
            difficulty: rating.difficulty,
            difficultyIsBound: false,
            shortest: true,
        };
    }
    return {
        status,
        moves,
        nodes: nodes + rating.nodes,
        difficulty: rating.difficulty,
        difficultyIsBound: true,
        shortest: false,
    };
}
