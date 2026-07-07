"use strict";

import { load, remove, save } from '../lib/storage.js';
import { gpaValueForLevel } from './level.js';

export const MODE_CLASSIC = 'classic';
export const MODE_TIMED = 'timed';
export const MODE_CHALLENGE = 'challenge';

const CLASSIC_LEVEL_KEY = 'classicLevel';
const CLASSIC_STARTED_AT_KEY = 'classicStartedAt';
const CLASSIC_FINISHED_AT_KEY = 'classicFinishedAt';
const CLASSIC_PAUSED_MS_KEY = 'classicPausedMs';
const UNLOCKS_KEY = 'modeUnlocks';
const CHALLENGE_CONFIG_KEY = 'challengeConfig';
const TIMED_DURATION_KEY = 'timedDurationMinutes';
const LEGACY_LEVEL_KEY = 'level';

export const TIMED_MODE_OPTIONS = [10, 20, 30, 45];
// 挑战棋盘尺寸范围：上限由生成耗时实测确定（36×36 生成 ~4.4s，落在"加载约 5s"目标内）
export const MIN_CHALLENGE_SIZE = 4;
export const MAX_CHALLENGE_SIZE = 36;
export const CLASSIC_UNLOCKS = {
    timed: 3.0,
    challenge: 3.7,
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
            maxLetterCount: 1,
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
            maxLetterCount: 1,
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
            maxLetterCount: 2,
            allowDoubleLetters: true,
        },
    },
};

export const DEFAULT_CHALLENGE_CONFIG = {
    width: 10,
    height: 10,
    letters: true,
    colleges: true,
    pairs: true,
    roads: true,
    difficulty: 'standard',
};

function hasEnabledChallengeClues(config) {
    return config.letters || config.colleges || config.pairs || config.roads;
}

export function normalizeChallengeConfig(config = {}) {
    const normalized = {
        ...DEFAULT_CHALLENGE_CONFIG,
        ...config,
        width: Math.max(MIN_CHALLENGE_SIZE, Math.min(MAX_CHALLENGE_SIZE, Number(config.width) || DEFAULT_CHALLENGE_CONFIG.width)),
        height: Math.max(MIN_CHALLENGE_SIZE, Math.min(MAX_CHALLENGE_SIZE, Number(config.height) || DEFAULT_CHALLENGE_CONFIG.height)),
        letters: config.letters !== false,
        colleges: config.colleges !== false,
        pairs: config.pairs !== false,
        roads: config.roads !== false,
        difficulty: CHALLENGE_DIFFICULTIES[config.difficulty] ? config.difficulty : DEFAULT_CHALLENGE_CONFIG.difficulty,
    };
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
        challenge: Boolean(stored.challenge),
    };
}

export function saveUnlocks(unlocks) {
    save(UNLOCKS_KEY, unlocks);
}

export function resetUnlocks() {
    remove(UNLOCKS_KEY);
    return { timed: false, challenge: false };
}

export function unlocksForLevel(level) {
    const gpa = gpaValueForLevel(level);
    return {
        timed: gpa >= CLASSIC_UNLOCKS.timed,
        challenge: gpa >= CLASSIC_UNLOCKS.challenge,
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
        letterMode: config.letters ? 'force' : 'none',
        requireAllLetterFamilies: false,
        forceLetterCount: 1,
        collegesEnabled: config.colleges,
        pairsMode: config.pairs ? (config.difficulty === 'hard' ? 'dense' : 'normal') : 'off',
        roadsMode: config.roads ? (config.difficulty === 'hard' ? 'dense' : 'normal') : 'off',
    };
}

export function timedSession(minutes) {
    return {
        durationMinutes: minutes,
        startedAt: Date.now(),
        level: 0,
        cleared: 0,
        ended: false,
        finalCleared: null,
    };
}

export function challengeSession(config) {
    return {
        config,
        solved: 0,
    };
}
