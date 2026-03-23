/**
 * 工具函数模块
 * 随机化、日志、DOM辅助等通用工具
 */

// ====== 随机化工具 ======

/**
 * 生成随机间隔（基准值 ± 波动范围）
 * @param {number} base - 基准间隔（毫秒）
 * @param {number} variance - 波动比例，默认 0.3（即 ±30%）
 * @returns {number} 随机后的间隔（毫秒）
 */
export function randomInterval(base, variance = 0.3) {
    const min = base * (1 - variance);
    const max = base * (1 + variance);
    return Math.floor(min + Math.random() * (max - min));
}

/**
 * 生成指定范围内的随机整数
 */
export function randomInt(min, max) {
    return Math.floor(min + Math.random() * (max - min + 1));
}

/**
 * 以指定概率返回 true
 * @param {number} probability - 0~1 之间的概率
 */
export function chance(probability) {
    return Math.random() < probability;
}

/**
 * 异步等待指定毫秒
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 从数组中随机选一个元素
 */
export function randomPick(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
}

// ====== 日志工具 ======

const LOG_PREFIX = '[BOSS助手]';
const logHistory = [];
const MAX_LOG_HISTORY = 200;

// 日志变更回调
let onLogChange = null;

export function setLogChangeCallback(cb) {
    onLogChange = cb;
}

function addLog(level, ...args) {
    const entry = {
        time: new Date().toLocaleTimeString(),
        level,
        message: args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '),
    };
    logHistory.push(entry);
    if (logHistory.length > MAX_LOG_HISTORY) logHistory.shift();
    if (onLogChange) onLogChange(logHistory);
    return entry;
}

export const logger = {
    info(...args) {
        const entry = addLog('info', ...args);
        console.log(LOG_PREFIX, `[${entry.time}]`, ...args);
    },
    warn(...args) {
        const entry = addLog('warn', ...args);
        console.warn(LOG_PREFIX, `[${entry.time}]`, ...args);
    },
    error(...args) {
        const entry = addLog('error', ...args);
        console.error(LOG_PREFIX, `[${entry.time}]`, ...args);
    },
    getHistory() {
        return [...logHistory];
    },
};

// ====== DOM 辅助 ======

/**
 * 安全查询元素，支持多选择器回退
 * @param {string[]} selectors - 按优先级排列的选择器列表
 * @param {Element} parent - 父元素，默认 document
 * @returns {Element|null}
 */
export function queryFallback(selectors, parent = document) {
    for (const sel of selectors) {
        try {
            const el = parent.querySelector(sel);
            if (el) return el;
        } catch (e) {
            // 选择器语法错误时忽略
        }
    }
    return null;
}

/**
 * 安全查询所有匹配元素
 */
export function queryAllFallback(selectors, parent = document) {
    for (const sel of selectors) {
        try {
            const els = parent.querySelectorAll(sel);
            if (els.length > 0) return Array.from(els);
        } catch (e) {
            // 忽略
        }
    }
    return [];
}

/**
 * 平滑滚动到指定元素
 */
export function scrollToElement(el, offset = 100) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const targetY = window.scrollY + rect.top - offset;
    window.scrollTo({ top: targetY, behavior: 'smooth' });
}

// ====== 日期工具 ======

/**
 * 获取今天的日期字符串 YYYY-MM-DD
 */
export function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
}

/**
 * 当前小时 0-23
 */
export function getCurrentHour() {
    return new Date().getHours();
}
