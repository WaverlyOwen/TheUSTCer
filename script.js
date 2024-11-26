"use strict";

import { createLevel } from './level.js';
import { Board } from './board.js';
import { createSwipeDetector } from './mobile.js';
import { simulateKey } from './mobile.js';
import { isMobileDevice } from './mobile.js';

function createBoard() {
    if (board !== undefined) {
        board.destroy();
    }
    // Recreate board;
    board = new Board("problem", level);
    board.drawSign();
    board.user();
    board.drawStart();
}

function handleKey(event) {
    switch (event.key) {
        case 'Tab' :
            event.preventDefault();
            createBoard();
            break;
        case 'Enter' :
            event.preventDefault();
            if (board.test()) {
                level.increment();
                createBoard();

            } else {
                document.getElementById('WA').style.opacity = 1;
                setTimeout(() => {
                    document.getElementById('WA').style.opacity = 0;
                }, 2000);
            }
            break;
        default :
            break;
    }
}

const level = createLevel();
level.GPA();
const swipeDetector = createSwipeDetector(5);

let board;
createBoard();

// Add event listener
document.addEventListener("keydown", handleKey);

if (isMobileDevice()) {
    document.getElementById("rule").remove();
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
} else {
    document.getElementById('mobile').remove();
}