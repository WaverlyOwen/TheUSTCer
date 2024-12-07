"use strict";
import * as Common from './common.js';
import { isMobileDevice } from './mobile.js';

export function path(board, position, distance) {
    const now = board.queue[distance - 1];
    const last = board.queue[distance - 2];
    const node = board.evaluateNodeType(last, now);
    const [lastX, lastY] = board.move([5 + position[0] * 50, 5 + position[1] * 50], (now + 2) % 4, 35);
    if (last === now || distance === 1) {
        board.d.push(`L ${lastX} ${lastY}`);
    } else {
        board.d.push(`A 15 15 0 0 ${Number((last + 1) % 4 == now)} ${lastX} ${lastY}`);
    }
    const [newX, newY] = board.move([lastX, lastY], now, 20);
    board.d.push(`L ${newX} ${newY}`);
}

export function border(board) {
    const d = `M 0 0 
         L ${board.size[0] * 50 - 10} 0 
         A 20 20 0 0 1 ${board.size[0] * 50 + 10} 20 
         L ${board.size[0] * 50 + 10} ${board.size[1] * 50 - 10} 
         A 10 10 0 0 0 ${board.size[0] * 50 + 20} ${board.size[1] * 50}
         L ${board.size[0] * 50 + 40} ${board.size[1] * 50} 
         A 5 5 0 0 1 ${board.size[0] * 50 + 40} ${board.size[1] * 50 + 10}
         L 20 ${board.size[1] * 50 + 10} 
         A 20 20 0 0 1 0 ${board.size[1] * 50 - 10} 
         L 0 0  
         Z`;
        
    board.border = document.createElementNS("http://www.w3.org/2000/svg", "path");
    Common.setAttribute(board.border, [
        ["d", d], 
        ["fill", "white"],
        ["stroke", "black"], 
        ["stroke-width", "2"]
    ]);
    board.svg.appendChild(board.border);
}

export function start(board) {

    board.start = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    board.start.classList.add("start");
    Common.setAttribute(board.start, [
        ["cx", "5"], 
        ["cy", "5"],
        ["r", "10"], 
        ["fill", board.themeColor.lightColor], 
        ["stroke", board.themeColor.darkColor],
        ["stroke-width", "10"]
    ]);
    board.svg.appendChild(board.start);

    if (isMobileDevice()) {
        board.showRule = false;
        board.start.addEventListener('touchstart', () => {
            if (board.showRule) {
                board.showRule = false;
                document.getElementById('mobileRule').style.opacity = 0;
            } else {
                document.getElementById('mobileRule').style.opacity = 1;
                board.showRule = true;
            }
        });
    } else {
        board.start.addEventListener('mouseenter', () => {
            document.getElementById('rule').style.opacity = 1;
        });

        board.start.addEventListener('mouseleave', () => {
            document.getElementById('rule').style.opacity = 0;
        });
    }
}

export function road(board, position, type) {
    let road = document.createElementNS("http://www.w3.org/2000/svg", "text");
    Common.setAttribute(road, [
        ["text-anchor", "middle"], 
        ["font-size", 8]
    ]);
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
        Common.setAttribute(road, [
            ["x", 5 + 50 * position[0]], 
            ["y", 30 + 50 * position[1]],
            ["writing-mode", "vertical-rl"]
        ]);
        road.innerHTML = name[1][type[1]];
    } else {
        Common.setAttribute(road, [
            ["x", 30 + 50 * position[0]], 
            ["y", 8 + 50 * position[1]]
        ]);
        road.innerHTML = name[0][type[1]];
    }
    board.roadG.appendChild(road);
}

export function cell(board, position, type) {
    let cell = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    Common.setAttribute(cell, [
        ["x", 10 + 50 * position[0]], 
        ["y", 10 + 50 * position[1]], 
        ["width", 40], 
        ["height", 40], 
        ["rx", 10], 
        ["ry", 10], 
        ["stroke", "black"], 
        ['stroke-width', 2]
    ]);

    let text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    Common.setAttribute(text, [
        ["x", 30 + 50 * position[0]], 
        ["y", 41 + 50 * position[1]], 
        ["text-anchor", "middle"], 
        ["font-size", 30]
    ]);
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
        board.textG.appendChild(text);
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

    board.cellG.appendChild(cell);
}