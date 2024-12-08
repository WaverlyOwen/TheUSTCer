"use strict";

import { createLevel } from './level.js';
import { Board } from './board.js';
import * as Draw from './draw.js';
import * as Device from './device.js';
import * as Common from './common.js';

function createBoard(board, level, swipeDetector) {
    if (board !== undefined) {
        board.destroy();
    }
    // Recreate board;
    board = new Board("problem", level);
    board.drawSign();
    board.user();
    Draw.dot(board, swipeDetector);
    return board;
}

window.addEventListener('load', onWndLoad, false);

function onWndLoad() {
    const level = createLevel();
    level.GPA();
    
    let swipeDetector;
    if (!Device.isMobileDevice()) {
        Common.remove('#mobileRule');
        Common.remove('#mobile');
    } else {
        Common.remove("#rule");
        swipeDetector = Device.mobile();
    }

    let board;
    board = createBoard(board, level, swipeDetector);
    
    // Add event listener
    document.addEventListener("keydown", function(event) {
        switch (event.key) {
            case 'Tab' :
                event.preventDefault();
                board = createBoard(board, level, swipeDetector);
                level.decrement();
                break;
            case 'Enter' :
                event.preventDefault();
                if (board.test()) {
                    level.increment();
                    board = createBoard(board, level, swipeDetector);
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
    });

}