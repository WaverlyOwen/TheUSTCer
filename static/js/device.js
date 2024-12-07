"use strict";

import * as Common from './common.js';

export const isMobileDevice = () => {
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
};

const createSwipeDetector = (threshold = 30) => {
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
                    Common.simulateKey("d");
                } else {
                    Common.simulateKey("a");
                }
                startX = touch.clientX;
                startY = touch.clientY;
            } else if (Math.abs(diffY) > threshold) {
                if (diffY > 0) {
                    Common.simulateKey("s");
                } else {
                    Common.simulateKey("w");
                }
                startX = touch.clientX;
                startY = touch.clientY;
            }
        },
        handleTouchEnd(event) {
            startX = 0;
            startY = 0;
        }
    };
};


export function desktop() {
    
}

export function mobile() {
    const buttons = document.createElement("div");
    buttons.setAttribute("id", "mobile");

    for (const info of [
        ["simulateR", "清空路径", "R"], 
        ["simulateEnter", "提交答案", "Enter"], 
        ["simulateControl", "显示答案", "Control"], 
        ["simulateShift", "隐藏答案", "Shift"], 
        ["simulateTab", "更换地图", "Tab"]
    ]) {
        const button = document.createElement("button");
        button.setAttribute('id', info[0]);
        button.textContent = info[1];
        button.addEventListener('touchstart', () => {
            Common.simulateKey(info[2]);
        });
        buttons.appendChild(button);
    }

    document.body.appendChild(buttons);

    const swipeDetector = createSwipeDetector(30);
    document.addEventListener("touchstart", swipeDetector.handleTouchStart);
    document.addEventListener("touchmove", swipeDetector.handleTouchMove, { passive: false});
    document.addEventListener("touchend", swipeDetector.handleTouchEnd);
}