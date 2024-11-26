export const createSwipeDetector = (threshold = 10) => {
    let startX = 0;
    let startY = 0;

    return {
        handleTouchStart(event) {
            event.preventDefault();
            const touch = event.touches[0];
            startX = touch.clientX;
            startY = touch.clientY;
        },
        handleTouchMove(event) {
            event.preventDefault();
            if (!startX || !startY) {
                return;
            }

            const touch = event.touches[0];
            const diffX = touch.clientX - startX;
            const diffY = touch.clientY - startY;

            if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > threshold) {
                if (diffX > 0) {
                    simulateKeydown("d");
                } else {
                    simulateKeydown("a");
                }
            } else if (Math.abs(diffY) > threshold) {
                if (diffY > 0) {
                    simulateKeydown("s");
                } else {
                    simulateKeydown("w");
                }
            }

            startX = 0;
            startY = 0;
        },
    };

    function simulateKeydown(key) {
        const event = new KeyboardEvent("keydown", {
            key: key,
            bubbles: true,
            cancelable: true,
        });
        document.dispatchEvent(event);
    }
};

export function simulateKey(key, code, options = {}) {
    const event = new KeyboardEvent('keydown', {
      key: key,            // 键值
      code: code,          // 键码
      bubbles: true,       // 允许事件冒泡
      cancelable: true,    // 允许取消事件
      ...options           // 可传入额外的配置，如是否按下 Shift、Ctrl 等
    });
    // 触发事件
    document.dispatchEvent(event);
}