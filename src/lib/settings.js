"use strict";

import { load, save } from './storage.js';

const SENSITIVITY_KEY = 'sensitivity';
export const SENSITIVITY_MIN = 0.5;
export const SENSITIVITY_MAX = 1.5;

function clampSensitivity(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 1;
    }
    return Math.min(SENSITIVITY_MAX, Math.max(SENSITIVITY_MIN, numeric));
}

let sensitivity = clampSensitivity(load(SENSITIVITY_KEY, 1));

// 画线跟手灵敏度：手机滑动触发距离与拖动提交阈值共用，越高越跟手
export function getSensitivity() {
    return sensitivity;
}

export function setSensitivity(value) {
    sensitivity = clampSensitivity(value);
    save(SENSITIVITY_KEY, sensitivity);
    return sensitivity;
}
