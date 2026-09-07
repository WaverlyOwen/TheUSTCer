"use strict";

import { analyzePuzzle } from '../core/solver.js';

// 在 Worker 里跑求解器；环境没有 Worker 时退回主线程同步求解。
// 每次调用新建一个 Worker，结束即 terminate，超时也能干净收尾。
export function analyzePuzzleAsync(puzzle, { timeBudgetMs = 3000 } = {}) {
    const payload = {
        size: [...puzzle.size],
        sign: puzzle.sign,
        palette: puzzle.palette ?? [],
        blockedEdges: puzzle.blockedEdges ?? [],
    };
    if (typeof Worker !== 'function') {
        return Promise.resolve(analyzePuzzle(payload, { timeBudgetMs }));
    }
    return new Promise((resolve, reject) => {
        let worker;
        try {
            worker = new Worker(new URL('../core/solver-worker.js', import.meta.url), { type: 'module' });
        } catch {
            resolve(analyzePuzzle(payload, { timeBudgetMs }));
            return;
        }
        const id = Math.random().toString(36).slice(2);
        // Worker 内部按预算自行收尾；这里再兜底一层，防止 Worker 加载失败等情况挂死
        const guard = setTimeout(() => {
            worker.terminate();
            reject(new Error('求解超时'));
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
        worker.postMessage({ id, puzzle: payload, timeBudgetMs });
    });
}
