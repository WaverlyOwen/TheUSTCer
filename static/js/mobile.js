"use strict";

import * as Common from './common.js';

const createSwipeDetector = (threshold = 5) => {
    let startX = 0;
    let startY = 0;

    return {
        handleTouchStart(event) {
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

function simulateKey(key, code, options = {}) {
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

export function mobile() {
    if (!isMobileDevice()) {
        Common.remove('#mobileRule');
        Common.remove('#mobile');
        return;
    }

    Common.remove("#rule");
    
    const swipeDetector = createSwipeDetector(5);
    document.addEventListener("touchstart", swipeDetector.handleTouchStart, false);
    document.addEventListener("touchmove", swipeDetector.handleTouchMove, { passive: false});

    document.getElementById('simulateR').addEventListener('touchstart', () => {
        simulateKey('R', 'R');
    });

    document.getElementById('simulateTab').addEventListener('touchstart', () => {
        simulateKey('Tab', 'Tab');
    });
        
    document.getElementById('simulateEnter').addEventListener('touchstart', () => {
        simulateKey('Enter', 'Enter');
    });
   
    document.getElementById('simulateShift').addEventListener('touchstart', () => {
        simulateKey('Shift', 'ShiftLeft', { shiftKey: true });
    });
    
    document.getElementById('simulateControl').addEventListener('touchstart', () => {
        simulateKey('Control', 'ControlLeft', { ctrlKey: true });
    });
    
}