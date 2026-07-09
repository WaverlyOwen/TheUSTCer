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
        // 按滚动量缩放：触控板连发的小 delta 平滑累积；
        // 滚轮一格（±100px 当量）≈ 旧的固定 ×1.12 手感
        const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1);
        const factor = Math.exp(-Math.max(-400, Math.min(400, pixels)) * 0.0011);
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
        // 只认鼠标主键：右键/中键不进 pointers 表，免得 contextmenu 吞掉
        // pointerup 留下幽灵指针，把后续单键拖动误判成捏合
        if (event.pointerType === 'mouse' && event.button !== 0) {
            return;
        }
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
        if (pointers.size === 2) {
            // 3 指 → 2 指：以剩余两指重设基线，否则下一次 move 会拿旧基线
            // 对比新指距/中点，缩放平移猛跳
            pinchDistance = distance();
            pinchMid = midpoint();
        } else if (pointers.size < 2) {
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
