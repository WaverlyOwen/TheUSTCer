"use strict";

export const isMobileDevice = () =>
    /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// 移动端：滑动画线 + 底部操作按钮
export function createSwipeDetector(actions, threshold = 40) {
    let x = 0;
    let y = 0;

    const handleTouchStart = (event) => {
        const touch = event.touches[0];
        x = touch.clientX;
        y = touch.clientY;
    };

    const handleTouchMove = (event) => {
        event.preventDefault();
        if (!x || !y) {
            return;
        }
        const touch = event.touches[0];
        const diffX = touch.clientX - x;
        const diffY = touch.clientY - y;

        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > threshold) {
            actions.move(diffX > 0 ? 0 : 2);
            x = touch.clientX;
            y = touch.clientY;
        } else if (Math.abs(diffY) > threshold) {
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

export function createMobileControls(actions) {
    const buttons = document.createElement('div');
    buttons.setAttribute('id', 'mobile');

    for (const [label, action] of [
        ['清空路径', actions.clear],
        ['提交答案', actions.submit],
        ['显示答案', actions.showAnswer],
        ['隐藏答案', actions.hideAnswer],
        ['更换地图', actions.changeMap],
    ]) {
        const button = document.createElement('button');
        button.textContent = label;
        button.addEventListener('touchstart', (event) => {
            event.preventDefault();
            action();
        });
        buttons.appendChild(button);
    }
    document.body.appendChild(buttons);

    const swipeDetector = createSwipeDetector(actions);
    swipeDetector.addEventListener();
    return swipeDetector;
}
