"use strict";

const PREFIX = 'ustcer.';

export function load(key, fallback) {
    try {
        const value = localStorage.getItem(PREFIX + key);
        return value === null ? fallback : JSON.parse(value);
    } catch {
        return fallback;
    }
}

export function save(key, value) {
    try {
        localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
        // 隐私模式等场景下静默降级为不持久化
    }
}

export function remove(key) {
    try {
        localStorage.removeItem(PREFIX + key);
    } catch {
        // 删除失败时静默降级
    }
}
