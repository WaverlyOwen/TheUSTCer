"use strict";

export const isMobileDevice = () =>
    /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

const BASE_SWIPE_THRESHOLD = 40;

// 移动端滑动画线：滑过阈值距离即走一格。
// getSensitivity ∈ [0.5, 1.5]：越高阈值越短越跟手。
// 第二根手指落下（捏合缩放手势）时立即放弃当前滑动跟踪，避免画线与缩放打架。
export function createSwipeDetector(actions, getSensitivity = () => 1) {
    let x = 0;
    let y = 0;

    const threshold = () =>
        BASE_SWIPE_THRESHOLD / Math.min(1.5, Math.max(0.5, getSensitivity()));

    const handleTouchStart = (event) => {
        if (event.touches.length > 1) {
            x = 0;
            y = 0;
            return;
        }
        const touch = event.touches[0];
        x = touch.clientX;
        y = touch.clientY;
    };

    const handleTouchMove = (event) => {
        if (event.touches.length > 1) {
            x = 0;
            y = 0;
            return;
        }
        event.preventDefault();
        if (!x || !y) {
            return;
        }
        const touch = event.touches[0];
        const diffX = touch.clientX - x;
        const diffY = touch.clientY - y;
        const limit = threshold();

        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > limit) {
            actions.move(diffX > 0 ? 0 : 2);
            x = touch.clientX;
            y = touch.clientY;
        } else if (Math.abs(diffY) > limit) {
            actions.move(diffY > 0 ? 1 : 3);
            x = touch.clientX;
            y = touch.clientY;
        }
    };

    const handleTouchEnd = () => {
        x = 0;
        y = 0;
    };

    return {
        addEventListener() {
            document.addEventListener('touchstart', handleTouchStart);
            document.addEventListener('touchmove', handleTouchMove, { passive: false });
            document.addEventListener('touchend', handleTouchEnd);
        },
        removeEventListener() {
            document.removeEventListener('touchstart', handleTouchStart);
            document.removeEventListener('touchmove', handleTouchMove, { passive: false });
            document.removeEventListener('touchend', handleTouchEnd);
        },
    };
}
