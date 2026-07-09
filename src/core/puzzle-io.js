"use strict";

import { load, save } from '../lib/storage.js';
import { BUILDING_MASKS } from './buildings.js';
import { Path } from './path.js';

// 题目序列化格式（题目工坊 / 链接分享共用）：
// { v:1, w, h, sign, answer: moves[]|null, palette:[{color,chars:[]}], roadNames:[], name, createdAt, origin }
// - sign 沿用游戏内编码（见 docs/reference.txt），自定义色占用类型码 20+idx，
//   渲染与判题通过 palette 表把 20+idx 映射回颜色/文字。
// - 路名编号 100+idx 指向 roadNames 自定义路名表。
// - answer 为移动序列（0右 1下 2左 3上），可为 null（创作题不保证可解）。

const SAVED_KEY = 'savedPuzzles';
const FORMAT_VERSION = 1;
export const CUSTOM_TYPE_BASE = 20;
export const CUSTOM_ROAD_BASE = 100;
export const MAX_EDITOR_SIZE = 20;
export const MIN_EDITOR_SIZE = 2;

// ===== 路名 / 格子文字与用色的规范表（渲染、编辑器、判题共用）=====

export const ROAD_NAMES = [
    [
        "孺子牛路", "勤奋路", "寰宇北路", "寰宇南路", "励学路",
        "黄山路", "瀚海路", "英才路", "红专路", "黄山路", "四牌楼路",
    ],
    [
        "金寨路", "郭沫若路", "天使路", "玉泉南路", "玉泉北路",
        "肥西路", "志学路", "石榴园路", "寰宇东路", "寰宇西路", "济慧路",
    ],
];

// 行序即类型码 7-12。书院与颜色的对应关系（编辑器标签/暗色变体都按此语义）：
//   7 光启·仲英书院（少年班学院）= 橙
//   8 冲之书院（数学/工程/管理）= 蓝
//   9 时珍书院（生物/信息/计算机）= 绿
//  10 守敬书院（物理/化学等）= 紫
export const CELL_NAMES = [
    ["少"],
    ["管", "工", "数"],
    ["网", "微", "计", "生", "信"],
    ["环", "核", "地", "化", "物"],
    ["红", "专"],
    ["理", "实"],
];

export const CELL_COLORS = ["#e69138", "#4272b8", "#4a9e6b", "#8e63b5", "#d64545", "#4272b8"];

// 阻断边三元组 [ex, ey, axis] → Path 的 edgeKey 集合（axis 0 横边 1 竖边）
export function blockedEdgeSet(blockedEdges, h) {
    if (!blockedEdges?.length) {
        return null;
    }
    const stride = h + 1;
    return new Set(blockedEdges.map(([ex, ey, axis]) => (ex * stride + ey) * 2 + axis));
}

// (w+1)×(h+1) 的空白 sign 矩阵（编辑器新建 / 教程示例板共用）
export function blankSign(w, h) {
    return Array.from({ length: w + 1 }, () =>
        Array.from({ length: h + 1 }, () => [[0, 0], [0, 0], [0, 0]]));
}

// 自定义色底上的字自动选黑/白，保证可读
export function readableTextColor(color) {
    const match = /^#?([0-9a-f]{6})$/i.exec(String(color).trim());
    if (!match) {
        return '#ffffff';
    }
    const value = parseInt(match[1], 16);
    const r = value >> 16;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return 0.299 * r + 0.587 * g + 0.114 * b > 168 ? '#1c1c1c' : '#ffffff';
}

// 书院冲突判定的"颜色键"：书院四色(7-10)与自定义色(20+)统一按实际颜色分组，
// 自定义一个与书院同色的调色板项（比如给书院格配自定义字）时仍算同一书院。
export function colorKeyOf(type, palette = []) {
    const t = type[0];
    if (t >= 7 && t <= 10) {
        return CELL_COLORS[t - 7].toLowerCase();
    }
    if (t >= CUSTOM_TYPE_BASE) {
        return String(palette[t - CUSTOM_TYPE_BASE]?.color ?? `?${t}`).toLowerCase();
    }
    return null;
}

export function serializePuzzle(puzzle, { name = '', origin = 'generated' } = {}) {
    return {
        v: FORMAT_VERSION,
        w: puzzle.size[0],
        h: puzzle.size[1],
        sign: puzzle.sign,
        answer: puzzle.answer?.queue ? [...puzzle.answer.queue] : null,
        palette: puzzle.palette ?? [],
        roadNames: puzzle.roadNames ?? [],
        blockedEdges: puzzle.blockedEdges ?? [],
        name: name || `${puzzle.size[0]}×${puzzle.size[1]} 题目`,
        createdAt: Date.now(),
        origin,
    };
}

// 记录 → 可游玩 puzzle：answer 移动序列重放进 Path；坏答案（没走到出口）按无答案处理
export function deserializePuzzle(record) {
    const size = [record.w, record.h];
    let answer = null;
    if (Array.isArray(record.answer) && record.answer.length) {
        // 重放必须带上阻断边：否则穿过阻断通道的答案也能"走到出口"，
        // 题目被当成有解，展示的却是玩家画不出来的线
        answer = new Path(size, blockedEdgeSet(record.blockedEdges ?? [], record.h));
        for (const move of record.answer) {
            if (!answer.step(move)) {
                answer = null;
                break;
            }
        }
        if (answer && !answer.finished) {
            answer = null;
        }
    }
    return {
        size,
        sign: record.sign,
        answer,
        palette: record.palette ?? [],
        roadNames: record.roadNames ?? [],
        blockedEdges: record.blockedEdges ?? [],
        // 与生成器产物保持同构（楼标记只在生成期有意义，恢复题面为空表）
        buildings: [],
    };
}

function isValidMoves(moves) {
    return moves === null ||
        (Array.isArray(moves) && moves.every(move => Number.isInteger(move) && move >= 0 && move <= 3));
}

// 结构校验：防坏档/恶意链接把游戏搞崩
export function validateRecord(record) {
    if (!record || record.v !== FORMAT_VERSION) {
        return false;
    }
    const { w, h, sign } = record;
    // 2–20 只是编辑器的新建限制；生成题（低关卡可小到 1×1）也要能收藏
    if (!Number.isInteger(w) || !Number.isInteger(h) ||
        w < 1 || h < 1 || w > 36 || h > 36) {
        return false;
    }
    if (record.palette !== undefined) {
        if (!Array.isArray(record.palette) ||
            !record.palette.every(entry => entry && typeof entry.color === 'string' &&
                Array.isArray(entry.chars) && entry.chars.every(char => typeof char === 'string'))) {
            return false;
        }
    }
    if (record.roadNames !== undefined) {
        if (!Array.isArray(record.roadNames) ||
            !record.roadNames.every(name => typeof name === 'string')) {
            return false;
        }
    }
    if (record.blockedEdges !== undefined) {
        if (!Array.isArray(record.blockedEdges) ||
            !record.blockedEdges.every(edge => Array.isArray(edge) && edge.length === 3 &&
                edge.every(Number.isInteger) &&
                edge[0] >= 0 && edge[0] <= w && edge[1] >= 0 && edge[1] <= h &&
                (edge[2] === 0 || edge[2] === 1))) {
            return false;
        }
    }
    const paletteLength = record.palette?.length ?? 0;
    const roadNamesLength = record.roadNames?.length ?? 0;
    // 类型码之外，子编号（第几个字/第几栋楼）也必须卡住范围：判题会直接
    // 拿它当下标（红专理实的配对槽位、楼的朝向表），越界的记录能通过校验
    // 的话，玩家一画完路径就是一个 TypeError
    const validCellSign = ([t, sub]) => {
        if (t === 0) {
            return true;   // 空白/底纹格，sub 只当真值用
        }
        if (!Number.isInteger(t) || !Number.isInteger(sub) || sub < 0) {
            return false;
        }
        if (t >= 7 && t <= 12) {
            return sub < CELL_NAMES[t - 7].length;
        }
        if (t === 13) {
            return sub < BUILDING_MASKS.length;
        }
        // 自定义色格的字编号只影响显示（渲染端缺字回退为空），不做上限卡制，
        // 免得误伤旧存档
        return t >= CUSTOM_TYPE_BASE && t < CUSTOM_TYPE_BASE + paletteLength;
    };
    const validRoadName = (orient, idx) => Number.isInteger(idx) && (
        (idx >= 0 && idx < ROAD_NAMES[orient].length) ||
        (idx >= CUSTOM_ROAD_BASE && idx < CUSTOM_ROAD_BASE + roadNamesLength));

    if (!Array.isArray(sign) || sign.length < w + 1) {
        return false;
    }
    for (let i = 0; i <= w; i++) {
        if (!Array.isArray(sign[i]) || sign[i].length < h + 1) {
            return false;
        }
        for (let j = 0; j <= h; j++) {
            const entry = sign[i][j];
            if (!Array.isArray(entry) || entry.length !== 3 ||
                !entry.every(part => Array.isArray(part) && part.length === 2 &&
                    part.every(Number.isFinite))) {
                return false;
            }
            // 类型码/路名号只校验判题会读到的 w×h 区（外圈是生成器的占位行列）
            if (i < w && j < h) {
                if (!validCellSign(entry[2])) {
                    return false;
                }
                if ((entry[0][0] && !validRoadName(0, entry[0][1])) ||
                    (entry[1][0] && !validRoadName(1, entry[1][1]))) {
                    return false;
                }
            }
        }
    }
    if (!isValidMoves(record.answer ?? null)) {
        return false;
    }
    return true;
}

// ===== 本地保存列表 =====

export function loadSavedPuzzles() {
    const list = load(SAVED_KEY, []);
    return Array.isArray(list) ? list.filter(validateRecord) : [];
}

export function savePuzzleRecord(record) {
    if (!validateRecord(record)) {
        throw new Error('题目数据不完整，无法保存');
    }
    const list = loadSavedPuzzles();
    record.id = record.id ?? `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
    const index = list.findIndex(entry => entry.id === record.id);
    if (index >= 0) {
        list[index] = record;
    } else {
        list.unshift(record);
    }
    save(SAVED_KEY, list);
    return record;
}

export function deleteSavedPuzzle(id) {
    save(SAVED_KEY, loadSavedPuzzles().filter(entry => entry.id !== id));
}

// ===== 链接分享（数据编码进 URL hash）=====

function base64UrlEncode(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function base64UrlDecode(encoded) {
    const padded = encoded.replaceAll('-', '+').replaceAll('_', '/')
        .padEnd(Math.ceil(encoded.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

// 拆出纯函数部分（不碰 location），供测试编解码往返
export function encodeShareHash(record) {
    const payload = { ...record };
    delete payload.id;
    return `#p=${base64UrlEncode(JSON.stringify(payload))}`;
}

export function encodeShareUrl(record) {
    const base = `${location.origin}${location.pathname}${location.search}`;
    return `${base}${encodeShareHash(record)}`;
}

export function decodeShareHash(hash = location.hash) {
    const match = /#p=([A-Za-z0-9_-]+)/.exec(hash);
    if (!match) {
        return null;
    }
    try {
        const record = JSON.parse(base64UrlDecode(match[1]));
        return validateRecord(record) ? record : null;
    } catch {
        return null;
    }
}
