"use strict";

export function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; --i) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

export function randomSet(n, max) {
    const set = new Set();
    while (set.size < n) {
        set.add(Math.floor(Math.random() * max));
    }
    return set;
}

export function random(max) {
    return Math.floor(Math.random() * max);
}

// 精选主题色对：固定少数色相、低饱和低明度的深色（用户线）+ 同色相浅色（答案线/圆点）。
// 金色留给胜利动画、红色留给失败态，不进轮换。
const THEMES = [
    { darkColor: 'hsl(215, 28%, 40%)', lightColor: 'hsl(215, 32%, 88%)' }, // 蓝
    { darkColor: 'hsl(168, 25%, 38%)', lightColor: 'hsl(168, 28%, 87%)' }, // 青
    { darkColor: 'hsl(262, 22%, 44%)', lightColor: 'hsl(262, 28%, 89%)' }, // 紫
    { darkColor: 'hsl(345, 26%, 44%)', lightColor: 'hsl(345, 30%, 89%)' }, // 绛
    { darkColor: 'hsl(28, 30%, 42%)',  lightColor: 'hsl(35, 35%, 87%)' },  // 褐
];

export function getThemeColors() {
    return THEMES[Math.floor(Math.random() * THEMES.length)];
}
