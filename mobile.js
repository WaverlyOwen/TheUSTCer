export const createSwipeDetector = (threshold = 30) => {
    let startX = 0;
    let startY = 0;

    return {
        handleTouchStart(event) {
            const touch = event.touches[0];
            startX = touch.clientX;
            startY = touch.clientY;
        },
        handleTouchMove(event) {
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