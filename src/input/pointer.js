"use strict";

// 鼠标画线：从路径头部（初始为起点圆点）按住拖动。
// 线头被指针"吸引"——指针在两节点之间时以 partial 形式喂给动画器画出半截线，
// 越过 COMMIT 阈值才真正 step/back 提交，往返有迟滞不会抖动。
// 复用 Path 状态机，规则与键盘输入完全一致。
const COMMIT = 0.75;
const DEADZONE = 0.05;

export function attachPointer(svg, userPath, callbacks) {
    let drawing = false;

    function toNodeCoords(event) {
        const ctm = svg.getScreenCTM();
        if (!ctm) {
            return null;
        }
        const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
        // 节点 (i, j) 位于 SVG 坐标 (5 + 50i, 5 + 50j)
        return [(point.x - 5) / 50, (point.y - 5) / 50];
    }

    function nearHead(coords) {
        return Math.hypot(coords[0] - userPath.x, coords[1] - userPath.y) < 0.45;
    }

    function isReverse(direction) {
        return userPath.distance > 0 &&
            (direction + 2) % 4 === userPath.queue[userPath.distance - 1];
    }

    // 提交所有越过阈值的整步，剩余的分量转成 partial 显示
    function dragTo(coords) {
        let partial = null;

        for (let guard = 0; guard < 8; guard++) {
            const dx = coords[0] - userPath.x;
            const dy = coords[1] - userPath.y;
            const horizontal = Math.abs(dx) >= Math.abs(dy);
            const dir = horizontal ? (dx > 0 ? 0 : 2) : (dy > 0 ? 1 : 3);
            const magnitude = horizontal ? Math.abs(dx) : Math.abs(dy);

            if (magnitude >= COMMIT) {
                if (isReverse(dir)) {
                    userPath.back();
                    continue;
                }
                if (userPath.step(dir)) {
                    continue;
                }
                // 主导方向被挡，试另一轴（沿墙滑动）
                const sideDir = horizontal ? (dy > 0 ? 1 : 3) : (dx > 0 ? 0 : 2);
                const sideMagnitude = horizontal ? Math.abs(dy) : Math.abs(dx);
                if (sideMagnitude >= COMMIT) {
                    if (isReverse(sideDir)) {
                        userPath.back();
                        continue;
                    }
                    if (userPath.step(sideDir)) {
                        continue;
                    }
                }
                break;
            }

            // 阈值以内：只做视觉吸引
            if (magnitude > DEADZONE) {
                if (isReverse(dir)) {
                    partial = { type: 'retract', f: magnitude };
                } else if (userPath.canStep(dir)) {
                    partial = { type: 'extend', dir, f: Math.min(magnitude, 0.999) };
                }
            }
            break;
        }

        callbacks.onUpdate(partial);
    }

    function onDown(event) {
        if (event.button !== 0) {
            return;
        }
        const coords = toNodeCoords(event);
        if (!coords || !nearHead(coords)) {
            return;
        }
        event.preventDefault();
        if (userPath.finished) {
            callbacks.onSubmit();
            return;
        }
        drawing = true;
        svg.setPointerCapture?.(event.pointerId);
    }

    function onMove(event) {
        if (!drawing) {
            return;
        }
        const coords = toNodeCoords(event);
        if (coords) {
            dragTo(coords);
        }
    }

    function onUp() {
        if (drawing) {
            drawing = false;
            // 松手：幻影段缩回最近的已提交节点
            callbacks.onUpdate(null);
        }
    }

    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onUp);

    return () => {
        svg.removeEventListener('pointerdown', onDown);
        svg.removeEventListener('pointermove', onMove);
        svg.removeEventListener('pointerup', onUp);
        svg.removeEventListener('pointercancel', onUp);
    };
}
