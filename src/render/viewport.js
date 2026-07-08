"use strict";

// 题板视口：包住题板的固定区域，承载缩放/平移。
// 缩放不用 CSS transform scale（合成层会把 SVG 光栅化，放大后模糊/锯齿），
// 而是直接改 SVG 的 CSS 宽高 —— 带 viewBox 的 SVG 矢量重绘，任意倍率都清晰。
// 平移用 translate（1:1 光栅化，不糊）。
// zoom=1 时内容居中且无裁剪；zoom>1 时视口变成毛玻璃圆角卡片（CSS .zoomed）。
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const EDGE_KEEP = 60;   // 平移 clamp：至少保留这么多像素的板面在视口内
const TOP_GAP = 16;     // zoom=1 时板面距视口顶部的留白

export function createBoardViewport() {
    const viewport = document.createElement('div');
    viewport.id = 'board-viewport';
    const pan = document.createElement('div');
    pan.id = 'board-pan';
    viewport.appendChild(pan);
    document.body.appendChild(viewport);

    // tx/ty = 板面左上角在视口内的位置（px）
    const state = { zoom: 1, tx: 0, ty: 0 };

    function svgElement() {
        return pan.firstElementChild;
    }

    // BoardView.applyScale 把未缩放基准尺寸写进 dataset
    function baseSize() {
        const svg = svgElement();
        if (!svg) {
            return null;
        }
        const width = Number(svg.dataset.baseWidth);
        const height = Number(svg.dataset.baseHeight);
        return Number.isFinite(width) && width > 0 ? { width, height } : null;
    }

    function apply() {
        const svg = svgElement();
        const base = baseSize();
        if (svg && base) {
            svg.style.width = `${base.width * state.zoom}px`;
            svg.style.height = `${base.height * state.zoom}px`;
        }
        pan.style.transform = `translate(${state.tx}px, ${state.ty}px)`;
        viewport.classList.toggle('zoomed', state.zoom > 1.001);
    }

    function center() {
        const base = baseSize();
        if (!base) {
            return;
        }
        state.tx = (viewport.clientWidth - base.width) / 2;
        state.ty = TOP_GAP;
    }

    function clampPan() {
        const base = baseSize();
        if (!base) {
            return;
        }
        const contentWidth = base.width * state.zoom;
        const contentHeight = base.height * state.zoom;
        state.tx = Math.min(viewport.clientWidth - EDGE_KEEP, Math.max(EDGE_KEEP - contentWidth, state.tx));
        state.ty = Math.min(viewport.clientHeight - EDGE_KEEP, Math.max(EDGE_KEEP - contentHeight, state.ty));
    }

    function settle() {
        pan.classList.add('settle');
        setTimeout(() => pan.classList.remove('settle'), 260);
    }

    // 以屏幕锚点缩放：锚点处的内容在缩放前后保持不动
    function zoomAt(clientX, clientY, factor) {
        const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, state.zoom * factor));
        if (nextZoom === state.zoom) {
            return;
        }
        const origin = viewport.getBoundingClientRect();
        const ax = clientX - origin.left;
        const ay = clientY - origin.top;
        const ratio = nextZoom / state.zoom;
        state.tx = ax - ratio * (ax - state.tx);
        state.ty = ay - ratio * (ay - state.ty);
        state.zoom = nextZoom;
        if (state.zoom <= MIN_ZOOM + 0.001) {
            reset();
            return;
        }
        clampPan();
        apply();
    }

    function panBy(dx, dy) {
        if (state.zoom <= 1.001) {
            return;
        }
        state.tx += dx;
        state.ty += dy;
        clampPan();
        apply();
    }

    function reset({ animate = true } = {}) {
        state.zoom = 1;
        center();
        if (animate) {
            settle();
        }
        apply();
    }

    // 板面重建 / 窗口 resize 后：基准尺寸变了，重新落位
    function layout() {
        if (state.zoom <= 1.001) {
            center();
        } else {
            clampPan();
        }
        apply();
    }

    return {
        element: viewport,
        panElement: pan,
        zoomAt,
        panBy,
        reset,
        layout,
        get scale() {
            return state.zoom;
        },
    };
}
