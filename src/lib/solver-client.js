"use strict";

import { analyzePuzzle, ratePuzzle } from '../core/solver.js';

// 在 Worker 里跑求解/评级；环境没有 Worker 时退回主线程同步求解。
// 每次调用新建一个 Worker，结束即 terminate，超时也能干净收尾。
// task: 'analyze'（求解，rate=false 只判可解不评级）| 'rate'（难度评级）
function runInWorker(task, puzzle, { timeBudgetMs = 3000, rate = true } = {}) {
    const payload = {
        size: [...puzzle.size],
        sign: puzzle.sign,
        palette: puzzle.palette ?? [],
        blockedEdges: puzzle.blockedEdges ?? [],
    };
    const runLocal = () => (task === 'rate'
        ? ratePuzzle(payload, { timeBudgetMs })
        : analyzePuzzle(payload, { timeBudgetMs, rate }));
    if (typeof Worker !== 'function') {
        return Promise.resolve(runLocal());
    }
    return new Promise((resolve, reject) => {
        let worker;
        try {
            worker = new Worker(new URL('../core/solver-worker.js', import.meta.url), { type: 'module' });
        } catch {
            resolve(runLocal());
            return;
        }
        const id = Math.random().toString(36).slice(2);
        // Worker 内部按预算自行收尾；这里再兜底一层，防止 Worker 加载失败等情况挂死
        const guard = setTimeout(() => {
            worker.terminate();
            reject(new Error(task === 'rate' ? '评级超时' : '求解超时'));
        }, timeBudgetMs + 4000);
        worker.onmessage = (event) => {
            if (event.data?.id !== id) {
                return;
            }
            clearTimeout(guard);
            worker.terminate();
            if (event.data.error) {
                reject(new Error(event.data.error));
            } else {
                resolve(event.data.result);
            }
        };
        worker.onerror = (event) => {
            clearTimeout(guard);
            worker.terminate();
            reject(new Error(event?.message ?? 'Worker error'));
        };
        worker.postMessage({ id, task, puzzle: payload, timeBudgetMs, rate });
    });
}

// 求解（含可解性判定）。默认与历史行为一致：求解后顺手做难度评级；
// 传 { rate: false } 时只求解不评级（评级通常比求解贵两个数量级，建议拆开触发）。
export function analyzePuzzleAsync(puzzle, options = {}) {
    return runInWorker('analyze', puzzle, options);
}

// 难度评级：ratePuzzle 的 Worker 版（迭代加深求最短解，难度分 = lg 搜索空间）。
export function ratePuzzleAsync(puzzle, { timeBudgetMs = 8000 } = {}) {
    return runInWorker('rate', puzzle, { timeBudgetMs });
}
