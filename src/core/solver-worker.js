"use strict";

import { analyzePuzzle } from './solver.js';

// 求解器 Worker：把 DFS/评级搬出主线程，避免大题卡住画面。
// 消息：{ id, puzzle: { size, sign, palette, blockedEdges }, timeBudgetMs }
// 回复：{ id, result } 或 { id, error }
self.onmessage = (event) => {
    const { id, puzzle, timeBudgetMs } = event.data ?? {};
    try {
        const result = analyzePuzzle(puzzle, { timeBudgetMs });
        self.postMessage({ id, result });
    } catch (error) {
        self.postMessage({ id, error: String(error?.message ?? error) });
    }
};
