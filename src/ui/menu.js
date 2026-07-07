"use strict";

import { isMobileDevice } from '../input/touch.js';
import menuSlidesHtml from './menu-slides.html?raw';

const MENU_CLOSE_MS = 500;

// 规则卡片牌堆：拖动最上面一张甩到底部
function control(slider) {
    const sliders = slider.children;

    let initX = null;
    let transX = 0;
    let transY = 0;
    let rotZ = 0;
    let curSlide = null;
    let prevSlide = null;

    const Z_DIS = 50;
    const Y_DIS = 10;
    const TRANS_DUR = 0.4;
    const FULL_OPAQUE_COUNT = 2;
    const FADE_LAYER_COUNT = 3;

    function opacityForDepth(depth) {
        if (depth < FULL_OPAQUE_COUNT) {
            return 1;
        }
        if (depth >= FULL_OPAQUE_COUNT + FADE_LAYER_COUNT) {
            return 0;
        }
        const fadeIndex = depth - FULL_OPAQUE_COUNT + 1;
        return 1 - fadeIndex / (FADE_LAYER_COUNT + 1);
    }

    function setSlideOpacity(slide, depth) {
        slide.style.opacity = `${opacityForDepth(depth)}`;
    }

    function init() {
        let z = 0;
        let y = 0;
        let depth = 0;
        for (let i = sliders.length - 1; i >= 0; i--) {
            sliders[i].style.transform = `translateZ(${z}px) translateY(${y}px)`;
            setSlideOpacity(sliders[i], depth);
            z -= Z_DIS;
            y += Y_DIS;
            depth++;
        }
        attachEvents(sliders[sliders.length - 1]);
    }

    function attachEvents(elem) {
        curSlide = elem;
        curSlide.addEventListener('mousedown', slideMouseDown, false);
        curSlide.addEventListener('touchstart', slideMouseDown, false);
    }

    init();

    function slideMouseDown(e) {
        initX = e.touches ? e.touches[0].clientX : e.pageX;

        document.addEventListener('mousemove', slideMouseMove, false);
        document.addEventListener('touchmove', slideMouseMove, false);
        document.addEventListener('mouseup', slideMouseUp, false);
        document.addEventListener('touchend', slideMouseUp, false);
    }

    function slideMouseMove(e) {
        const mouseX = e.touches ? e.touches[0].clientX : e.pageX;

        transX += mouseX - initX;
        rotZ = transX / 20;
        transY = -Math.abs(transX / 15);

        curSlide.style.transition = 'none';
        curSlide.style.transform = `translateX(${transX}px) rotateZ(${rotZ}deg) translateY(${transY}px)`;
        setSlideOpacity(curSlide, 0);

        let j = 1;
        for (let i = sliders.length - 2; i >= 0; i--) {
            sliders[i].style.transition = 'none';
            sliders[i].style.transform =
                `translateX(${transX / (2 * j)}px) rotateZ(${rotZ / (2 * j)}deg)` +
                ` translateY(${Y_DIS * j}px) translateZ(${-Z_DIS * j}px)`;
            setSlideOpacity(sliders[i], j);
            j++;
        }

        initX = mouseX;

        if (Math.abs(transX) >= curSlide.offsetWidth - (window.innerWidth < 500 ? 150 : 30)) {
            document.removeEventListener('mousemove', slideMouseMove, false);
            document.removeEventListener('touchmove', slideMouseMove, false);
            curSlide.style.transition = 'ease 0.2s';
            curSlide.style.opacity = 0;
            prevSlide = curSlide;
            attachEvents(sliders[sliders.length - 2]);
            slideMouseUp();
            setTimeout(() => {
                slider.insertBefore(prevSlide, slider.firstChild);
                prevSlide.style.transition = 'none';
                slideMouseUp();
            }, 201);
        }
    }

    function slideMouseUp() {
        transX = 0;
        rotZ = 0;
        transY = 0;

        curSlide.style.transition = `cubic-bezier(0,1.95,.49,.73) ${TRANS_DUR}s`;
        curSlide.style.transform = 'translateX(0px) rotateZ(0deg) translateY(0px)';
        setSlideOpacity(curSlide, 0);

        let j = 1;
        for (let i = sliders.length - 2; i >= 0; i--) {
            sliders[i].style.transition = `cubic-bezier(0,1.95,.49,.73) ${TRANS_DUR / (j + 0.9)}s`;
            sliders[i].style.transform =
                `translateX(0px) rotateZ(0deg) translateY(${Y_DIS * j}px) translateZ(${-Z_DIS * j}px)`;
            setSlideOpacity(sliders[i], j);
            j++;
        }

        document.removeEventListener('mousemove', slideMouseMove, false);
        document.removeEventListener('touchmove', slideMouseMove, false);
        document.removeEventListener('mouseup', slideMouseUp, false);
        document.removeEventListener('touchend', slideMouseUp, false);
    }
}

// 帮助按钮开关规则菜单；打开时暂停移动端滑动画线，点击菜单外区域关闭
export function setupMenu(button, swipeDetector, callbacks = {}) {
    let open = false;
    let closing = false;
    let closeTimer = null;
    const pressEvent = isMobileDevice() ? 'touchstart' : 'mousedown';

    function handleOut(event) {
        const slider = document.querySelector('.slider');
        if (!slider) {
            return;
        }
        const rect = slider.getBoundingClientRect();
        const point = event.touches ? event.touches[0] : event;

        if (point.clientX < rect.left || point.clientX > rect.right ||
            point.clientY < rect.top || point.clientY > rect.bottom) {
            close();
        }
    }

    function close() {
        if (!open || closing) {
            return;
        }
        closing = true;

        const slider = document.querySelector('.slider');
        const overlay = document.getElementById('dark-overlay');
        slider?.classList.remove('fade-in');
        slider?.classList.add('fade-out');

        if (overlay) {
            overlay.classList.remove('active');
        }

        open = false;
        document.removeEventListener(pressEvent, handleOut);
        clearTimeout(closeTimer);
        closeTimer = setTimeout(() => {
            closeTimer = null;
            closing = false;
            swipeDetector?.addEventListener();
            callbacks.onClose?.();
            slider?.remove();
            overlay?.remove();
        }, MENU_CLOSE_MS);
    }

    function show() {
        if (open || closing) {
            return;
        }
        swipeDetector?.removeEventListener();
        callbacks.onOpen?.();

        let overlay = document.getElementById('dark-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'dark-overlay';
            document.body.appendChild(overlay);
        }
        requestAnimationFrame(() => {
            overlay.classList.add('active');
        });

        const slider = document.createElement('div');
        slider.classList.add('slider', 'fade-in');
        slider.innerHTML = menuSlidesHtml;
        slider.querySelectorAll('.slide').forEach((slide) => {
            const text = slide.textContent?.replace(/\s+/g, ' ').trim() ?? '';
            if (text.includes('指定字母')) {
                slide.remove();
            }
        });
        document.body.appendChild(slider);
        control(slider);

        document.addEventListener(pressEvent, handleOut);
        open = true;
    }

    button.addEventListener(pressEvent, (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (open) {
            close();
        } else {
            show();
        }
    });
}
