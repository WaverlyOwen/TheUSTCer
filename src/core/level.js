"use strict";

import { load, save } from '../lib/storage.js';

const STORAGE_KEY = 'level';
export const MAX_GPA_TEXT = '4.30';
// 满绩关数：第 80 关整达到 4.30
export const MAX_LEVEL = 80;

// 温和前快后缓的有界曲线：前期每关 ≈0.07 保留成长感，
// 末段每关仍有 ≈0.01 的可见增长，不再有旧指数曲线的渐近死线
// （旧曲线 35 关后要再磨 40+ 关才涨完最后 0.30）。
export function gpaValueForLevel(level) {
    const progress = Math.min(1, Math.max(0, level / MAX_LEVEL));
    return 1 + 3.3 * (1 - (1 - progress) ** 1.8);
}

export function gpaTextForLevel(level) {
    // 向下截断而非四舍五入："4.30" 只在真正满级时出现
    // （79 关 GPA=4.2988，四舍五入会提前一关显示满绩）；
    // +1e-6 抵消浮点误差（4.3*100 = 429.9999...）
    return (Math.floor(gpaValueForLevel(level) * 100 + 1e-6) / 100).toFixed(2);
}

// 学分：满绩（80 关）之后每再通 10 关记 1 学分
export function creditsForLevel(level) {
    return Math.max(0, Math.floor((level - MAX_LEVEL) / 10));
}

export function sizeForLevel(level) {
    return [Math.floor(level / 10 + 1.5), Math.floor(level / 10 + 1)];
}

export function createLevel({ persist = true, initial = null } = {}) {
    let level = 0;
    if (initial !== null && Number.isInteger(initial) && initial >= 0) {
        level = initial;
    } else if (persist) {
        const saved = load(STORAGE_KEY, 0);
        if (Number.isInteger(saved) && saved > 0) {
            level = saved;
        }
    }

    const listeners = new Set();

    function changed() {
        if (persist) {
            save(STORAGE_KEY, level);
        }
        for (const listener of listeners) {
            listener(api);
        }
    }

    const api = {
        get value() {
            return level;
        },
        gpaText() {
            return gpaTextForLevel(level);
        },
        isMax() {
            return api.gpaText() === MAX_GPA_TEXT;
        },
        size() {
            return sizeForLevel(level);
        },
        sizeAt(value) {
            return sizeForLevel(value);
        },
        increment() {
            level++;
            changed();
        },
        decrement() {
            if (level > 0) {
                level--;
                changed();
            }
        },
        set(nextLevel) {
            if (!Number.isInteger(nextLevel) || nextLevel < 0 || nextLevel === level) {
                return;
            }
            level = nextLevel;
            changed();
        },
        onChange(listener) {
            listeners.add(listener);
        },
    };
    return api;
}
