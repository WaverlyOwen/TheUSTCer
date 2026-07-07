"use strict";

// GPA 4.30 结局：暗场 → GPA 滚动定格金色 → 烟花 + 科大梗弹幕 → 4.3 大佬认证证书

const DANMAKU_TEXTS = [
    '膜拜 4.3 大佬！！！',
    '求带 orz',
    '科里科气',
    '这就是别人家的孩子',
    '郭沫若奖学金预定',
    '大佬求学习方法',
    '什么叫随便学学啊（战术后仰）',
    '已经开始仰望并成为习惯',
    '瀚海星云为你刷屏',
    '红专并进，理实交融',
    '前方高能：满绩大佬出没',
    '大佬带我毕业',
    '这条弹幕跪着发的',
    '课都没上过是吧（酸）',
    '建议直接保送',
    '4.3？那可是 4.3 啊！',
    '爷青结：终于有人满绩了',
];

const GOLD_TEXTS = new Set(['膜拜 4.3 大佬！！！', '4.3？那可是 4.3 啊！']);

function createFireworks(canvas) {
    const ctx = canvas.getContext('2d');
    const rockets = [];
    const sparks = [];
    let frame = null;
    let lastLaunch = 0;

    function resize() {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
    }
    resize();

    function launch() {
        rockets.push({
            x: canvas.width * (0.15 + Math.random() * 0.7),
            y: canvas.height,
            vy: -(canvas.height * 0.012 + Math.random() * canvas.height * 0.006),
            hue: Math.floor(Math.random() * 360),
            targetY: canvas.height * (0.15 + Math.random() * 0.35),
        });
    }

    function explode(rocket) {
        const count = 50 + Math.floor(Math.random() * 30);
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count + Math.random() * 0.2;
            const speed = (1 + Math.random() * 3) * (canvas.height / 800);
            sparks.push({
                x: rocket.x,
                y: rocket.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                hue: rocket.hue + Math.floor(Math.random() * 40) - 20,
            });
        }
    }

    function tick(time) {
        frame = requestAnimationFrame(tick);
        if (time - lastLaunch > 650) {
            lastLaunch = time;
            launch();
        }

        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'lighter';

        for (let i = rockets.length - 1; i >= 0; i--) {
            const rocket = rockets[i];
            rocket.y += rocket.vy;
            ctx.fillStyle = `hsl(${rocket.hue}, 90%, 70%)`;
            ctx.fillRect(rocket.x - 1.5, rocket.y, 3, 8);
            if (rocket.y <= rocket.targetY) {
                explode(rocket);
                rockets.splice(i, 1);
            }
        }

        for (let i = sparks.length - 1; i >= 0; i--) {
            const spark = sparks[i];
            spark.x += spark.vx;
            spark.y += spark.vy;
            spark.vy += 0.03;
            spark.vx *= 0.985;
            spark.vy *= 0.985;
            spark.life -= 0.012;
            if (spark.life <= 0) {
                sparks.splice(i, 1);
                continue;
            }
            ctx.globalAlpha = spark.life;
            ctx.fillStyle = `hsl(${spark.hue}, 90%, ${50 + spark.life * 20}%)`;
            ctx.beginPath();
            ctx.arc(spark.x, spark.y, 2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    frame = requestAnimationFrame(tick);
    window.addEventListener('resize', resize);
    return () => {
        cancelAnimationFrame(frame);
        window.removeEventListener('resize', resize);
    };
}

export function playEnding() {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const overlay = document.createElement('div');
    overlay.id = 'ending-overlay';
    overlay.innerHTML = `
        <canvas class="ending-fireworks"></canvas>
        <div class="ending-danmaku"></div>
        <div class="ending-gpa">GPA 1.00</div>
        <div class="ending-skip">点击任意处跳过</div>
        <div class="ending-certificate">
            <div class="certificate-badge">🏆</div>
            <div class="certificate-title">4.3 大佬认证</div>
            <div class="certificate-body">
                兹证明 这位USTCer<br>
                在瀚海星云的注视下修得传说级绩点<br>
                <span class="certificate-gpa">GPA 4.30</span>
            </div>
            <div class="certificate-motto">红专并进 · 理实交融</div>
            <div class="certificate-footnote">
                郭沫若奖学金已向你飞来<br>
                （本证书在保研面试中不具有法律效力）
            </div>
            <div class="certificate-date">The USTCer · ${new Date().toLocaleDateString('zh-CN')}</div>
            <div class="certificate-buttons">
                <button class="ending-continue">继续修行</button>
                <button class="ending-replay">再看一次</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const gpaElement = overlay.querySelector('.ending-gpa');
    const certificate = overlay.querySelector('.ending-certificate');
    const skipHint = overlay.querySelector('.ending-skip');
    const danmakuLayer = overlay.querySelector('.ending-danmaku');

    const timers = [];
    let stopFireworks = null;
    let danmakuInterval = null;
    let counterFrame = null;
    let certificateShown = false;

    requestAnimationFrame(() => overlay.classList.add('active'));

    function countUp() {
        const duration = 1600;
        const start = performance.now();
        function update(now) {
            const progress = Math.min(1, (now - start) / duration);
            const eased = 1 - (1 - progress) ** 3;
            const gpa = 1 + 3.3 * eased;
            gpaElement.textContent = `GPA ${gpa.toFixed(2)}`;
            if (progress < 1) {
                counterFrame = requestAnimationFrame(update);
            } else {
                gpaElement.textContent = 'GPA 4.30';
                gpaElement.classList.add('gold');
            }
        }
        counterFrame = requestAnimationFrame(update);
    }

    function spawnDanmaku() {
        const text = DANMAKU_TEXTS[Math.floor(Math.random() * DANMAKU_TEXTS.length)];
        const item = document.createElement('span');
        item.className = 'danmaku-item';
        if (GOLD_TEXTS.has(text)) {
            item.classList.add('gold');
        }
        item.textContent = text;
        item.style.top = `${5 + Math.random() * 72}%`;
        item.style.animationDuration = `${5 + Math.random() * 4}s`;
        item.style.fontSize = `${Math.min(2.2 + Math.random() * 1.6, 3.4)}vh`;
        item.addEventListener('animationend', () => item.remove());
        danmakuLayer.appendChild(item);
    }

    function showCertificate() {
        if (certificateShown) {
            return;
        }
        certificateShown = true;
        skipHint.remove();
        gpaElement.classList.add('lifted');
        certificate.classList.add('show');
    }

    function cleanup() {
        stopFireworks?.();
        clearInterval(danmakuInterval);
        cancelAnimationFrame(counterFrame);
        for (const timer of timers) {
            clearTimeout(timer);
        }
        overlay.classList.remove('active');
        setTimeout(() => overlay.remove(), 450);
    }

    if (reducedMotion) {
        gpaElement.textContent = 'GPA 4.30';
        gpaElement.classList.add('gold');
        showCertificate();
    } else {
        countUp();
        timers.push(setTimeout(() => {
            stopFireworks = createFireworks(overlay.querySelector('.ending-fireworks'));
            danmakuInterval = setInterval(spawnDanmaku, 320);
        }, 1200));
        timers.push(setTimeout(showCertificate, 7000));

        overlay.addEventListener('pointerdown', (event) => {
            if (!certificateShown && !event.target.closest('.ending-certificate')) {
                showCertificate();
            }
        });
    }

    overlay.querySelector('.ending-continue').addEventListener('click', cleanup);
    overlay.querySelector('.ending-replay').addEventListener('click', () => {
        cleanup();
        setTimeout(playEnding, 500);
    });
}

// GPA 显示区旁的 🎆 重播按钮，达成过 4.30 后常驻
export function showReplayButton() {
    if (document.getElementById('ending-replay-button')) {
        return;
    }
    const button = document.createElement('button');
    button.id = 'ending-replay-button';
    button.title = '重温 4.3 时刻';
    button.textContent = '🎆';
    button.addEventListener('click', () => playEnding());
    document.body.appendChild(button);
}

export function playMilestoneCelebration({
    title,
    subtitle,
    detail = '',
    accent = 'gold',
    primaryLabel = '继续',
}) {
    return new Promise((resolve) => {
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const overlay = document.createElement('div');
        overlay.className = 'milestone-overlay';
        overlay.innerHTML = `
            <canvas class="ending-fireworks"></canvas>
            <div class="milestone-panel ${accent}">
                <div class="milestone-kicker">里程碑达成</div>
                <div class="milestone-title">${title}</div>
                <div class="milestone-subtitle">${subtitle}</div>
                ${detail ? `<div class="milestone-detail">${detail}</div>` : ''}
                <button type="button" class="milestone-button">${primaryLabel}</button>
            </div>
        `;
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('active'));

        let stopFireworks = null;
        if (!reducedMotion) {
            stopFireworks = createFireworks(overlay.querySelector('.ending-fireworks'));
        }

        let done = false;
        function close() {
            if (done) {
                return;
            }
            done = true;
            stopFireworks?.();
            overlay.classList.remove('active');
            setTimeout(() => {
                overlay.remove();
                resolve();
            }, 320);
        }

        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) {
                close();
            }
        });
        overlay.querySelector('.milestone-button').addEventListener('click', close);
    });
}
