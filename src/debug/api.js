"use strict";

import { BUILDING_NAMES, compatiblePlacements, placementsByBuilding } from '../core/buildings.js';

const BUILDING_SET = new Set(BUILDING_NAMES);
const MAX_SEEK_ATTEMPTS = 400;

function availableBuildingsForSize(size) {
    return placementsByBuilding(size)
        .flatMap((placements, index) => placements.length ? BUILDING_NAMES[index] : []);
}

function compatibleBuildingRequest(size, wanted) {
    const byBuilding = placementsByBuilding(size);
    const indexes = wanted.map(building => BUILDING_NAMES.indexOf(building));
    if (indexes.length === 1) {
        return byBuilding[indexes[0]].length > 0;
    }
    for (const first of byBuilding[indexes[0]]) {
        for (const second of byBuilding[indexes[1]]) {
            if (compatiblePlacements(first, second)) {
                return true;
            }
        }
    }
    return false;
}

function normalizeBuildings(input) {
    const raw = Array.isArray(input) ? input : [input];
    if (!raw.length || raw.length > 2) {
        throw new Error('Pass one building or two different buildings.');
    }
    const normalized = raw.map(building => String(building).trim().toUpperCase());
    if (new Set(normalized).size !== normalized.length) {
        throw new Error('Buildings must be unique.');
    }
    for (const building of normalized) {
        if (!BUILDING_SET.has(building)) {
            throw new Error(`Unknown building: ${building}`);
        }
    }
    return normalized;
}

function summarizeBuildings(puzzle) {
    return puzzle.buildings.map(({ buildingIndex, markerCell }) => ({
        building: BUILDING_NAMES[buildingIndex],
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
            availableBuildings: availableBuildingsForSize(size),
            buildings: puzzle ? summarizeBuildings(puzzle) : [],
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

    async function seekBuildings(input) {
        assertIdle();
        hideAnswer();
        const wanted = normalizeBuildings(input);
        const available = new Set(availableBuildingsForSize(level.size()));
        for (const building of wanted) {
            if (!available.has(building)) {
                throw new Error(`Building ${building} is not available at level ${level.value}.`);
            }
        }
        if (!compatibleBuildingRequest(level.size(), wanted)) {
            throw new Error(`Buildings ${wanted.join(', ')} do not share a valid layout at level ${level.value}. Try a larger board.`);
        }

        const matches = () => {
            const nextPuzzle = getPuzzle();
            if (!nextPuzzle) {
                return false;
            }
            const present = new Set(summarizeBuildings(nextPuzzle).map(entry => entry.building));
            return wanted.every(building => present.has(building));
        };

        let attempts = 0;
        while (!matches() && attempts < MAX_SEEK_ATTEMPTS) {
            await rerollBoard();
            attempts++;
        }
        if (!matches()) {
            throw new Error(`Could not find buildings ${wanted.join(', ')} after ${MAX_SEEK_ATTEMPTS} rerolls.`);
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
            "await window.__ustcerDebug.seekBuilding('三')",
            "await window.__ustcerDebug.seekBuildings(['一', '五'])",
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
        seekBuilding(building) {
            return seekBuildings([building]);
        },
        seekBuildings,
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
