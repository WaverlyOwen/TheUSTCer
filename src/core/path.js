"use strict";

// 方向编码：0 右(+x) 1 下(+y) 2 左(-x) 3 上(-y)
const DIRECTIONS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
// headArcSafe 用的 8 邻域环（循环序）
const ARC_RING_X = [1, 1, 0, -1, -1, -1, 0, 1];
const ARC_RING_Y = [0, 1, 1, 1, 0, -1, -1, -1];

export function movePoint(position, direction, length) {
    return [
        position[0] + DIRECTIONS[direction][0] * length,
        position[1] + DIRECTIONS[direction][1] * length,
    ];
}

// 边的规范化 key：归一到左/上端点 + 轴向（0 横边 1 竖边），供禁边集合使用
export function edgeKey(x, y, direction, stride) {
    if (direction === 2) {
        return (x - 1) * stride * 2 + y * 2;
    }
    if (direction === 3) {
        return x * stride * 2 + (y - 1) * 2 + 1;
    }
    return x * stride * 2 + y * 2 + (direction === 1 ? 1 : 0);
}

// 网格上的一条自回避路径：从节点 (0,0) 出发，终点是边框缺口处的伪节点 (W+1, H)。
// 只含网格/步进/分组逻辑，不碰 DOM；渲染由 render/board.js 根据 queue 重建。
export class Path {
    constructor(size, blockedEdges = null) {
        this.size = size;
        const [w, h] = size;
        this.stride = h + 1;
        // 禁止穿越的边（字母区块内部边），edgeKey 编码
        this.blockedEdges = blockedEdges;
        // 节点占用表，扁平化下标 x * stride + y
        this.map = new Uint8Array((w + 1) * (h + 1));
        this.map[0] = 1;
        this.queue = [];
        this.x = 0;
        this.y = 0;
        this.distance = 0;
        this.group = [];
        this.groupMap = null;
        // reach() 的 BFS 缓冲区，跨调用复用；visited 用递增戳记免去清零
        this.bfsVisited = new Int32Array((w + 1) * (h + 1));
        this.bfsQueue = new Int32Array((w + 1) * (h + 1));
        this.bfsStamp = 0;
        // 禁边守护区：禁边端点的切比雪夫距离 ≤1 邻域内，弧检查失效（连通性不再只由节点占用决定）
        this.guardNodes = null;
        if (blockedEdges) {
            this.guardNodes = new Uint8Array((w + 1) * (h + 1));
            for (const key of blockedEdges) {
                const nodeA = key >> 1;
                const nodeB = (key & 1) === 0 ? nodeA + this.stride : nodeA + 1;
                for (const node of [nodeA, nodeB]) {
                    const nx = (node / this.stride) | 0;
                    const ny = node % this.stride;
                    for (let dx = -1; dx <= 1; dx++) {
                        for (let dy = -1; dy <= 1; dy++) {
                            const gx = nx + dx;
                            const gy = ny + dy;
                            if (gx >= 0 && gx <= w && gy >= 0 && gy <= h) {
                                this.guardNodes[this.index(gx, gy)] = 1;
                            }
                        }
                    }
                }
            }
        }
    }

    index(x, y) {
        return x * this.stride + y;
    }

    get finished() {
        return this.x === this.size[0] + 1 && this.y === this.size[1];
    }

    edgeBlocked(x, y, direction) {
        return this.blockedEdges !== null &&
            this.blockedEdges.has(edgeKey(x, y, direction, this.stride));
    }

    // 只读版 step 判定，供鼠标吸引预判方向是否可走
    canStep(direction) {
        const [w, h] = this.size;
        const [newX, newY] = movePoint([this.x, this.y], direction, 1);
        if (newX === w + 1 && newY === h) {
            return true;
        }
        if (newX < 0 || newX > w || newY < 0 || newY > h ||
            this.map[this.index(newX, newY)]) {
            return false;
        }
        return !this.edgeBlocked(this.x, this.y, direction);
    }

    step(direction) {
        const [w, h] = this.size;
        const [newX, newY] = movePoint([this.x, this.y], direction, 1);
        if (newX === w + 1 && newY === h) {
            this.queue.push(direction);
            this.x = newX;
            this.y = newY;
            this.distance++;
            this.createGroup();
            return true;
        }
        if (newX >= 0 && newX <= w && newY >= 0 && newY <= h &&
            !this.map[this.index(newX, newY)] &&
            !this.edgeBlocked(this.x, this.y, direction)) {

            this.map[this.index(newX, newY)] = 1;
            this.queue.push(direction);
            this.x = newX;
            this.y = newY;
            this.distance++;
            return true;
        }
        return false;
    }

    // 生成期临时占位/释放节点（保护未遍历的字母轮廓链）
    reserveNodes(nodes) {
        for (const [x, y] of nodes) {
            this.map[this.index(x, y)] = 1;
        }
    }

    releaseNodes(nodes) {
        for (const [x, y] of nodes) {
            this.map[this.index(x, y)] = 0;
        }
    }

    back() {
        if (!this.distance) {
            return;
        }
        const direction = this.queue.pop();
        this.distance--;
        if (this.x <= this.size[0]) {
            this.map[this.index(this.x, this.y)] = 0;
        }
        [this.x, this.y] = movePoint([this.x, this.y], (direction + 2) % 4, 1);
    }

    clear() {
        while (this.distance) {
            this.back();
        }
    }

    // 头部落点的局部安全判定：看 8 邻域环上的"空闲弧"是否连续。
    // 空闲环连续（≤1 段）⇒ 占用当前头部不会把自由区切成两半，可跳过全盘 BFS；
    // 环上相邻两格互为正交邻居，故连续空闲弧内的节点两两连通，头部不是割点。
    // 返回 false 只表示"可能分裂"，需要调用方回退到 reach() 复核（保守正确）。
    headArcSafe() {
        if (this.guardNodes && this.guardNodes[this.index(this.x, this.y)]) {
            return false;
        }
        const [w, h] = this.size;
        const x = this.x;
        const y = this.y;
        // 8 邻域环，循环序
        let freeCount = 0;
        let arcs = 0;
        let prevFree = false;
        let firstFree = false;
        for (let i = 0; i < 8; i++) {
            const nx = x + ARC_RING_X[i];
            const ny = y + ARC_RING_Y[i];
            const free = nx >= 0 && nx <= w && ny >= 0 && ny <= h &&
                !this.map[nx * this.stride + ny];
            if (free) {
                freeCount++;
                if (!prevFree) {
                    arcs++;
                }
            }
            if (i === 0) {
                firstFree = free;
            }
            prevFree = free;
        }
        // 环首尾相接：首尾都空闲时少算了一次合并
        if (firstFree && prevFree && arcs > 1) {
            arcs--;
        }
        // 无空闲邻居 = 死胡同（目标必不可达），交给 BFS 判死
        return freeCount > 0 && arcs <= 1;
    }

    // 当前头部是否仍能到达目标节点（默认终点 (W, H)），不被已画路径/禁边切断
    reach(targetX = this.size[0], targetY = this.size[1]) {
        const [w, h] = this.size;
        if (this.x === targetX && this.y === targetY) {
            return true;
        }
        const stamp = ++this.bfsStamp;
        const visited = this.bfsVisited;
        const queue = this.bfsQueue;
        const target = this.index(targetX, targetY);
        let read = 0;
        let write = 0;
        queue[write++] = this.index(this.x, this.y);

        while (read < write) {
            const node = queue[read++];
            const x = (node / this.stride) | 0;
            const y = node % this.stride;
            for (let i = 0; i < 4; i++) {
                const newX = x + DIRECTIONS[i][0];
                const newY = y + DIRECTIONS[i][1];
                if (newX < 0 || newX > w || newY < 0 || newY > h) {
                    continue;
                }
                if (this.edgeBlocked(x, y, i)) {
                    continue;
                }
                const next = this.index(newX, newY);
                // 目标先于占用判断：目标可能被生成器临时占位（链端点）
                if (next === target) {
                    return true;
                }
                if (this.map[next] || visited[next] === stamp) {
                    continue;
                }
                visited[next] = stamp;
                queue[write++] = next;
            }
        }
        return false;
    }

    // 路径经过的每条边，记为相邻两格之间的"墙"：barrier[x][y] = [横边, 竖边]
    createBarrier() {
        const [w, h] = this.size;
        const barrier = Array.from({ length: w + 1 }, () =>
            Array.from({ length: h + 1 }, () => [false, false]));
        let position = [0, 0];

        for (let i = 0; i < this.distance; i++) {
            const now = this.queue[i];
            if (now < 2) {
                barrier[position[0]][position[1]][now] = true;
                position = movePoint(position, now, 1);
            } else {
                position = movePoint(position, now, 1);
                barrier[position[0]][position[1]][now % 2] = true;
            }
        }
        return barrier;
    }

    searchGroup(position, groupNumber, barrier) {
        this.groupMap[position[0]][position[1]] = groupNumber;
        const queue = [position.slice()];
        let member = 1;

        for (let read = 0; read < queue.length; read++) {
            position = queue[read];
            for (let i = 0; i < 4; i++) {
                const [newX, newY] = movePoint(position, i, 1);
                if (newX >= 0 && newX < this.size[0] &&
                    newY >= 0 && newY < this.size[1] &&
                    this.groupMap[newX][newY] === -1 &&
                    !barrier[i < 2 ? newX : position[0]][i < 2 ? newY : position[1]][(i + 1) % 2]) {
                    queue.push([newX, newY]);
                    this.groupMap[newX][newY] = groupNumber;
                    member++;
                }
            }
        }
        return member;
    }

    // 以完成的路径为界，把棋盘格子划分为若干连通区域
    createGroup() {
        const barrier = this.createBarrier();
        this.group = [];
        this.groupMap = Array.from({ length: this.size[0] }, () => Array(this.size[1]).fill(-1));

        for (let i = 0; i < this.size[0]; ++i) {
            for (let j = 0; j < this.size[1]; ++j) {
                if (this.groupMap[i][j] === -1) {
                    this.group.push(this.searchGroup([i, j], this.group.length, barrier));
                }
            }
        }
    }
}
