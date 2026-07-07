"use strict";

import { load, save } from '../lib/storage.js';

const STORAGE_KEY = 'level';
export const MAX_GPA_TEXT = '4.30';

export function gpaValueForLevel(level) {
    const scalingFactor = 0.1;
    const maxGPA = 4.3;
    const minGPA = 1.0;
    return minGPA + (maxGPA - minGPA) * (1 - Math.exp(-scalingFactor * level)) ** 3;
}

export function gpaTextForLevel(level) {
    return gpaValueForLevel(level).toFixed(2);
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
