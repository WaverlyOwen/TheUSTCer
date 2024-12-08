"use strict";

import * as Common from './common.js';
import * as Menu from './menu.js';

export const isMobileDevice = () => {
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
};

const createSwipeDetector = (threshold = 40) => {
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

    const swipeDetector = createSwipeDetector();
    swipeDetector.addEventListener();

    return swipeDetector;
}

export function menu(dot, swipeDetector) {
    if (dot.show === undefined) {
        dot.show = false;
    }
    function handleOut(event) {
        let slider = document.querySelector('.slider');
        const rect = slider.getBoundingClientRect();
  
        if (isMobileDevice()) {
            event = event.touches[0];
        }
        
        const x = event.clientX;
        const y = event.clientY;
  
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
            if(swipeDetector){
                swipeDetector.addEventListener();
            }

            const overlay = document.getElementById('dark-overlay');
            
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

            dot.show = false;
            document.removeEventListener(isMobileDevice() ? 'touchstart' : 'mousedown', handleOut);
        }
    }

    function handleDot() {
        if (dot.show) {
            handleOut({clientX: 0, clientY: 0});
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

            Menu.createMenu(handleOut);
            dot.show = true;
        }
    }

    dot.addEventListener(isMobileDevice() ? 'touchstart' : 'mousedown', handleDot, { passive: false });
}