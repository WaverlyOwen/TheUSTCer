"use strict";

import * as Common from './common.js';
import * as Menu from './menu.js';

export const isMobileDevice = () => {
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
};

const createSwipeDetector = (threshold = 30) => {
    let x = 0;
    let y = 0;

    return {
        handleTouchStart: (event) => {
            const touch = event.touches[0];
            x = touch.clientX;
            y = touch.clientY;
        },
        handleTouchMove: (event) => {
            event.preventDefault();
            if (!x || !y) return;

            const touch = event.touches[0];
            const diffX = touch.clientX - x;
            const diffY = touch.clientY - y;

            if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > threshold) {
                if (diffX > 0) {
                    Common.simulateKey("d");
                } else {
                    Common.simulateKey("a");
                }
                x = touch.clientX;
                y = touch.clientY;
            } else if (Math.abs(diffY) > threshold) {
                if (diffY > 0) {
                    Common.simulateKey("s");
                } else {
                    Common.simulateKey("w");
                }
                x = touch.clientX;
                y = touch.clientY;
            }
        },
        handleTouchEnd: () => {
            x = 0;
            y = 0;
        },
        addEventListener() {
            document.addEventListener("touchstart", this.handleTouchStart);
            document.addEventListener("touchmove", this.handleTouchMove, { passive: false });
            document.addEventListener("touchend", this.handleTouchEnd);
        },
        removeEventListener() {
            document.removeEventListener("touchstart", this.handleTouchStart);
            document.removeEventListener("touchmove", this.handleTouchMove, { passive: false });
            document.removeEventListener("touchend", this.handleTouchEnd);
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
    swipeDetector.addEventListener();

    return swipeDetector;
}

export function menu(dot, swipeDetector) {
    if (dot.show === undefined) {
        dot.show = 0;
    }

    function handleDot() {
        if (dot.show) {
            if(swipeDetector){
                swipeDetector.addEventListener();
            }

            const overlay = document.getElementById('dark-overlay');
            
            let slider = document.querySelector('.slider');
            slider.classList.remove('fade-in');
            slider.classList.add('fade-out');

            if (overlay) {
                overlay.classList.remove('active');
                
                setTimeout(() => {
                    if (!overlay.classList.contains('active')) {
                        overlay.remove();
                        Common.remove('.slider');
                    }
                }, 500);
            }

        } else {
            if(swipeDetector){
                swipeDetector.removeEventListener();
            }

            let overlay = document.getElementById('dark-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'dark-overlay';
                document.body.appendChild(overlay);
            }

            requestAnimationFrame(() => {
                overlay.classList.add('active');
            });

            Menu.createMenu();
        }
        dot.show = !dot.show;
    }

    dot.addEventListener(isMobileDevice() ? 'touchstart' : 'mousedown', handleDot);
}