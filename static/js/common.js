"use strict";

export function remove(selector) {
    var elements = document.querySelectorAll(selector);
    elements.forEach(function(element) {
        element.remove();
    });
}

export function setAttribute(element, attributes) {
    for (const attribute of attributes) {
        element.setAttribute(attribute[0], attribute[1]);
    }
}

export function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; --i) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

export function randomSet(n, max) {
    let set = new Set();
    while (set.size < n) {
        set.add(Math.floor(Math.random() * max));
    }
    return set;
}

export function random(max) {
    return Math.floor(Math.random() * max);
}

export function getThemeColors() {
    const hue = Math.floor(Math.random() * 360);
    const saturation = Math.floor(Math.random() * 10) + 20;

    const lightnessLight = Math.floor(Math.random() * 21) + 75;
    const lightnessDark = lightnessLight - Math.floor(Math.random() * 10 + 30);

    const lightColor = `hsl(${hue}, ${saturation}%, ${lightnessLight}%)`;
    const darkColor = `hsl(${hue}, ${saturation}%, ${lightnessDark}%)`;

    return { lightColor, darkColor };
}

export function simulateKey(key) {
    const event = new KeyboardEvent('keydown', {
      key: key,
      bubbles: true,
      cancelable: true
    });
    document.dispatchEvent(event);
}

export function compareCssLengths(value1, value2, baseElement = document.documentElement) {
    const tempDiv = document.createElement("div");

    baseElement.appendChild(tempDiv);

    tempDiv.style.width = value1;
    const width1 = tempDiv.offsetWidth;

    tempDiv.style.width = value2;
    const width2 = tempDiv.offsetWidth;

    baseElement.removeChild(tempDiv);

    return width1 / width2;
}