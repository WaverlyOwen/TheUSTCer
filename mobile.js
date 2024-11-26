export const createSwipeDetector = (threshold = 5) => {
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
      key: key,
      code: code,
      bubbles: true,
      cancelable: true,
      ...options
    });
    document.dispatchEvent(event);
}

export const isMobileDevice = () => {
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
};