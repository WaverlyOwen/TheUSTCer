"use strict";

import { isMobileDevice } from './mobile.js';

export class Path {
    constructor(name, board) {
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
        this.line.setAttribute("stroke", "#424874");
        this.line.setAttribute("stroke-width", "8");
        this.line.setAttribute("stroke-linecap", "round");
        this.line.setAttribute("fill", "none");
        this.board.svg.appendChild(this.line);
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

    drawPath(position, distance) {
        const now = this.queue[distance - 1];
        const last = this.queue[distance - 2];
        const node = this.evaluateNodeType(last, now);
        const [lastX, lastY] = this.move([5 + position[0] * 50, 5 + position[1] * 50], (now + 2) % 4, 35);
        if (last === now || distance === 1) {
            this.d.push(`L ${lastX} ${lastY}`);
        } else {
            this.d.push(`A 15 15 0 0 ${Number((last + 1) % 4 == now)} ${lastX} ${lastY}`);
        }
        const [newX, newY] = this.move([lastX, lastY], now, 20);
        this.d.push(`L ${newX} ${newY}`);
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
        const turnRate = 0.7;
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
                this.drawPath([this.x, this.y], this.distance);
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
        this.drawPath([this.x, this.y], this.distance);
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

    handleKey(event) {
        switch (event.key) {
            case 'd' : case 'D' : case 'ArrowRight' : 
                if (this.step(0)) {
                    this.drawPath([this.x, this.y], this.distance);
                    this.updateLine();
                } else if (2 === this.queue[this.distance - 1]) {
                    this.back();
                }
                break;
            case 's' : case 'S' : case 'ArrowDown' : 
                if (this.step(1)) {
                    this.drawPath([this.x, this.y], this.distance);
                    this.updateLine();
                } else if (3 === this.queue[this.distance - 1]) {
                    this.back();
                }
                break;
            case 'a' : case 'A' : case 'ArrowLeft' : 
                if (this.step(2)) {
                    this.drawPath([this.x, this.y], this.distance);
                    this.updateLine();
                } else if (0 === this.queue[this.distance - 1]) {
                    this.back();
                }
                break;
            case 'w' : case 'W' : case 'ArrowUp' : 
                if (this.step(3)) {
                    this.drawPath([this.x, this.y], this.distance);
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
        this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        this.svg.setAttribute("id", name);
        this.svg.classList.add("board");
        this.svg.setAttribute("width", `${(level.size()[0] + 2) * 5}vh`);
        this.svg.setAttribute("height", `${(level.size()[1] + 1) * 5}vh`);
        this.svg.setAttribute("viewBox", `-30 -30 ${(level.size()[0] + 2) * 50} ${(level.size()[1] + 1) * 50}`);
        this.drawBorder();
        this.textG = document.createElementNS("http://www.w3.org/2000/svg", "g");
        this.cellG = document.createElementNS("http://www.w3.org/2000/svg", "g");
        this.roadG = document.createElementNS("http://www.w3.org/2000/svg", "g");
        this.svg.appendChild(this.cellG);
        this.svg.appendChild(this.textG);
        this.svg.appendChild(this.roadG);
        document.body.insertBefore(this.svg, document.getElementById("title"));
    }

    drawBorder() {
        const d = `M 0 0 
             L ${this.size[0] * 50 - 10} 0 
             A 20 20 0 0 1 ${this.size[0] * 50 + 10} 20 
             L ${this.size[0] * 50 + 10} ${this.size[1] * 50 - 10} 
             A 10 10 0 0 0 ${this.size[0] * 50 + 20} ${this.size[1] * 50}
             L ${this.size[0] * 50 + 40} ${this.size[1] * 50} 
             A 5 5 0 0 1 ${this.size[0] * 50 + 40} ${this.size[1] * 50 + 10}
             L 20 ${this.size[1] * 50 + 10} 
             A 20 20 0 0 1 0 ${this.size[1] * 50 - 10} 
             L 0 0  
             Z`;
        
        this.border = document.createElementNS("http://www.w3.org/2000/svg", "path");
        this.border.setAttribute("d", d);
        this.border.setAttribute("fill", "white");
        this.border.setAttribute("stroke", "black");
        this.border.setAttribute("stroke-width", "2");
        this.svg.appendChild(this.border);
    }

    drawStart() {
        this.start = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        this.start.classList.add("start");
        this.start.setAttribute("cx", "5");
        this.start.setAttribute("cy", "5");
        this.start.setAttribute("r", "10");
        this.start.setAttribute("fill", "#DCD6F7");
        this.start.setAttribute("stroke", "#424874");
        this.start.setAttribute("stroke-width", "10");
        this.svg.appendChild(this.start);

        if (isMobileDevice()) {
            this.showRule = false;
            this.start.addEventListener('touchstart', () => {
                if (this.showRule) {
                    this.showRule = false;
                    document.getElementById('mobileRule').style.opacity = 0;
                } else {
                    document.getElementById('mobileRule').style.opacity = 1;
                    this.showRule = true;
                }
            });
        } else {
            this.start.addEventListener('mouseenter', () => {
                document.getElementById('rule').style.opacity = 1;
            });
    
            this.start.addEventListener('mouseleave', () => {
                document.getElementById('rule').style.opacity = 0;
            });
    
        }
        
        
    }

    validAnswer() {
        for (let i = 0; i < this.answer.group.length; i++) {
            const member = this.answer.group[i];
            if (member < Math.sqrt(this.size[0] * this.size[1]) / 2|| member > this.size[0] * this.size[1] / 3 && this.size[0] * this.size[1] > 9) {
                return false;
            }
        }
        return true;
    }

    randomSet(n, max) {
        let set = new Set();
        while (set.size < n) {
            set.add(Math.floor(Math.random() * max));
        }
        return set;
    }

    random(max) {
        return Math.floor(Math.random() * max);
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; --i) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    question() {
        if (!this.answer) {
            this.answer = new Path("answer", this);
            this.answer.generate();
            while (!this.validAnswer()) {
                this.answer.destroy();
                this.answer = new Path("answer", this);
                this.answer.generate();
            }
        }

        let groupType = [];
        const types = this.shuffleArray([7, 8, 9, 10]);
        const typeScale = [2, 2, 2, 4, 4, 11, 11, 1, 3, 5, 5, 2, 2, 5];
        const roadRate = 0.2;
        const signRate = 0.5;

        this.sign = Array.from({ length: (this.size[0] + 1) }, () => Array.from({ length: (this.size[1] + 1) }, () => [[0, 0], [0, 0], [0, 0]]));

        for (let i = 0; i < this.answer.group.length; i++) {
            const member = this.answer.group[i];
            if (member >= 4) {
                let set, queue;
                switch (this.random(4)) {
                    case 1 :
                        set = this.randomSet(2, this.answer.group[i]);
                        queue =[...set].map((element, index) => [element, 11, index]);
                        groupType.push([types[i % 4], queue]);
                        break;
                    case 2 :
                        set = this.randomSet(2, this.answer.group[i]);
                        queue =[...set].map((element, index) => [element, 12, index]);
                        groupType.push([types[i % 4], queue]);
                        break;
                    case 3 :
                        set = this.randomSet(4, this.answer.group[i]);
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
                } else if (Math.random() < signRate / Math.sqrt(this.answer.group[this.answer.groupMap[i][j]])) {
                    this.sign[i][j][2] = [groupType[group][0], this.random(typeScale[groupType[group][0]])];
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
                this.sign[position[0]][position[1]][now] = [Number(Math.random() < roadRate), this.random(typeScale[5 + now])];
                position = this.answer.move(position, now, 1);
            } else {
                position = this.answer.move(position, now, 1);
                this.sign[position[0]][position[1]][now % 2] = [Number(Math.random() < roadRate), this.random(typeScale[5 + now])];
            }
        }
    }

    drawRoad(position, type) {
        let road = document.createElementNS("http://www.w3.org/2000/svg", "text");
        road.setAttribute("x", 50 * position[0]);
        road.setAttribute("y", 50 * position[1]);
        road.setAttribute("text-anchor", "middle");
        road.setAttribute("font-size", 8);
        const name = [
            [
                "孺子牛路", 
                "勤奋路", 
                "寰宇北路", 
                "寰宇南路", 
                "励学路", 
                "黄山路", 
                "瀚海路", 
                "英才路", 
                "红专路", 
                "黄山路", 
                "四牌楼路", 
            ], 
            [
                "金寨路", 
                "郭沫若路", 
                "天使路", 
                "玉泉南路", 
                "玉泉北路", 
                "肥西路", 
                "志学路", 
                "石榴园路", 
                "寰宇东路", 
                "寰宇西路", 
                "济慧路", 
            ]
        ];

        if (type[0] === 6) {
            road.setAttribute("x", 5 + 50 * position[0]);
            road.setAttribute("y", 30 + 50 * position[1]);
            road.setAttribute("writing-mode", "vertical-rl");
            road.innerHTML = name[1][type[1]];
        } else {
            road.setAttribute("x", 30 + 50 * position[0]);
            road.setAttribute("y", 8 + 50 * position[1]);
            road.innerHTML = name[0][type[1]];
        }
        this.roadG.appendChild(road);
    }

    drawCell(position, type) {
        let cell = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        cell.setAttribute("x", 10 + 50 * position[0]);
        cell.setAttribute("y", 10 + 50 * position[1]);
        cell.setAttribute("width", 40);
        cell.setAttribute("height", 40);
        cell.setAttribute("rx", 10);
        cell.setAttribute("ry", 10);
        cell.setAttribute("stroke", "black");
        cell.setAttribute('stroke-width', "2");

        let text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", 30 + 50 * position[0]);
        text.setAttribute("y", 41 + 50 * position[1]);
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("font-size", 30);
        const name = [
            ["少"], 
            ["管", "工", "数"], 
            ["网", "微", "计", "生", "信"], 
            ["环", "核", "地", "化", "物"], 
            ["红", "专"], 
            ["理", "实"] 
        ];

        const color = [
            "orange", 
            "blue", 
            "green",
            "purple", 
            "red", 
            "blue"
        ]

        if (type[0]) {
            text.innerHTML = name[type[0] - 7][type[1]];
            this.textG.appendChild(text);
            if (type[0] < 11) {
                text.setAttribute("fill", "white");
                cell.setAttribute("fill", color[type[0] - 7]);
            } else {
                text.setAttribute("fill", color[type[0] - 7]);
                cell.setAttribute("fill", "white");
            }
        } else {
            text.remove();
            text = null;
            if (type[1]) {
                cell.setAttribute("fill", "#F0F0F0");
            } else {
                cell.setAttribute("fill", "white");
            }
        }

        this.cellG.appendChild(cell);
    }

    drawSign() {
        if (this.sign === undefined) {
            this.question();
        }

        for (let i = 0; i < this.size[0]; i++) {
            for (let j = 0; j < this.size[1]; j++) {
                if (this.sign[i][j][0][0]) {
                    this.drawRoad([i, j], [5, this.sign[i][j][0][1]]);
                }
                if (this.sign[i][j][1][0]) {
                    this.drawRoad([i, j], [6, this.sign[i][j][1][1]]);
                }
                this.drawCell([i, j], this.sign[i][j][2]);
            }
        }
    }

    handleKey(event) {
        switch (event.key) {
            case 'Control' :
                event.preventDefault();
                this.answer.updateLine();
                break;
            case 'Shift' :
                event.preventDefault();
                this.answer.hide();
                break;
            default :
                break;
        }
    }

    user() {
        this.userPath = new Path("user", this);
        document.addEventListener("keydown", this.handleKey.bind(this));
        document.addEventListener("keydown", this.userPath.handleKey.bind(this.userPath));
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
            if (info[2][0] !== info[2][1] && info[2][2] !== info[2][3]) {
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
        document.removeEventListener("keydown", this.handleKey.bind(this));
        document.removeEventListener("keydown", this.userPath.handleKey.bind(this.userPath));
    }
}