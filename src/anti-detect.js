/**
 * 风控模块
 * 整合 boss-fk.js 的 APM 拦截 + 行为模拟 + 熔断机制
 */

import { logger, randomInt, chance, sleep } from './utils.js';
import { getConfig } from './config.js';

// ====== 状态 ======
let behaviorHistory = [];
let scrollPositions = [];
let lastActionTime = 0;
let behaviorTimer = null;
let circuitBroken = false; // 熔断状态
let consecutiveFailures = 0;

// ====== 公开 API ======

/**
 * 获取熔断状态
 */
export function isCircuitBroken() {
    return circuitBroken;
}

/**
 * 重置熔断
 */
export function resetCircuitBreaker() {
    circuitBroken = false;
    consecutiveFailures = 0;
    logger.info('熔断已重置');
}

/**
 * 记录一次失败，连续3次触发熔断
 */
export function recordFailure(reason) {
    consecutiveFailures++;
    logger.warn(`操作失败 (${consecutiveFailures}/3): ${reason}`);
    if (consecutiveFailures >= 3) {
        triggerCircuitBreaker(`连续 ${consecutiveFailures} 次失败: ${reason}`);
    }
}

/**
 * 记录一次成功，重置失败计数
 */
export function recordSuccess() {
    consecutiveFailures = 0;
}

/**
 * 触发熔断
 */
export function triggerCircuitBreaker(reason) {
    circuitBroken = true;
    logger.error(`⚠️ 熔断触发: ${reason}`);
    stopBehaviorSimulation();
}

// ====== VIP 限制检测 ======

/**
 * 检测 VIP 限制弹窗
 */
export function checkVipLimit() {
    // 方法1：直接查询弹窗
    const selectors = [
        '.dialog-wrap[data-type="boss-dialog"]',
        '.boss-popup__content',
        '.limit-dialog',
        '[class*="vip-limit"]',
        '[class*="usage-limit"]',
    ];

    for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) {
            return true;
        }
    }

    // 方法2：检查 Shadow DOM
    const shadowHosts = document.querySelectorAll('[class*="dialog"], [class*="popup"], [class*="modal"]');
    for (const host of shadowHosts) {
        if (host.shadowRoot) {
            for (const sel of selectors) {
                const shadowEl = host.shadowRoot.querySelector(sel);
                if (shadowEl) return true;
            }
        }
    }

    return false;
}

/**
 * 检测验证码弹窗
 */
export function checkCaptcha() {
    const captchaSelectors = [
        '[class*="captcha"]',
        '[class*="verify"]',
        '[class*="slider"]',
        '#captcha',
        '.geetest',
        '.nc-container',
    ];

    for (const sel of captchaSelectors) {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) {
            return true;
        }
    }
    return false;
}

/**
 * 检测页面是否跳转到登录页
 */
export function checkSessionExpired() {
    return window.location.href.includes('/web/user/login') ||
        window.location.href.includes('/web/user/safe');
}

/**
 * 综合安全检测（打招呼前调用）
 * @returns {{ safe: boolean, reason: string }}
 */
export function safetyCheck() {
    if (circuitBroken) {
        return { safe: false, reason: '熔断状态，请手动重置' };
    }
    if (checkSessionExpired()) {
        triggerCircuitBreaker('登录已过期');
        return { safe: false, reason: '登录已过期，请重新登录' };
    }
    if (checkVipLimit()) {
        triggerCircuitBreaker('VIP 限制');
        return { safe: false, reason: '已达平台打招呼上限' };
    }
    if (checkCaptcha()) {
        triggerCircuitBreaker('验证码');
        return { safe: false, reason: '检测到验证码，请手动完成' };
    }

    // 工作时段检测
    const config = getConfig();
    if (config.workHoursEnabled) {
        const hour = new Date().getHours();
        if (hour < config.workHoursStart || hour >= config.workHoursEnd) {
            return { safe: false, reason: `当前不在工作时段 (${config.workHoursStart}:00-${config.workHoursEnd}:00)` };
        }
    }

    // 页面聚焦检测
    if (document.hidden) {
        return { safe: false, reason: '页面在后台，暂停操作' };
    }

    return { safe: true, reason: '' };
}

// ====== VIP 限制观察器 ======

let vipObserver = null;
let onVipDetected = null;

export function setupVipObserver(callback) {
    onVipDetected = callback;

    if (vipObserver) vipObserver.disconnect();

    vipObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (!mutation.addedNodes) continue;
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== 1) continue;
                // 检查新增的弹窗节点
                const isPopup = node.matches?.('[class*="dialog"], [class*="popup"], [class*="modal"]') ||
                    node.querySelector?.('[class*="dialog"], [class*="popup"], [class*="modal"]');
                if (isPopup) {
                    // 延迟一点检查内容
                    setTimeout(() => {
                        if (checkVipLimit()) {
                            triggerCircuitBreaker('检测到 VIP 限制弹窗');
                            if (onVipDetected) onVipDetected();
                        }
                        if (checkCaptcha()) {
                            triggerCircuitBreaker('检测到验证码');
                            if (onVipDetected) onVipDetected();
                        }
                    }, 300);
                }
            }
        }
    });

    vipObserver.observe(document.documentElement, { childList: true, subtree: true });
}

export function stopVipObserver() {
    if (vipObserver) {
        vipObserver.disconnect();
        vipObserver = null;
    }
}

// ====== 行为模拟 ======

/**
 * 模拟滚动到目标元素附近（打招呼前调用）
 */
export function simulateScrollToElement(el) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const targetY = window.scrollY + rect.top - randomInt(80, 200);
    window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });

    scrollPositions.push(targetY);
    if (scrollPositions.length > 10) scrollPositions.shift();

    behaviorHistory.push({ type: 'scroll', position: targetY, time: Date.now() });
}

/**
 * 模拟鼠标移动到元素位置
 */
export function simulateMouseMoveToElement(el) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = rect.left + randomInt(5, rect.width - 5);
    const y = rect.top + randomInt(5, rect.height - 5);

    const moveEvent = new MouseEvent('mousemove', {
        bubbles: true, cancelable: true,
        clientX: x, clientY: y,
    });
    el.dispatchEvent(moveEvent);

    behaviorHistory.push({ type: 'mousemove', x, y, time: Date.now() });
}

/**
 * 启动后台行为模拟（低频）
 */
export function startBehaviorSimulation() {
    if (behaviorTimer) return;

    const config = getConfig();
    if (!config.behaviorSimEnabled) return;

    logger.info('启动后台行为模拟');
    scheduleNextBehavior();
}

function scheduleNextBehavior() {
    const waitTime = randomInt(10000, 20000); // 10-20秒
    behaviorTimer = setTimeout(() => {
        performBackgroundBehavior();
        scheduleNextBehavior();
    }, waitTime);
}

function performBackgroundBehavior() {
    if (document.hidden) return; // 后台不执行

    // 随机选一个行为
    const roll = Math.random();

    if (roll < 0.4) {
        // 微小滚动
        const delta = randomInt(-100, 100);
        window.scrollBy({ top: delta, behavior: 'smooth' });
        scrollPositions.push(window.scrollY + delta);
        if (scrollPositions.length > 10) scrollPositions.shift();
    } else if (roll < 0.7) {
        // 随机鼠标移动（不点击任何东西！）
        const x = randomInt(100, window.innerWidth - 100);
        const y = randomInt(100, window.innerHeight - 100);
        const moveEvent = new MouseEvent('mousemove', {
            bubbles: true, cancelable: true,
            clientX: x, clientY: y,
        });
        document.dispatchEvent(moveEvent);
    }
    // else: 什么都不做（模拟用户在看页面）

    behaviorHistory.push({ type: 'idle', time: Date.now() });
    if (behaviorHistory.length > 20) behaviorHistory = behaviorHistory.slice(-20);
}

export function stopBehaviorSimulation() {
    if (behaviorTimer) {
        clearTimeout(behaviorTimer);
        behaviorTimer = null;
    }
}

// ====== APM 埋点拦截 ======

/**
 * 安装 XHR 拦截器，替换自动化工具产生的异常埋点数据
 */
export function installApmInterceptor() {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this._bossUrl = url;
        this._bossMethod = method;
        return originalOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (body) {
        // 只拦截 APM 埋点请求
        if (this._bossUrl && this._bossUrl.includes('/wapi/zpApm/actionLog/') && this._bossMethod === 'POST') {
            try {
                const cleaned = cleanApmData(body);
                if (cleaned !== body) {
                    logger.info('已清洗 APM 埋点数据');
                    return originalSend.call(this, cleaned);
                }
            } catch (e) {
                // 解析失败就发原始数据
            }
        }
        return originalSend.call(this, body);
    };

    logger.info('APM 埋点拦截器已安装');
}

/**
 * 清洗 APM 数据：移除自动化工具特征
 */
function cleanApmData(body) {
    if (!body || typeof body !== 'string') return body;

    try {
        const params = new URLSearchParams(body);
        const content = params.get('content');
        if (!content) return body;

        const decoded = decodeURIComponent(content);
        const data = JSON.parse(decoded);

        if (!data.items || !Array.isArray(data.items)) return body;

        let modified = false;

        for (const item of data.items) {
            // 清除自动化工具特征
            if (item.p2 === 52001) {
                item.p2 = 0;
                modified = true;
            }
            // 修正负坐标
            if (item.p4 && /-\d+/.test(item.p4)) {
                const coords = item.p4.split(',').map(Number);
                item.p4 = coords.map(c => Math.abs(c) || randomInt(30, 70)).join(',');
                modified = true;
            }
            // 补充空轨迹数据
            if (item.p6 && typeof item.p6 === 'object') {
                if (!item.p6.x || item.p6.x === '') {
                    item.p6.x = generateMouseTrack(200, 1300);
                    modified = true;
                }
                if (!item.p6.y || item.p6.y === '') {
                    item.p6.y = generateMouseTrack(200, 300);
                    modified = true;
                }
                if (!item.p6.d || item.p6.d === '') {
                    item.p6.d = generateSmallValues(200);
                    modified = true;
                }
                if (!item.p6.e || item.p6.e === '') {
                    item.p6.e = generateSmallValues(200);
                    modified = true;
                }
            }

            // 补充针对 click() 触发的坐标暴露 (p3=10004 时 p5 和 p6 为 x, y 坐标，若为0则伪造)
            if (item.p3 === 10004) {
                if (item.p5 === 0) {
                    item.p5 = randomInt(20, 80); // 按钮内部随机 X
                    modified = true;
                }
                if (item.p6 === 0) {
                    item.p6 = randomInt(10, 30); // 按钮内部随机 Y
                    modified = true;
                }
            }

            // 移除脚本按钮路径，防止点击我们的浮层内容时向官方暴露节点
            if (item.p8 && (item.p8.includes('#boss-helper') || item.p8.includes('#bh-') || item.p8.includes('.bh-'))) {
                item.p8 = '';
                modified = true;
            }
        }

        if (!modified) return body;

        const newContent = encodeURIComponent(JSON.stringify(data));
        return `content=${newContent}`;
    } catch (e) {
        return body;
    }
}

// ====== 轨迹生成辅助 ======

function generateMouseTrack(length, startValue) {
    const points = [];
    let current = startValue;
    for (let i = 0; i < length; i++) {
        const move = chance(0.1)
            ? randomInt(-50, 50)
            : randomInt(-5, 5);
        current += move;
        points.push(current);
    }
    return points.join(',');
}

function generateSmallValues(length) {
    const values = [];
    for (let i = 0; i < length; i++) {
        values.push(chance(0.9) ? randomInt(-2, 2) : randomInt(-10, 10));
    }
    return values.join(',');
}
