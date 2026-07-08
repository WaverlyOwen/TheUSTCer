"use strict";

export function attachKeyboard(actions) {
    const handler = (event) => {
        // 焦点在表单控件（编辑器名称/自定义字/滑杆等）时不劫持按键
        if (event.target.closest?.('input, textarea, select')) {
            return;
        }
        switch (event.key) {
            case 'd': case 'D': case 'ArrowRight':
                event.preventDefault();
                actions.move(0);
                break;
            case 's': case 'S': case 'ArrowDown':
                event.preventDefault();
                actions.move(1);
                break;
            case 'a': case 'A': case 'ArrowLeft':
                event.preventDefault();
                actions.move(2);
                break;
            case 'w': case 'W': case 'ArrowUp':
                event.preventDefault();
                actions.move(3);
                break;
            case 'Backspace':
                actions.undo();
                break;
            case 'r': case 'R':
                actions.clear();
                break;
            case 'Enter':
                event.preventDefault();
                actions.submit();
                break;
            case 'Tab':
                event.preventDefault();
                actions.changeMap();
                break;
            case 'Control':
                event.preventDefault();
                actions.showAnswer();
                break;
            case 'Shift':
                event.preventDefault();
                actions.hideAnswer();
                break;
            default:
                break;
        }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
}
