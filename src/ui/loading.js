"use strict";

export function createLoadingOverlay() {
    let overlay = null;
    let messageElement = null;

    function ensure() {
        if (overlay) {
            return;
        }
        overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loading-panel">
                <div class="loading-spinner"></div>
                <div class="loading-message">正在生成题目...</div>
            </div>
        `;
        messageElement = overlay.querySelector('.loading-message');
        document.body.appendChild(overlay);
    }

    return {
        show(message = '正在生成题目...') {
            ensure();
            messageElement.textContent = message;
            overlay.classList.add('active');
        },
        hide() {
            overlay?.classList.remove('active');
        },
    };
}
