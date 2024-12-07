"use strict";

import * as Common from './common.js';
import * as Device from './device.js';

export const isMobileDevice = () => {
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
};

export function mobile() {
    if (!isMobileDevice()) {
        Common.remove('#mobileRule');
        Common.remove('#mobile');
        return;
    }

    Common.remove("#rule");
    Device.mobile();
}