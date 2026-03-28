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

export function isDocumentScrollContainer(container) {
    return !container ||
        container === window ||
        container === document ||
        container === document.body ||
        container === document.documentElement ||
        container === document.scrollingElement;
}

export function isScrollableElement(el, threshold = 8) {
    if (!el || !(el instanceof Element)) return false;

    const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
    const overflowY = style?.overflowY || style?.overflow || '';
    const canScroll = ['auto', 'scroll', 'overlay'].includes(overflowY);
    return canScroll && el.scrollHeight > el.clientHeight + threshold;
}

export function getScrollMetrics(container = null) {
    if (isDocumentScrollContainer(container)) {
        const scroller = document.scrollingElement || document.documentElement || document.body;
        return {
            scrollTop: window.scrollY || scroller?.scrollTop || 0,
            clientHeight: window.innerHeight || scroller?.clientHeight || 0,
            scrollHeight: Math.max(
                scroller?.scrollHeight || 0,
                document.body?.scrollHeight || 0,
                document.documentElement?.scrollHeight || 0,
            ),
        };
    }

    return {
        scrollTop: container.scrollTop || 0,
        clientHeight: container.clientHeight || 0,
        scrollHeight: container.scrollHeight || 0,
    };
}

export function findScrollableContainer(target = null, selectors = []) {
    const candidates = [];
    const seen = new Set();

    const pushCandidate = (el) => {
        if (!el || seen.has(el)) return;
        seen.add(el);
        candidates.push(el);
    };

    if (target && target.nodeType === 1) {
        let node = target;
        while (node) {
            pushCandidate(node);
            node = node.parentElement;
        }
    }

    selectors.forEach((sel) => {
        try {
            pushCandidate(document.querySelector(sel));
        } catch (e) {
            // 忽略无效选择器
        }
    });

    const documentScroller = document.scrollingElement || document.documentElement || document.body;
    pushCandidate(documentScroller);
    pushCandidate(document.documentElement);
    pushCandidate(document.body);

    return candidates.find((candidate) => isScrollableElement(candidate)) || documentScroller;
}

export function scrollContainerTo(container, top, behavior = 'smooth') {
    const safeTop = Math.max(0, Number(top) || 0);

    if (isDocumentScrollContainer(container)) {
        if (typeof window.scrollTo === 'function') {
            window.scrollTo({ top: safeTop, behavior });
        } else {
            const scroller = document.scrollingElement || document.documentElement || document.body;
            if (scroller) scroller.scrollTop = safeTop;
        }
        window.dispatchEvent(new Event('scroll'));
        return;
    }

    if (typeof container.scrollTo === 'function') {
        container.scrollTo({ top: safeTop, behavior });
    } else {
        container.scrollTop = safeTop;
    }
    container.dispatchEvent(new Event('scroll', { bubbles: true }));
}

export function scrollContainerBy(container, delta, behavior = 'smooth') {
    const metrics = getScrollMetrics(container);
    scrollContainerTo(container, metrics.scrollTop + delta, behavior);
}

export function describeScrollContainer(container) {
    if (isDocumentScrollContainer(container)) return 'window';
    if (!container) return 'unknown';

    const parts = [container.tagName?.toLowerCase()].filter(Boolean);
    if (container.id) parts.push(`#${container.id}`);

    const classNames = typeof container.className === 'string'
        ? container.className.trim().split(/\s+/).filter(Boolean).slice(0, 2)
        : [];
    classNames.forEach((className) => parts.push(`.${className}`));

    return parts.join('') || 'unknown';
}

// ====== 日期工具 ======

/**
 * 获取今天的日期字符串 YYYY-MM-DD
 */
export function getTodayKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 当前小时 0-23
 */
export function getCurrentHour() {
    return new Date().getHours();
}
