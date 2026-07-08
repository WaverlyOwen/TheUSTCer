"use strict";

// 题板缩放/平移手势：
// - 双指捏合 = 缩放 + 中点平移（手机 / iPad / 触控板双指按压）
// - 滚轮 = 以指针为中心缩放（桌面；触控板双指滑动亦触发 wheel）
// - 单指/左键拖动 = 平移，但仅在已缩放 (scale>1) 且不是画线时——
//   画线的 pointerdown（线头附近）会 stopPropagation，不会冒泡到这里
export function attachGestures(viewportController) {
    const viewport = viewportController.element;
    const pointers = new Map();
    let pinchDistance = 0;
    let pinchMid = null;
    let panLast = null;

    function onWheel(event) {
        event.preventDefault();
        const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
        viewportController.zoomAt(event.clientX, event.clientY, factor);
    }

    function midpoint() {
        const [a, b] = [...pointers.values()];
        return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }

    function distance() {
        const [a, b] = [...pointers.values()];
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function onPointerDown(event) {
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.size === 2) {
            pinchDistance = distance();
            pinchMid = midpoint();
            panLast = null;
        } else if (pointers.size === 1 && viewportController.scale > 1.001 &&
            event.pointerType !== 'touch') {
            // 桌面：空白处按下拖动平移（触摸端单指留给画线，平移用双指）
            panLast = { x: event.clientX, y: event.clientY };
        }
    }

    function onPointerMove(event) {
        if (!pointers.has(event.pointerId)) {
            return;
        }
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

        if (pointers.size === 2) {
            const nextDistance = distance();
            const nextMid = midpoint();
            if (pinchDistance > 0) {
                viewportController.zoomAt(nextMid.x, nextMid.y, nextDistance / pinchDistance);
                viewportController.panBy(nextMid.x - pinchMid.x, nextMid.y - pinchMid.y);
            }
            pinchDistance = nextDistance;
            pinchMid = nextMid;
            event.preventDefault();
        } else if (pointers.size === 1 && panLast) {
            viewportController.panBy(event.clientX - panLast.x, event.clientY - panLast.y);
            panLast = { x: event.clientX, y: event.clientY };
        }
    }

    function onPointerEnd(event) {
        pointers.delete(event.pointerId);
        if (pointers.size < 2) {
            pinchDistance = 0;
            pinchMid = null;
        }
        if (!pointers.size) {
            panLast = null;
        }
    }

    viewport.addEventListener('wheel', onWheel, { passive: false });
    viewport.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);

    return () => {
        viewport.removeEventListener('wheel', onWheel);
        viewport.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerEnd);
        window.removeEventListener('pointercancel', onPointerEnd);
    };
}
