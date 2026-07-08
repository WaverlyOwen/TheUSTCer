"use strict";

// 复制到剪贴板：优先 Clipboard API，非安全上下文回退 execCommand
export async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        const area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        let copied = false;
        try {
            copied = document.execCommand('copy');
        } catch {
            copied = false;
        }
        area.remove();
        return copied;
    }
}
