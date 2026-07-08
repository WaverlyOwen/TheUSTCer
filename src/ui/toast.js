"use strict";

let container = null;

// 轻量顶部提示条：保存成功 / 链接已复制 / No Answer 等即时反馈
export function showToast(message, { duration = 2200 } = {}) {
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    const item = document.createElement('div');
    item.className = 'toast-item';
    item.textContent = message;
    container.appendChild(item);
    requestAnimationFrame(() => item.classList.add('show'));
    setTimeout(() => {
        item.classList.remove('show');
        setTimeout(() => item.remove(), 300);
    }, duration);
}
