"use strict";

export function createHud(level) {
    const gpaElement = document.getElementById('GPA');
    const waElement = document.getElementById('WA');
    let waTimer = null;

    function render() {
        gpaElement.textContent = `GPA ${level.gpaText()}`;
    }

    level.onChange(() => {
        render();
        gpaElement.classList.remove('bump');
        void gpaElement.offsetWidth;
        gpaElement.classList.add('bump');
    });
    render();

    return {
        showWrongAnswer() {
            waElement.style.opacity = 1;
            clearTimeout(waTimer);
            waTimer = setTimeout(() => {
                waElement.style.opacity = 0;
            }, 2000);
        },
    };
}
