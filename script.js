"use strict";

import { createLevel } from './level.js';
import { Board } from './board.js';
import { createSwipeDetector } from './mobile.js';

function createBoard() {
    if (board !== undefined) {
        board.destroy();
    }
    // Recreate board;
    board = new Board("problem", level);
    board.drawBorder();
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
const swipeDetector = createSwipeDetector(30);
level.GPA();

let board;
createBoard();

// Add event listener
document.addEventListener("keydown", handleKey);
document.addEventListener("touchstart", swipeDetector.handleTouchStart, false);
document.addEventListener("touchmove", swipeDetector.handleTouchMove, false);