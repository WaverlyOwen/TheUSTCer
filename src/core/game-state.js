"use strict";

import { random } from '../lib/random.js';
import { load, remove, save } from '../lib/storage.js';
import { gpaValueForLevel } from './level.js';
import { validateRecord } from './puzzle-io.js';

export const MODE_CLASSIC = 'classic';
export const MODE_TIMED = 'timed';
export const MODE_CHALLENGE = 'challenge';
export const MODE_ENDLESS = 'endless';
// 题目工坊的临时游玩会话：不动正式模式的进度
export const MODE_CUSTOM = 'custom';

const CLASSIC_LEVEL_KEY = 'classicLevel';
const CLASSIC_PUZZLE_KEY = 'classicPuzzle';
const CLASSIC_STARTED_AT_KEY = 'classicStartedAt';
const CLASSIC_FINISHED_AT_KEY = 'classicFinishedAt';
const CLASSIC_PAUSED_MS_KEY = 'classicPausedMs';
const UNLOCKS_KEY = 'modeUnlocks';
const CHALLENGE_CONFIG_KEY = 'challengeConfig';
const TIMED_DURATION_KEY = 'timedDurationMinutes';
const LEGACY_LEVEL_KEY = 'level';

export const TIMED_MODE_OPTIONS = [10, 20, 30, 45];
export const TIMED_START_LEVEL = 20;
// 挑战棋盘尺寸范围：上限由生成耗时实测确定（36×36 生成 ~4.4s，落在"加载约 5s"目标内）
export const MIN_CHALLENGE_SIZE = 4;
export const MAX_CHALLENGE_SIZE = 36;
export const CLASSIC_UNLOCKS = {
    timed: 3.0,
    endless: 3.3,
    challenge: 3.7,
    // 题目创作（工坊里的新建/编辑）；收藏、游玩、分享不受此限制
    workshop: 4.0,
};

export const CHALLENGE_DIFFICULTIES = {
    easy: {
        label: '轻松',
        generation: {
            localCoverageWindow: 3,
            mutationWindow: 3,
            mutationPasses: 1,
            mutationMinTouches: 1,
            mutationMinimumCoverage: 0.28,
            difficultyValue: 0.35,
            maxBuildingCount: 2,
        },
    },
    standard: {
        label: '标准',
        generation: {
            localCoverageWindow: 3,
            mutationWindow: 2,
            mutationPasses: 2,
            mutationMinTouches: 2,
            mutationMinimumCoverage: 0.34,
            difficultyValue: 0.65,
            maxBuildingCount: 3,
        },
    },
    hard: {
        label: '高压',
        generation: {
            localCoverageWindow: 3,
            mutationWindow: 2,
            mutationPasses: 3,
            mutationMinTouches: 3,
            mutationMinimumCoverage: 0.42,
            difficultyValue: 0.95,
            maxBuildingCount: 5,
        },
    },
};

export const DEFAULT_CHALLENGE_CONFIG = {
    width: 10,
    height: 10,
    buildings: true,
    colleges: true,
    pairs: true,
    roads: true,
    difficulty: 'standard',
};

function hasEnabledChallengeClues(config) {
    return config.buildings || config.colleges || config.pairs || config.roads;
}

// 教学楼题需要放得下"楼 + 圈楼的链"：最小可行盘是 6 格（如 2×3）
export function challengeBuildingsSupported(config = {}) {
    const width = Number(config.width) || DEFAULT_CHALLENGE_CONFIG.width;
    const height = Number(config.height) || DEFAULT_CHALLENGE_CONFIG.height;
    return width * height >= 6 && Math.min(width, height) >= 2;
}

export function normalizeChallengeConfig(config = {}) {
    const normalized = {
        ...DEFAULT_CHALLENGE_CONFIG,
        ...config,
        width: Math.max(MIN_CHALLENGE_SIZE, Math.min(MAX_CHALLENGE_SIZE, Number(config.width) || DEFAULT_CHALLENGE_CONFIG.width)),
        height: Math.max(MIN_CHALLENGE_SIZE, Math.min(MAX_CHALLENGE_SIZE, Number(config.height) || DEFAULT_CHALLENGE_CONFIG.height)),
        // 旧存档字段 letters 迁移为 buildings
        buildings: (config.buildings ?? config.letters) !== false,
        colleges: config.colleges !== false,
        pairs: config.pairs !== false,
        roads: config.roads !== false,
        difficulty: CHALLENGE_DIFFICULTIES[config.difficulty] ? config.difficulty : DEFAULT_CHALLENGE_CONFIG.difficulty,
    };
    if (!challengeBuildingsSupported(normalized)) {
        normalized.buildings = false;
    }
    if (!hasEnabledChallengeClues(normalized)) {
        normalized.colleges = true;
    }
    return normalized;
}

export function formatDuration(ms, withHours = true) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (withHours || hours > 0) {
        return [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':');
    }
    return [minutes, seconds].map(value => String(value).padStart(2, '0')).join(':');
}

export function shouldBlockInteraction({
    transitionBusy = false,
    generating = false,
    currentMode = MODE_CLASSIC,
    timedEnded = false,
    endlessEnded = false,
    endingVisible = false,
} = {}) {
    return transitionBusy ||
        generating ||
        currentMode === MODE_CLASSIC && endingVisible ||
        currentMode === MODE_TIMED && timedEnded ||
        currentMode === MODE_ENDLESS && endlessEnded;
}

// 经典模式当前题面持久化：刷新页面恢复同一题，
// 防止用"刷新重开"绕过换题/看答案的扣关惩罚。
// 记录与 level 绑定：level 对不上（过关/降级后）视为过期。
export function loadClassicPuzzleRecord(level) {
    const stored = load(CLASSIC_PUZZLE_KEY, null);
    if (!stored || stored.level !== level || !validateRecord(stored.record)) {
        return null;
    }
    return stored.record;
}

export function saveClassicPuzzleRecord(level, record) {
    save(CLASSIC_PUZZLE_KEY, { level, record });
}

export function clearClassicPuzzleRecord() {
    remove(CLASSIC_PUZZLE_KEY);
}

export function loadClassicRun() {
    const level = load(CLASSIC_LEVEL_KEY, load(LEGACY_LEVEL_KEY, 0));
    const now = Date.now();
    const startedAt = load(CLASSIC_STARTED_AT_KEY, now);
    const finishedAt = load(CLASSIC_FINISHED_AT_KEY, null);
    const pausedMs = load(CLASSIC_PAUSED_MS_KEY, 0);
    if (!Number.isInteger(startedAt)) {
        save(CLASSIC_STARTED_AT_KEY, now);
    }
    return {
        level: Number.isInteger(level) && level >= 0 ? level : 0,
        startedAt: Number.isInteger(startedAt) ? startedAt : now,
        finishedAt: Number.isInteger(finishedAt) ? finishedAt : null,
        pausedMs: Number.isFinite(pausedMs) && pausedMs >= 0 ? pausedMs : 0,
    };
}

export function saveClassicRun(run) {
    save(CLASSIC_LEVEL_KEY, run.level);
    save(CLASSIC_STARTED_AT_KEY, run.startedAt);
    save(CLASSIC_PAUSED_MS_KEY, Math.round(run.pausedMs ?? 0));
    if (run.finishedAt === null) {
        remove(CLASSIC_FINISHED_AT_KEY);
    } else {
        save(CLASSIC_FINISHED_AT_KEY, run.finishedAt);
    }
}

export function resetClassicRun() {
    const run = {
        level: 0,
        startedAt: Date.now(),
        finishedAt: null,
        pausedMs: 0,
    };
    saveClassicRun(run);
    return run;
}

export function loadUnlocks() {
    const stored = load(UNLOCKS_KEY, {});
    return {
        timed: Boolean(stored.timed),
        endless: Boolean(stored.endless),
        challenge: Boolean(stored.challenge),
        workshop: Boolean(stored.workshop),
    };
}

export function saveUnlocks(unlocks) {
    save(UNLOCKS_KEY, unlocks);
}

export function resetUnlocks() {
    remove(UNLOCKS_KEY);
    return { timed: false, endless: false, challenge: false, workshop: false };
}

export function unlocksForLevel(level) {
    const gpa = gpaValueForLevel(level);
    return {
        timed: gpa >= CLASSIC_UNLOCKS.timed,
        endless: gpa >= CLASSIC_UNLOCKS.endless,
        challenge: gpa >= CLASSIC_UNLOCKS.challenge,
        workshop: gpa >= CLASSIC_UNLOCKS.workshop,
    };
}

export function loadChallengeConfig() {
    return normalizeChallengeConfig(load(CHALLENGE_CONFIG_KEY, DEFAULT_CHALLENGE_CONFIG));
}

export function saveChallengeConfig(config) {
    save(CHALLENGE_CONFIG_KEY, normalizeChallengeConfig(config));
}

export function loadTimedDuration() {
    const minutes = load(TIMED_DURATION_KEY, TIMED_MODE_OPTIONS[0]);
    return TIMED_MODE_OPTIONS.includes(minutes) ? minutes : TIMED_MODE_OPTIONS[0];
}

export function saveTimedDuration(minutes) {
    save(TIMED_DURATION_KEY, minutes);
}

export function challengeGenerationOptions(config) {
    const difficulty = CHALLENGE_DIFFICULTIES[config.difficulty] ?? CHALLENGE_DIFFICULTIES.standard;
    return {
        ...difficulty.generation,
        buildingMode: config.buildings && challengeBuildingsSupported(config) ? 'force' : 'none',
        requireAllBuildingFamilies: false,
        forceBuildingCount: 2,
        collegesEnabled: config.colleges,
        pairsMode: config.pairs ? (config.difficulty === 'hard' ? 'dense' : 'normal') : 'off',
        roadsMode: config.roads ? (config.difficulty === 'hard' ? 'dense' : 'normal') : 'off',
    };
}

export function timedSession(minutes) {
    return {
        durationMinutes: minutes,
        startedAt: Date.now(),
        level: TIMED_START_LEVEL,
        cleared: 0,
        ended: false,
        finalCleared: null,
    };
}

// ===== 无尽模式 =====
// 每题独立倒计时，超时即本轮结束。
// 爬坡期：3×3 起步，每 4 题长一号，到 16×16（第 53 题）后每题随机 8–16；
// 时限 = 12s + 0.9s/格（封顶 4 分钟），爬满后逐题 ×0.99 收紧，
// 但保底 0.45s/格 —— 训练有素的玩家理论上可以一直玩下去。

const ENDLESS_START_SIZE = 3;
const ENDLESS_MAX_SIZE = 16;
const ENDLESS_RANDOM_MIN = 8;
const ENDLESS_GROWTH_EVERY = 4;
// 爬坡结束的题号：3 + (q-1)/4 == 16 → q = 53
export const ENDLESS_RAMP_END =
    (ENDLESS_MAX_SIZE - ENDLESS_START_SIZE) * ENDLESS_GROWTH_EVERY + 1;
const ENDLESS_TIME_BASE_MS = 12_000;
const ENDLESS_TIME_PER_CELL_MS = 900;
const ENDLESS_TIME_CAP_MS = 240_000;
const ENDLESS_TIGHTEN_PER_QUESTION = 0.99;
const ENDLESS_FLOOR_PER_CELL_MS = 450;
const ENDLESS_BEST_KEY = 'endlessBest';

// 第 question 题（1 起）的棋盘尺寸；随机段的两维独立取 [8,16]
export function endlessSizeForQuestion(question, randomInt = random) {
    if (question < ENDLESS_RAMP_END) {
        const side = ENDLESS_START_SIZE + Math.floor((question - 1) / ENDLESS_GROWTH_EVERY);
        return [side, side];
    }
    const span = ENDLESS_MAX_SIZE - ENDLESS_RANDOM_MIN + 1;
    return [
        ENDLESS_RANDOM_MIN + randomInt(span),
        ENDLESS_RANDOM_MIN + randomInt(span),
    ];
}

// 第 question 题的时限（毫秒）：基础时限 × 收紧系数，夹在保底与封顶之间
export function endlessTimeForQuestion(question, size) {
    const cells = size[0] * size[1];
    const base = Math.min(ENDLESS_TIME_CAP_MS, ENDLESS_TIME_BASE_MS + ENDLESS_TIME_PER_CELL_MS * cells);
    const tightening = question > ENDLESS_RAMP_END
        ? ENDLESS_TIGHTEN_PER_QUESTION ** (question - ENDLESS_RAMP_END)
        : 1;
    return Math.max(ENDLESS_FLOOR_PER_CELL_MS * cells, Math.round(base * tightening));
}

// 无尽模式的出题难度参数沿用经典曲线：按棋盘边长折算一个等效关卡
export function endlessLevelForSize(size) {
    return Math.max(0, (Math.min(size[0], size[1]) - 1) * 10);
}

export function endlessSession() {
    return {
        question: 1,       // 当前第几题（1 起）
        cleared: 0,
        size: endlessSizeForQuestion(1),
        deadline: null,    // 当前题的截止时间戳，题面挂载后由 main 设置
        ended: false,
    };
}

export function loadEndlessBest() {
    const best = load(ENDLESS_BEST_KEY, 0);
    return Number.isInteger(best) && best >= 0 ? best : 0;
}

export function saveEndlessBest(cleared) {
    if (cleared > loadEndlessBest()) {
        save(ENDLESS_BEST_KEY, cleared);
        return true;
    }
    return false;
}

export function challengeSession(config) {
    return {
        config,
        solved: 0,
    };
}
