"use strict";

import { isDark, onThemeChange } from '../lib/theme.js';

// 背景粒子网络动画（原 static/js/background.js，移除 jQuery 依赖）

function paletteForTheme() {
    return isDark()
        ? { netLineColor: '#20242d', particleColors: ['#333a47'] }
        : { netLineColor: '#e8e8e8', particleColors: ['#d9d9d9'] };
}

function getLimitedRandom(min, max) {
    return Math.random() * (max - min) + min;
}

function returnRandomArrayitem(array) {
    return array[Math.floor(Math.random() * array.length)];
}

class Particle {
    constructor(parent, x, y) {
        this.network = parent;
        this.canvas = parent.canvas;
        this.ctx = parent.ctx;
        this.particleColor = returnRandomArrayitem(parent.options.particleColors);
        this.radius = getLimitedRandom(1.5, 2.5);
        this.opacity = 0;
        this.x = x || Math.random() * this.canvas.width;
        this.y = y || Math.random() * this.canvas.height;
        this.velocity = {
            x: (Math.random() - 0.5) * parent.options.velocity,
            y: (Math.random() - 0.5) * parent.options.velocity,
        };
    }

    update() {
        this.opacity = Math.min(1, this.opacity + 0.01);
        if (this.x > this.canvas.width + 100 || this.x < -100) {
            this.velocity.x = -this.velocity.x;
        }
        if (this.y > this.canvas.height + 100 || this.y < -100) {
            this.velocity.y = -this.velocity.y;
        }
        this.x += this.velocity.x;
        this.y += this.velocity.y;
    }

    draw() {
        this.ctx.beginPath();
        this.ctx.fillStyle = this.particleColor;
        this.ctx.globalAlpha = this.opacity;
        this.ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
        this.ctx.fill();
    }
}

class ParticleNetwork {
    constructor(canvas) {
        this.options = {
            velocity: 0.5,
            density: 10000,
            netLineDistance: 150,
            ...paletteForTheme(),
        };
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.createParticles(true);
        this.animationFrame = requestAnimationFrame(this.update.bind(this));
        this.bindUiActions();
        // 深浅色切换时线条/粒子颜色跟随（画布逐帧重绘，改 options 即生效）
        onThemeChange(() => {
            Object.assign(this.options, paletteForTheme());
            for (const particle of this.particles) {
                particle.particleColor = this.options.particleColors[0];
            }
        });
    }

    createParticles(isInitial) {
        this.particles = [];
        const quantity = this.canvas.width * this.canvas.height / this.options.density;

        if (isInitial) {
            let counter = 0;
            clearInterval(this.createIntervalId);
            this.createIntervalId = setInterval(() => {
                if (counter < quantity - 1) {
                    this.particles.push(new Particle(this));
                } else {
                    clearInterval(this.createIntervalId);
                }
                counter++;
            }, 250);
        } else {
            for (let i = 0; i < quantity; i++) {
                this.particles.push(new Particle(this));
            }
        }
    }

    createInteractionParticle() {
        this.interactionParticle = new Particle(this);
        this.interactionParticle.velocity = { x: 0, y: 0 };
        this.particles.push(this.interactionParticle);
        return this.interactionParticle;
    }

    removeInteractionParticle() {
        const index = this.particles.indexOf(this.interactionParticle);
        if (index > -1) {
            this.interactionParticle = undefined;
            this.particles.splice(index, 1);
        }
    }

    update() {
        if (!this.canvas) {
            cancelAnimationFrame(this.animationFrame);
            return;
        }
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.globalAlpha = 1;

        for (let i = 0; i < this.particles.length; i++) {
            for (let j = this.particles.length - 1; j > i; j--) {
                const p1 = this.particles[i];
                const p2 = this.particles[j];

                // 先用便宜的轴距粗筛，再精确算距离
                let distance = Math.min(Math.abs(p1.x - p2.x), Math.abs(p1.y - p2.y));
                if (distance > this.options.netLineDistance) {
                    continue;
                }
                distance = Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
                if (distance > this.options.netLineDistance) {
                    continue;
                }

                this.ctx.beginPath();
                this.ctx.strokeStyle = this.options.netLineColor;
                this.ctx.globalAlpha =
                    (this.options.netLineDistance - distance) / this.options.netLineDistance *
                    p1.opacity * p2.opacity;
                this.ctx.lineWidth = 0.7;
                this.ctx.moveTo(p1.x, p1.y);
                this.ctx.lineTo(p2.x, p2.y);
                this.ctx.stroke();
            }
        }

        for (const particle of this.particles) {
            particle.update();
            particle.draw();
        }

        if (this.options.velocity !== 0) {
            this.animationFrame = requestAnimationFrame(this.update.bind(this));
        }
    }

    bindUiActions() {
        this.spawnQuantity = 3;
        this.mouseIsDown = false;
        this.touchIsMoving = false;

        this.onMouseMove = (e) => {
            if (!this.interactionParticle) {
                this.createInteractionParticle();
            }
            this.interactionParticle.x = e.offsetX;
            this.interactionParticle.y = e.offsetY;
        };

        this.onTouchMove = (e) => {
            e.preventDefault();
            this.touchIsMoving = true;
            if (!this.interactionParticle) {
                this.createInteractionParticle();
            }
            this.interactionParticle.x = e.changedTouches[0].clientX;
            this.interactionParticle.y = e.changedTouches[0].clientY;
        };

        this.onMouseDown = () => {
            this.mouseIsDown = true;
            let counter = 0;
            let quantity = this.spawnQuantity;
            const intervalId = setInterval(() => {
                if (this.mouseIsDown) {
                    if (counter === 1) {
                        quantity = 1;
                    }
                    for (let i = 0; i < quantity; i++) {
                        if (this.interactionParticle) {
                            this.particles.push(
                                new Particle(this, this.interactionParticle.x, this.interactionParticle.y));
                        }
                    }
                } else {
                    clearInterval(intervalId);
                }
                counter++;
            }, 50);
        };

        this.onTouchStart = (e) => {
            e.preventDefault();
            setTimeout(() => {
                if (!this.touchIsMoving) {
                    for (let i = 0; i < this.spawnQuantity; i++) {
                        this.particles.push(
                            new Particle(this, e.changedTouches[0].clientX, e.changedTouches[0].clientY));
                    }
                }
            }, 200);
        };

        this.onMouseUp = () => {
            this.mouseIsDown = false;
        };

        this.onMouseOut = () => {
            this.removeInteractionParticle();
        };

        this.onTouchEnd = (e) => {
            e.preventDefault();
            this.touchIsMoving = false;
            this.removeInteractionParticle();
        };

        this.canvas.addEventListener('mousemove', this.onMouseMove);
        this.canvas.addEventListener('touchmove', this.onTouchMove);
        this.canvas.addEventListener('mousedown', this.onMouseDown);
        this.canvas.addEventListener('touchstart', this.onTouchStart);
        this.canvas.addEventListener('mouseup', this.onMouseUp);
        this.canvas.addEventListener('mouseout', this.onMouseOut);
        this.canvas.addEventListener('touchend', this.onTouchEnd);
    }
}

export function initBackground(container) {
    const canvas = document.createElement('canvas');

    function sizeCanvas() {
        canvas.width = container.offsetWidth;
        canvas.height = container.offsetHeight;
    }

    sizeCanvas();
    container.appendChild(canvas);
    const network = new ParticleNetwork(canvas);

    function refit() {
        if (canvas.width === container.offsetWidth &&
            canvas.height === container.offsetHeight) {
            return;
        }
        network.ctx.clearRect(0, 0, canvas.width, canvas.height);
        sizeCanvas();
        network.createParticles();
    }

    // ResizeObserver 直接盯容器：macOS 全屏切换等场景不一定派发 window resize，
    // 或派发时布局尚未到位，只靠 resize 事件会留下没铺满的暗条带
    if (typeof ResizeObserver === 'function') {
        new ResizeObserver(refit).observe(container);
    } else {
        window.addEventListener('resize', refit);
    }
}
