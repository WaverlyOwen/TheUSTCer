"use strict";

export const isMobileDevice = () =>
    /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

const BASE_SWIPE_THRESHOLD = 40;

// 移动端滑动画线：滑过阈值距离即走一格。
// getSensitivity ∈ [0.5, 1.5]：越高阈值越短越跟手。
// 第二根手指落下（捏合缩放手势）时立即放弃当前滑动跟踪，避免画线与缩放打架。
export function createSwipeDetector(actions, getSensitivity = () => 1) {
    // 是否在跟踪一次滑动要用独立标志，不能拿坐标当哨兵：
    // 屏幕最左/最上边缘的合法触点 clientX/Y 恰好是 0，会被误判成"未跟踪"
    let tracking = false;
    let x = 0;
    let y = 0;

    const threshold = () =>
        BASE_SWIPE_THRESHOLD / Math.min(1.5, Math.max(0.5, getSensitivity()));

    const handleTouchStart = (event) => {
        if (event.touches.length > 1) {
            tracking = false;
            return;
        }
        // 从按钮/表单控件上起手的触摸不算画线起点：
        // 否则按住顶栏图标一拖就会往棋盘上灌移动指令
        if (event.target.closest?.('button, input, select, textarea, a')) {
            tracking = false;
            return;
        }
        const touch = event.touches[0];
        tracking = true;
        x = touch.clientX;
        y = touch.clientY;
    };

    const handleTouchMove = (event) => {
        if (event.touches.length > 1) {
            tracking = false;
            return;
        }
        if (!tracking) {
            // 没在跟踪的触摸（从按钮起手等）不吞默认行为，让控件正常滚动/响应
            return;
        }
        event.preventDefault();
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
        tracking = false;
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
