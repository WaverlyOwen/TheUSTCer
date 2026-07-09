"use strict";

import { load, save } from './storage.js';

const THEME_KEY = 'theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set();

// 'light' | 'dark' | null（null = 跟随系统）
let preference = normalizePreference(load(THEME_KEY, null));

function normalizePreference(value) {
    return value === 'dark' || value === 'light' ? value : null;
}

export function currentTheme() {
    return preference ?? (media.matches ? 'dark' : 'light');
}

export function isDark() {
    return currentTheme() === 'dark';
}

function apply() {
    document.documentElement.dataset.theme = currentTheme();
    for (const listener of listeners) {
        listener(currentTheme());
    }
}

export function themePreference() {
    return preference;
}

// 'light' | 'dark' | null（null = 跟随系统），菜单三态选择用
export function setThemePreference(next) {
    preference = normalizePreference(next);
    save(THEME_KEY, preference);
    apply();
    return preference;
}

export function onThemeChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

// 题板 SVG 用色（SVG fill/stroke 是属性而非 CSS，需要 JS 侧取值；
// 切主题后由 main.js 重建 BoardView 生效）。
// cellColors 对应类型码 7-12，色相语义固定：橙=光启·仲英（少年班）、
// 蓝=冲之（管工数）、绿=时珍（网微计生信）、紫=守敬（环核地化物）、
// 红=红专、蓝=理实；暗色用同色相的提亮变体，避免饱和原色压深底发闷。
// buildingCell 为教学楼块底色。
export function boardPalette() {
    if (isDark()) {
        return {
            boardFill: '#161a21',
            stroke: '#525a68',
            blankCell: '#1d222b',
            shadeCell: '#2a303b',
            roadText: '#c6ccd8',
            cellColors: ['#f0a355', '#6f9ee8', '#5cb987', '#b18ae0', '#ec6a6a', '#6f9ee8'],
            buildingCell: '#4b5363',
            buildingShape: '#3d4552',
            buildingText: '#e8eaef',
        };
    }
    return {
        boardFill: '#ffffff',
        stroke: '#2b2b2b',
        blankCell: '#ffffff',
        shadeCell: '#efeff1',
        roadText: '#1c1c1c',
        cellColors: ['#e69138', '#4272b8', '#4a9e6b', '#8e63b5', '#d64545', '#4272b8'],
        buildingCell: '#3a3f4b',
        buildingShape: '#c3c6cd',
        buildingText: '#1c1c1c',
    };
}

media.addEventListener?.('change', () => {
    if (preference === null) {
        apply();
    }
});

apply();
