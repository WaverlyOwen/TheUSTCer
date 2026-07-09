"use strict";

export function createHud() {
    const primaryElement = document.getElementById('GPA');
    const metaElement = document.getElementById('hud-meta');
    const waElement = document.getElementById('WA');
    let waTimer = null;
    let waVisible = false;

    // WA 与 meta 同区：WA 显示期间暂隐 meta，避免文字叠在一起。
    // 可见性由 render 统一落实（HUD 定时刷新会走这里），
    // 防止 WA 窗口期内换板/换模式后 meta 卡在隐藏态
    function render(snapshot) {
        primaryElement.textContent = snapshot.primary ?? '';
        metaElement.textContent = snapshot.meta ?? '';
        metaElement.style.opacity = waVisible ? 0 : 1;
    }

    return {
        render,
        bumpPrimary() {
            primaryElement.classList.remove('bump');
            void primaryElement.offsetWidth;
            primaryElement.classList.add('bump');
        },
        showWrongAnswer() {
            waVisible = true;
            waElement.style.opacity = 1;
            metaElement.style.opacity = 0;
            clearTimeout(waTimer);
            waTimer = setTimeout(() => {
                waVisible = false;
                waElement.style.opacity = 0;
                metaElement.style.opacity = 1;
            }, 2000);
        },
    };
}
