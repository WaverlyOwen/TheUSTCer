"use strict";

import * as Common from './common.js';
import * as Draw from './draw.js';

export class Path {
    constructor(name, board, color) {
        this.name = name;
        this.size = board.size;
        this.board = board;
        this.queue = [];
        this.map = Array(this.size[0] + 1).fill().map(() => Array(this.size[1] + 1).fill(false));
        this.map[0][0] = true;
        this.x = 0;
        this.y = 0;
        this.distance = 0;
        this.d = ['M 5 5'];
        this.group = [];

        this.line = document.createElementNS("http://www.w3.org/2000/svg", "path");
        
        this.color = color;
        Common.setAttribute(this.line, [
            ["stroke", this.color], 
            ["stroke-width", "8"], 
            ["stroke-linecap", "round"], 
            ["fill", "none"]
        ]);
        this.board.svg.appendChild(this.line);
        this.handleKey = (event) => {
            switch (event.key) {
                case 'd' : case 'D' : case 'ArrowRight' : 
                    if (this.step(0)) {
                        Draw.path(this, [this.x, this.y], this.distance);
                        this.updateLine();
                    } else if (2 === this.queue[this.distance - 1]) {
                        this.back();
                    }
                    break;
                case 's' : case 'S' : case 'ArrowDown' : 
                    if (this.step(1)) {
                        Draw.path(this, [this.x, this.y], this.distance);
                        this.updateLine();
                    } else if (3 === this.queue[this.distance - 1]) {
                        this.back();
                    }
                    break;
                case 'a' : case 'A' : case 'ArrowLeft' : 
                    if (this.step(2)) {
                        Draw.path(this, [this.x, this.y], this.distance);
                        this.updateLine();
                    } else if (0 === this.queue[this.distance - 1]) {
                        this.back();
                    }
                    break;
                case 'w' : case 'W' : case 'ArrowUp' : 
                    if (this.step(3)) {
                        Draw.path(this, [this.x, this.y], this.distance);
                        this.updateLine();
                    } else if (1 === this.queue[this.distance - 1]) {
                        this.back();
                    }
                    break;
                case 'Backspace' :
                    this.back();
                    break;
                case 'r' : case 'R' : 
                    while (this.distance) {
                        this.back();
                    }
                    break;
                default:
                    break;
            }
        }
    }

    move(position, now, length) {
        const direction = [[1, 0], [0, 1], [-1, 0], [0, -1]];
        return [position[0] + direction[now][0] * length, position[1] + direction[now][1] * length];
    }

    evaluateNodeType(last, now) {
        if (last === now) {
            return 0;
        } else if ((last + 1) % 4 == now) {
            return 1;
        } else if ((now + 1) % 4 == last) {
            return 2;
        }
    }

    step(now) {
        const [newX, newY] = this.move([this.x, this.y], now, 1);
        if (0 <= newX && newX <= this.size[0] && 
            0 <= newY && newY <= this.size[1] &&
            !this.map[newX][newY]) {
            
            this.map[newX][newY] = true;
            this.queue.push(now);
            this.x = newX;
            this.y = newY;
            this.distance++;

            return true;
        } else if (newX == this.size[0] + 1 && newY == this.size[1]) {
            this.queue.push(now);
            this.x = newX;
            this.y = newY;
            this.distance++;
            this.createGroup();
            return true;
        }
        return false;
    }

    valid() {
        let visited = Array.from({ length: (this.size[0] + 1) }, () => Array(this.size[1] + 1).fill(false));
        let queue = [[this.x, this.y]];
        
        while (queue.length > 0) {
            const position = queue.shift();
      
            if (position[0] === this.size[0] && position[1] === this.size[1]) {
                return true;
            }

            for (let i = 0; i < 4; i++) {
                const [newX, newY] = this.move(position, i, 1);
      
            if(
              newX >= 0 && newX <= this.size[0] &&
              newY >= 0 && newY <= this.size[1] &&
              this.map[newX][newY] === false &&
              !visited[newX][newY]
            ) {
              queue.push([newX, newY]);
              visited[newX][newY] = true;
            }
          }
        }
        return false;
    }

    hide() {
        this.line.setAttribute("d", "");
    }

    generate() {
        let last = Math.floor(Math.random() * 2);
        const turnRate = 0.8;
        while (this.x !== this.size[0] || this.y !== this.size[1]) {

            const random = Math.random();
            let now = 0;

            if (random < turnRate / 2) {
                now = (last + 1) % 4;
            } else if (random < turnRate) {
                now = (last + 3) % 4;
            } else {
                now = last;
            }

            if (this.step(now)) {
                Draw.path(this, [this.x, this.y], this.distance);
                this.updateLine();
                if (this.valid()) {
                    last = now;
                } else {
                    this.back();
                }
            }
        }

        // Last step
        this.step(0);
        Draw.path(this, [this.x, this.y], this.distance);
        this.updateLine();
        this.hide();
    }

    back() {
        if (!this.distance) {
            return;
        }
        const now = this.queue.pop();
        this.distance--;
        if (this.x <= this.size[0]) {
            this.map[this.x][this.y] = false;
        }
        const [newX, newY] = this.move([this.x, this.y], (now + 2) % 4, 1);
        this.x = newX;
        this.y = newY;
        this.d.pop();
        this.d.pop();
        this.updateLine();
    }

    updateLine() {
        this.line.setAttribute("d", this.d.join(' '));
    }

    searchGroup(position, groupNumber, barrier) {
        this.groupMap[position[0]][position[1]] = groupNumber;
        let queue = [position.slice()];
        let member = 1;

        while (queue.length) {
            position = queue.shift();
            for (let i = 0; i < 4; i++) {
                const [newX, newY] = this.move(position, i, 1);
                if (newX >= 0 && newX < this.size[0] && 
                    newY >= 0 && newY < this.size[1] && 
                    this.groupMap[newX][newY] === -1 &&
                    !barrier[i < 2 ? newX : position[0]][i < 2 ? newY : position[1]][(i + 1) % 2]) {
                    queue.push([newX, newY]);
                    this.groupMap[newX][newY] = groupNumber;
                    member++;
                }
            }
        }

        return member;
    }

    createBarrier() {
        let barrier = Array.from({ length: (this.size[0] + 1) }, () => Array.from({ length: (this.size[1] + 1) }, () => [false, false]));
        let position = [0, 0];

        for (let i = 0; i < this.distance; i++) {
            const now = this.queue[i];
            if (now < 2) {
                barrier[position[0]][position[1]][now] = true;
                position = this.move(position, now, 1);
            } else {
                position = this.move(position, now, 1);
                barrier[position[0]][position[1]][now % 2] = true;
            }
        }

        return barrier;
    }

    createGroup() {
        let barrier = this.createBarrier();
        this.group = [];
        this.groupMap = Array(this.size[0]).fill().map(() => Array(this.size[1]).fill(-1));

        for (let i = 0; i < this.size[0]; ++i) {
            for (let j = 0; j < this.size[1]; ++j) {
                if (this.groupMap[i][j] !== -1) {
                    continue;
                } else {
                    this.group.push(this.searchGroup([i, j], this.group.length, barrier));
                }
            }
        }
    }

    destroy() {
        this.line.remove();
    }
}

export class Board {
    constructor(name, level) {
        this.name = name;
        this.size = level.size();
        this.themeColor = Common.getThemeColors();
        this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        this.level = level;
        Common.setAttribute(this.svg, [
            ["id", name], 
            ["width", `${(level.size()[0] + 2) * 5}vh`],
            ["height", `${(level.size()[1] + 1) * 5}vh`], 
            ["viewBox", `-30 -30 ${(level.size()[0] + 2) * 50} ${(level.size()[1] + 1) * 50}`]
        ]);
        this.svg.classList.add("board");
        Draw.border(this);
        this.textG = document.createElementNS("http://www.w3.org/2000/svg", "g");
        this.cellG = document.createElementNS("http://www.w3.org/2000/svg", "g");
        this.roadG = document.createElementNS("http://www.w3.org/2000/svg", "g");
        this.svg.appendChild(this.cellG);
        this.svg.appendChild(this.textG);
        this.svg.appendChild(this.roadG);
        document.body.insertBefore(this.svg, document.getElementById("title"));

        this.handleKey = (event) => {
            switch (event.key) {
                case 'Control' :
                    event.preventDefault();
                    this.answer.updateLine();
                    this.level.decrement();
                    break;
                case 'Shift' :
                    event.preventDefault();
                    this.answer.hide();
                    break;
                default :
                    break;
            }
        };
    }

    validAnswer() {
        if (this.answer.group.length < Math.sqrt(this.size[0] * this.size[1]) && Math.sqrt(this.size[0] * this.size[1]) > 3) {
            return false;
        }
        for (let i = 0; i < this.answer.group.length; i++) {
            const member = this.answer.group[i];
            if ((member === 1 || member > this.size[0] * this.size[1] / 2) && this.size[0] * this.size[1] > 9) {
                return false;
            }
        }
        return true;
    }

    question() {
        if (!this.answer) {
            this.answer = new Path("answer", this, this.themeColor.lightColor);
            this.answer.generate();
            while (!this.validAnswer()) {
                this.answer.destroy();
                this.answer = new Path("answer", this, this.themeColor.lightColor);
                this.answer.generate();
            }
        }

        let groupType = [];
        const types = Common.shuffleArray([7, 8, 9, 10]);
        const typeScale = [2, 2, 2, 4, 4, 11, 11, 1, 3, 5, 5, 2, 2, 5];
        const roadRate = 0.2;
        const signRate = 0.7;

        this.sign = Array.from({ length: (this.size[0] + 1) }, () => Array.from({ length: (this.size[1] + 1) }, () => [[0, 0], [0, 0], [0, 0]]));

        for (let i = 0; i < this.answer.group.length; i++) {
            const member = this.answer.group[i];
            if (member >= 4) {
                let set, queue;
                switch (Common.random(4)) {
                    case 1 :
                        set = Common.randomSet(2, this.answer.group[i]);
                        queue =[...set].map((element, index) => [element, 11, index]);
                        groupType.push([types[i % 4], queue]);
                        break;
                    case 2 :
                        set = Common.randomSet(2, this.answer.group[i]);
                        queue =[...set].map((element, index) => [element, 12, index]);
                        groupType.push([types[i % 4], queue]);
                        break;
                    case 3 :
                        set = Common.randomSet(4, this.answer.group[i]);
                        queue =[...set].map((element, index) => [element, 11 + Math.floor(index / 2), index % 2]);
                        groupType.push([types[i % 4], queue]);
                        break;
                    case 0 : default :
                        groupType.push([types[i % 4], []]);
                        break;
                }
            } else {
                groupType.push([types[i % 4], []]);
            }
        }

        for (let i = 0; i < this.size[0]; i++) {
            for (let j = 0; j < this.size[1]; j++) {
                const group = this.answer.groupMap[i][j];
                let type;
                this.answer.group[group]--;
                if (type = groupType[group][1].find(cell => cell[0] === this.answer.group[group])) {
                    this.sign[i][j][2] = [type[1], type[2]];
                } else if (Math.random() < signRate / Math.sqrt(Math.sqrt(this.answer.group[this.answer.groupMap[i][j]]))) {
                    this.sign[i][j][2] = [groupType[group][0], Common.random(typeScale[groupType[group][0]])];
                } else if ((i + j) % 2) {
                    this.sign[i][j][2] = [0, 1];
                } else {
                    this.sign[i][j][2] = [0, 0];
                }
            }
        }
        this.answer.createGroup();

        let position = [0, 0];

        for (let i = 0; i < this.answer.distance; i++) {
            const now = this.answer.queue[i];
            if (now < 2) {
                this.sign[position[0]][position[1]][now] = [Number(Math.random() < roadRate), Common.random(typeScale[5 + now])];
                position = this.answer.move(position, now, 1);
            } else {
                position = this.answer.move(position, now, 1);
                this.sign[position[0]][position[1]][now % 2] = [Number(Math.random() < roadRate), Common.random(typeScale[5 + now])];
            }
        }
    }

    drawSign() {
        if (this.sign === undefined) {
            this.question();
        }

        for (let i = 0; i < this.size[0]; i++) {
            for (let j = 0; j < this.size[1]; j++) {
                if (this.sign[i][j][0][0]) {
                    Draw.road(this, [i, j], [5, this.sign[i][j][0][1]])
                }
                if (this.sign[i][j][1][0]) {
                    Draw.road(this, [i, j], [6, this.sign[i][j][1][1]]);
                }
                Draw.cell(this, [i, j], this.sign[i][j][2]);
            }
        }
    }

    user() {
        this.userPath = new Path("user", this, this.themeColor.darkColor);
        document.addEventListener("keydown", this.handleKey);
        document.addEventListener("keydown", this.userPath.handleKey);
    }

    test() {
        if (this.userPath.x !== this.size[0] + 1 || this.userPath.y !== this.size[1]) {
            return false;
        }

        let group = [...this.userPath.group].map((element) => [element, 0, [false, false, false, false]])
        const barrier = this.userPath.createBarrier();

        for (let i = 0; i < this.size[0]; i++) {
            for (let j = 0; j < this.size[1]; j++) {
                if (this.sign[i][j][2][0] > 0 && this.sign[i][j][2][0] < 11) {
                    if (group[this.userPath.groupMap[i][j]][1]) {
                        if (group[this.userPath.groupMap[i][j]][1] !== this.sign[i][j][2][0]) {
                            return false;
                        }
                    } else {
                        group[this.userPath.groupMap[i][j]][1] = this.sign[i][j][2][0];
                    }
                } else if (0 < this.sign[i][j][2][0]) {
                    const index = (this.sign[i][j][2][0] - 11) * 2 + this.sign[i][j][2][1];
                    if (group[this.userPath.groupMap[i][j]][2][index]) {
                        return false;
                    } else {
                        group[this.userPath.groupMap[i][j]][2][index] = true;
                    }
                }

                if (this.sign[i][j][0][0] && !barrier[i][j][0]) {
                    return false;
                }
                if (this.sign[i][j][1][0] && !barrier[i][j][1]) {
                    return false;
                }
            }
        }

        for (const info of group) {
            if (info[2][0] !== info[2][1] || info[2][2] !== info[2][3]) {
                return false;
            }
        }
        return true;
    }

    destroy() {
        if (this.userPath) {
            this.userPath.destroy();
        }
        if (this.answer) {
            this.answer.destroy();
        }
        this.svg.remove();
        document.removeEventListener("keydown", this.handleKey);
        document.removeEventListener("keydown", this.userPath.handleKey);
    }
}