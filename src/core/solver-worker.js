"use strict";

import { analyzePuzzle, ratePuzzle } from './solver.js';

// 求解器 Worker：把 DFS/评级搬出主线程，避免大题卡住画面。
// 消息：{ id, task: 'analyze'|'rate', puzzle: { size, sign, palette, blockedEdges },
//         timeBudgetMs, rate }
//   task='analyze'：求解（rate=false 时只判可解不评级）；task='rate'：难度评级
//   （ratePuzzle，迭代加深求最短解并统计搜索空间）。
// 回复：{ id, result } 或 { id, error }
self.onmessage = (event) => {
    const { id, task = 'analyze', puzzle, timeBudgetMs, rate = true } = event.data ?? {};
    try {
        const result = task === 'rate'
            ? ratePuzzle(puzzle, { timeBudgetMs })
            : analyzePuzzle(puzzle, { timeBudgetMs, rate });
        self.postMessage({ id, result });
    } catch (error) {
        self.postMessage({ id, error: String(error?.message ?? error) });
    }
};
