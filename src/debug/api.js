"use strict";

import { LETTER_NAMES, compatiblePlacements, placementsByLetter } from '../core/letters.js';

const LETTER_SET = new Set(LETTER_NAMES);
const MAX_SEEK_ATTEMPTS = 400;

function availableLettersForSize(size) {
    return placementsByLetter(size)
        .flatMap((placements, index) => placements.length ? LETTER_NAMES[index] : []);
}

function compatibleLetterRequest(size, wanted) {
    const byLetter = placementsByLetter(size);
    const indexes = wanted.map(letter => LETTER_NAMES.indexOf(letter));
    if (indexes.length === 1) {
        return byLetter[indexes[0]].length > 0;
    }
    for (const first of byLetter[indexes[0]]) {
        for (const second of byLetter[indexes[1]]) {
            if (compatiblePlacements(first, second)) {
                return true;
            }
        }
    }
    return false;
}

function normalizeLetters(input) {
    const raw = Array.isArray(input) ? input : [input];
    if (!raw.length || raw.length > 2) {
        throw new Error('Pass one letter or two different letters.');
    }
    const normalized = raw.map(letter => String(letter).trim().toUpperCase());
    if (new Set(normalized).size !== normalized.length) {
        throw new Error('Letters must be unique.');
    }
    for (const letter of normalized) {
        if (!LETTER_SET.has(letter)) {
            throw new Error(`Unknown letter: ${letter}`);
        }
    }
    return normalized;
}

function summarizeLetters(puzzle) {
    return puzzle.letters.map(({ letterIndex, markerCell }) => ({
        letter: LETTER_NAMES[letterIndex],
        markerCell: [...markerCell],
    }));
}

export function attachDebugGlobals(target, debugApi, isDev) {
    if (!isDev) {
        return false;
    }
    target.__ustcerDebug = debugApi;
    return true;
}

export function createDebugApi({
    level,
    actions,
    getPuzzle,
    getUserPath,
    getBusy,
    reloadBoard,
    syncUserLine,
    showAnswer,
    hideAnswer,
    playEnding,
    resetProgress,
}) {
    function assertIdle() {
        if (getBusy()) {
            throw new Error('Game is busy. Wait for the current transition to finish.');
        }
    }

    async function rerollBoard() {
        await Promise.resolve(reloadBoard({ fresh: true, prefetch: false }));
    }

    function state() {
        const puzzle = getPuzzle();
        const userPath = getUserPath();
        const size = puzzle?.size ?? level.size();
        return {
            level: level.value,
            size: [...size],
            availableLetters: availableLettersForSize(size),
            letters: puzzle ? summarizeLetters(puzzle) : [],
            pathLength: userPath?.distance ?? 0,
            finished: userPath?.finished ?? false,
        };
    }

    async function reload() {
        assertIdle();
        hideAnswer();
        await rerollBoard();
        return state();
    }

    async function setLevelValue(nextLevel) {
        if (!Number.isInteger(nextLevel) || nextLevel < 0) {
            throw new Error('Level must be a non-negative integer.');
        }
        assertIdle();
        hideAnswer();
        level.set(nextLevel);
        await rerollBoard();
        return state();
    }

    function solve() {
        assertIdle();
        hideAnswer();
        const puzzle = getPuzzle();
        const userPath = getUserPath();
        userPath.clear();
        for (const move of puzzle.answer.queue) {
            if (!userPath.step(move)) {
                throw new Error('Failed to apply the cached solution path.');
            }
        }
        syncUserLine();
        actions.submit();
        return {
            submitted: true,
            solutionLength: puzzle.answer.queue.length,
        };
    }

    async function seekLetters(input) {
        assertIdle();
        hideAnswer();
        const wanted = normalizeLetters(input);
        const available = new Set(availableLettersForSize(level.size()));
        for (const letter of wanted) {
            if (!available.has(letter)) {
                throw new Error(`Letter ${letter} is not available at level ${level.value}.`);
            }
        }
        if (!compatibleLetterRequest(level.size(), wanted)) {
            throw new Error(`Letters ${wanted.join(', ')} do not share a valid layout at level ${level.value}. Try a larger board.`);
        }

        const matches = () => {
            const nextPuzzle = getPuzzle();
            if (!nextPuzzle) {
                return false;
            }
            const present = new Set(summarizeLetters(nextPuzzle).map(entry => entry.letter));
            return wanted.every(letter => present.has(letter));
        };

        let attempts = 0;
        while (!matches() && attempts < MAX_SEEK_ATTEMPTS) {
            await rerollBoard();
            attempts++;
        }
        if (!matches()) {
            throw new Error(`Could not find letters ${wanted.join(', ')} after ${MAX_SEEK_ATTEMPTS} rerolls.`);
        }

        return {
            attempts,
            ...state(),
        };
    }

    function help() {
        const lines = [
            'window.__ustcerDebug.state()',
            'await window.__ustcerDebug.setLevel(60)',
            'await window.__ustcerDebug.setLevel(85)',
            'await window.__ustcerDebug.reload()',
            'window.__ustcerDebug.solve()',
            'window.__ustcerDebug.showAnswer() / hideAnswer()',
            "await window.__ustcerDebug.seekLetter('S')",
            "await window.__ustcerDebug.seekLetters(['U', 'C'])",
            'window.__ustcerDebug.playEnding()',
            'await window.__ustcerDebug.resetProgress()',
        ];
        console.info(lines.join('\n'));
        return lines;
    }

    return {
        help,
        state,
        setLevel: setLevelValue,
        reload,
        solve,
        showAnswer() {
            assertIdle();
            showAnswer();
            return state();
        },
        hideAnswer() {
            hideAnswer();
            return state();
        },
        seekLetter(letter) {
            return seekLetters([letter]);
        },
        seekLetters,
        playEnding() {
            playEnding();
            return { playing: true };
        },
        async resetProgress() {
            assertIdle();
            hideAnswer();
            resetProgress();
            level.set(0);
            await rerollBoard();
            return state();
        },
    };
}
