"use strict";

import { createLevel } from './level.js';
import { Board } from './board.js';
import { mobile } from './mobile.js';
import * as Draw from './draw.js';
import * as Rule from './menu.js';

function createBoard(board, level) {
    if (board !== undefined) {
        board.destroy();
    }
    // Recreate board;
    board = new Board("problem", level);
    board.drawSign();
    board.user();
    Draw.start(board);
    return board;
}

window.addEventListener('load', onWndLoad, false);

function onWndLoad() {
    const level = createLevel();
    level.GPA();
    
    let board;
    board = createBoard(board, level);
    
    Rule.onWndLoad();
    
    // Add event listener
    document.addEventListener("keydown", function(event) {
        switch (event.key) {
            case 'Tab' :
                event.preventDefault();
                board = createBoard(board, level);
                break;
            case 'Enter' :
                event.preventDefault();
                if (board.test()) {
                    level.increment();
                    board = createBoard(board, level);
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
    
    mobile();
}