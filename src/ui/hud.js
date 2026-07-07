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
            waElement.style.opacity = 1;
            clearTimeout(waTimer);
            waTimer = setTimeout(() => {
                waElement.style.opacity = 0;
            }, 2000);
        },
    };
}
