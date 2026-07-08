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

// 精选主题色相：固定少数色相，浅色题板用低饱和深色线 + 同色相浅色答案线；
// 深色题板反转明度（亮线 + 暗答案线）。金色留给胜利动画、红色留给失败态，不进轮换。
const THEME_HUES = [
    { hue: 215, sat: 28 }, // 蓝
    { hue: 168, sat: 25 }, // 青
    { hue: 262, sat: 24 }, // 紫
    { hue: 345, sat: 26 }, // 绛
    { hue: 28, sat: 30 },  // 褐
];

export function getThemeColors(dark = false) {
    const { hue, sat } = THEME_HUES[Math.floor(Math.random() * THEME_HUES.length)];
    if (dark) {
        // 深底：用户线亮而干净（高亮度中饱和），答案线沉在底色附近但仍可辨
        return {
            darkColor: `hsl(${hue}, ${sat + 32}%, 76%)`,
            lightColor: `hsl(${hue}, ${sat + 10}%, 38%)`,
        };
    }
    return {
        darkColor: `hsl(${hue}, ${sat}%, 40%)`,
        lightColor: `hsl(${hue}, ${sat + 4}%, 88%)`,
    };
}
