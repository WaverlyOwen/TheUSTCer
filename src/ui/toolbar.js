"use strict";

// 顶栏：☰ 模式菜单在左，功能图标在右（清空/答案/换图/保存/规则）。
// 主题与灵敏度设置在 ☰ 菜单的「设置」节里（见 ui/mode-menu.js）。
// 按钮元素来自 index.html 静态结构，这里只做行为接线与状态反映。
export function setupToolbar(handlers) {
    const answerButton = document.getElementById('tool-answer');
    let answerShown = false;

    function reflectAnswer() {
        answerButton.classList.toggle('active', answerShown);
        answerButton.title = answerShown ? '隐藏答案' : '显示答案（扣关卡）';
        answerButton.setAttribute('aria-label', answerButton.title);
    }

    document.getElementById('tool-clear').addEventListener('click', () => handlers.clear());

    answerButton.addEventListener('click', () => {
        if (answerShown) {
            handlers.hideAnswer();
        } else {
            handlers.showAnswer();
        }
    });

    document.getElementById('tool-reroll').addEventListener('click', () => handlers.changeMap());
    document.getElementById('tool-save').addEventListener('click', () => handlers.savePuzzle());

    reflectAnswer();

    return {
        setAnswerShown(shown) {
            answerShown = Boolean(shown);
            reflectAnswer();
        },
    };
}
