"use strict";

import { movePoint } from '../core/path.js';

// 根据移动序列重建 SVG path 的 d：直行用 L，转弯用 1/4 圆弧，
// 每段停在节点前 15px，给下一段的圆弧留出空间
export function buildPathD(queue) {
    const d = ['M 5 5'];
    let x = 0;
    let y = 0;

    for (let i = 0; i < queue.length; i++) {
        const now = queue[i];
        const last = queue[i - 1];
        const [newX, newY] = movePoint([x, y], now, 1);
        const [cornerX, cornerY] = movePoint([5 + newX * 50, 5 + newY * 50], (now + 2) % 4, 35);

        if (i === 0 || last === now) {
            d.push(`L ${cornerX} ${cornerY}`);
        } else {
            d.push(`A 15 15 0 0 ${Number((last + 1) % 4 === now)} ${cornerX} ${cornerY}`);
        }
        const [endX, endY] = movePoint([cornerX, cornerY], now, 20);
        d.push(`L ${endX} ${endY}`);
        x = newX;
        y = newY;
    }
    return d.join(' ');
}

// 每步在 d 上的弧长（与 buildPathD 的几何一一对应）：
// 第一步 15+20=35；直行步 30+20=50；转弯步 1/4 圆弧(15π/2)+20
const FIRST_STEP = 35;
const STRAIGHT_STEP = 50;
const TURN_STEP = 15 * Math.PI / 2 + 20;
const EASE_TAU = 0.05;

function stepLength(queue, i) {
    if (i === 0) {
        return FIRST_STEP;
    }
    return queue[i] === queue[i - 1] ? STRAIGHT_STEP : TURN_STEP;
}

// 路径生长/收缩动画器：d 始终是完整几何（绘画引擎不变），
// 用 stroke-dasharray 只显示前 currentLen 像素，rAF 向 targetLen 指数缓动。
// partial（鼠标吸引）：
//   { type: 'extend', dir, f }  线头沿 dir 方向伸出 f∈(0,1) 步长的幻影段
//   { type: 'retract', f }      最后一段收缩 f∈(0,1)，逻辑步未撤销、仅视觉回缩
export class PathAnimator {
    constructor(line) {
        this.line = line;
        this.renderQueue = [];
        this.prefix = [0];
        this.logicalSteps = 0;
        this.currentLen = 0;
        this.targetLen = 0;
        this.frame = null;
        this.lastTime = 0;

        this.tick = (now) => {
            const dt = Math.min(0.1, (now - this.lastTime) / 1000);
            this.lastTime = now;
            const diff = this.targetLen - this.currentLen;
            if (Math.abs(diff) < 0.5) {
                this.currentLen = this.targetLen;
                this.applyDash();
                this.maybeTruncate();
                this.frame = null;
                return;
            }
            this.currentLen += diff * (1 - Math.exp(-dt / EASE_TAU));
            this.applyDash();
            this.frame = requestAnimationFrame(this.tick);
        };
    }

    rebuild() {
        this.prefix = [0];
        for (let i = 0; i < this.renderQueue.length; i++) {
            this.prefix.push(this.prefix[i] + stepLength(this.renderQueue, i));
        }
        this.line.setAttribute('d', buildPathD(this.renderQueue));
    }

    applyDash() {
        this.line.setAttribute('stroke-dasharray', `${this.currentLen} 100000`);
    }

    // 收敛后把撤销残留的视觉尾巴截掉，让 d 回到与逻辑队列一致
    maybeTruncate() {
        if (this.renderQueue.length > this.logicalSteps &&
            this.targetLen <= this.prefix[this.logicalSteps] + 0.01) {
            this.renderQueue = this.renderQueue.slice(0, this.logicalSteps);
            this.rebuild();
        }
    }

    setState(queue, partial = null) {
        let common = 0;
        while (common < queue.length && common < this.renderQueue.length &&
               queue[common] === this.renderQueue[common]) {
            common++;
        }

        if (common < queue.length) {
            // 逻辑队列在 common 之后与视觉几何分叉（含普通前进）：换几何
            if (common < this.renderQueue.length) {
                this.currentLen = Math.min(this.currentLen, this.prefix[common]);
            }
            this.renderQueue = queue.slice();
            this.rebuild();
        }
        this.logicalSteps = queue.length;

        let target = this.prefix[Math.min(queue.length, this.prefix.length - 1)];
        if (partial?.type === 'extend') {
            // 幻影步：视觉队列多挂一步，dasharray 裁出半截
            if (this.renderQueue.length === queue.length) {
                this.renderQueue = queue.concat(partial.dir);
                this.rebuild();
            } else if (this.renderQueue[queue.length] !== partial.dir) {
                this.currentLen = Math.min(this.currentLen, this.prefix[queue.length]);
                this.renderQueue = queue.concat(partial.dir);
                this.rebuild();
            }
            target = this.prefix[queue.length] +
                partial.f * stepLength(this.renderQueue, queue.length);
        } else if (partial?.type === 'retract' && queue.length > 0) {
            target = this.prefix[queue.length - 1] +
                (1 - partial.f) * stepLength(this.renderQueue, queue.length - 1);
        }
        this.targetLen = target;
        this.start();
    }

    start() {
        if (this.frame === null) {
            this.lastTime = performance.now();
            this.frame = requestAnimationFrame(this.tick);
        }
    }

    // 立即到位（胜利定格、销毁前用）
    snap() {
        if (this.frame !== null) {
            cancelAnimationFrame(this.frame);
            this.frame = null;
        }
        this.currentLen = this.targetLen;
        this.applyDash();
        this.maybeTruncate();
    }

    reset() {
        if (this.frame !== null) {
            cancelAnimationFrame(this.frame);
            this.frame = null;
        }
        this.renderQueue = [];
        this.logicalSteps = 0;
        this.currentLen = 0;
        this.targetLen = 0;
        this.prefix = [0];
        this.line.setAttribute('d', '');
        this.line.removeAttribute('stroke-dasharray');
    }

    destroy() {
        if (this.frame !== null) {
            cancelAnimationFrame(this.frame);
            this.frame = null;
        }
    }
}
