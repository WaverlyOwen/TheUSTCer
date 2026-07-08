"use strict";

export function createHud() {
    const primaryElement = document.getElementById('GPA');
    const metaElement = document.getElementById('hud-meta');
    const statusElement = document.getElementById('hud-status');
    const waElement = document.getElementById('WA');
    let waTimer = null;

    function render(snapshot) {
        primaryElement.textContent = snapshot.primary ?? '';
        metaElement.textContent = snapshot.meta ?? '';
        statusElement.textContent = snapshot.status ?? '';
    }

    return {
        render,
        bumpPrimary() {
            primaryElement.classList.remove('bump');
            void primaryElement.offsetWidth;
            primaryElement.classList.add('bump');
        },
        showWrongAnswer() {
            // WA 与 meta/status 同区：显示期间暂隐后两者，避免文字叠在一起
            waElement.style.opacity = 1;
            metaElement.style.opacity = 0;
            statusElement.style.opacity = 0;
            clearTimeout(waTimer);
            waTimer = setTimeout(() => {
                waElement.style.opacity = 0;
                metaElement.style.opacity = 1;
                statusElement.style.opacity = 1;
            }, 2000);
        },
    };
}
