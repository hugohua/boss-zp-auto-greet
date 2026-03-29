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
let apmInterceptorInstalled = false;
let vipUpgradeAutoCloseInterval = null;
let vipUpgradeAutoCloseAttempts = 0;

const CHAT_START_API_PATH = '/wapi/zpjob/chat/start';
const VIP_UPGRADE_TITLE_PATTERN = /免费开聊权益已升级/;
const VIP_UPGRADE_CONTENT_PATTERN = /(聊天升级卡|额外沟通50人|主动沟通人数已达\d+人上限)/;
const CHAT_LIMIT_TITLE_PATTERN = /(今日沟通已达上限|沟通已达上限)/;
const CHAT_LIMIT_CONTENT_PATTERN = /(请明日再试|主动沟通已达\d+人|沟通已达\d+人|开聊不足)/;
const VIP_UPGRADE_DIALOG_SELECTORS = [
    '.dialog-wrap',
    '.dialog-container',
    '.boss-popup__wrapper',
    '.boss-popup__content',
].join(', ');

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
    if (vipUpgradeAutoCloseInterval) {
        clearInterval(vipUpgradeAutoCloseInterval);
        vipUpgradeAutoCloseInterval = null;
    }
    vipUpgradeAutoCloseAttempts = 0;
    logger.info('熔断已重置');
    syncBehaviorSimulation();
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

function getChatStartData(payload) {
    return payload?.zpData && typeof payload.zpData === 'object'
        ? payload.zpData
        : payload;
}

function normalizePopupText(text) {
    return String(text || '').replace(/\s+/g, '');
}

function isVipUpgradeTitle(text) {
    return VIP_UPGRADE_TITLE_PATTERN.test(normalizePopupText(text));
}

function isVipUpgradeContent(text) {
    return VIP_UPGRADE_CONTENT_PATTERN.test(normalizePopupText(text));
}

export function isVipUpgradeChatStartResult(payload) {
    const data = getChatStartData(payload);

    if (!data || Number(data.status) !== 3) return false;

    const title = normalizePopupText(data.limitTitle);
    const desc = normalizePopupText(data.stateDes || data.stateDesc);
    return isVipUpgradeTitle(title) || isVipUpgradeContent(desc);
}

export function isChatStartLimitReachedResult(payload) {
    const data = getChatStartData(payload);
    if (!data || Number(data.status) !== 3) return false;
    if (isVipUpgradeChatStartResult(data)) return false;

    const title = normalizePopupText(data.limitTitle);
    const desc = normalizePopupText(data.stateDes || data.stateDesc);
    const shortDesc = normalizePopupText(data.blockPageData?.shortDesc?.name || data.blockPageData?.shortDesc?.tip);

    if (CHAT_LIMIT_TITLE_PATTERN.test(title)) return true;
    if (CHAT_LIMIT_CONTENT_PATTERN.test(desc) && /请明日再试|主动沟通已达\d+人|沟通已达\d+人/.test(desc)) return true;
    if (/开聊不足/.test(shortDesc)) return true;

    return false;
}

function isVipUpgradeDialog(el) {
    if (!el || el.nodeType !== 1) return false;

    const title = el.querySelector?.('.dialog-header .title, .boss-dialog_title, h3');
    const body = el.querySelector?.('.tip-text, .dialog-body, .boss-dialog__body');
    const text = normalizePopupText(`${title?.textContent || ''} ${body?.textContent || ''} ${el.textContent || ''}`);

    if (!text) return false;
    return isVipUpgradeTitle(text) && isVipUpgradeContent(text);
}

function isConnectedNode(node) {
    return !!node && (node.isConnected ?? document.contains(node));
}

function collectVipUpgradeDialogCandidates(root = document) {
    const candidates = [];

    if (root?.nodeType === 1) {
        if (!isConnectedNode(root)) return candidates;
        candidates.push(root);
        candidates.push(...(root.querySelectorAll?.(VIP_UPGRADE_DIALOG_SELECTORS) || []));
        return candidates;
    }

    if (root?.querySelectorAll) {
        candidates.push(...root.querySelectorAll(VIP_UPGRADE_DIALOG_SELECTORS));
    }

    return candidates;
}

export function closeVipUpgradeDialog(root = document) {
    const candidates = collectVipUpgradeDialogCandidates(root);

    for (const candidate of candidates) {
        if (!isConnectedNode(candidate)) continue;
        if (!isVipUpgradeDialog(candidate)) continue;
        if (candidate.dataset?.bhVipDialogClosing === '1') return true;

        const closeBtn = candidate.querySelector(
            '.dialog-header .close, .close, .dialog-footer .btn.btn-sure, .btn.btn-sure, .boss-popup__close, .boss-dialog__footer .boss-dialog__button',
        );

        if (closeBtn && isConnectedNode(closeBtn) && typeof closeBtn.click === 'function') {
            candidate.dataset.bhVipDialogClosing = '1';
            closeBtn.click();
            logger.info('已自动关闭聊天升级卡提示弹窗');
            return true;
        }
    }

    return false;
}

function publishChatStartResult(payload) {
    if (isVipUpgradeChatStartResult(payload)) {
        logger.info('检测到 chat/start 聊天升级卡响应，启动弹窗自动关闭轮询');
        scheduleVipUpgradeDialogAutoClose('chat/start 响应');
        return;
    }

    if (isChatStartLimitReachedResult(payload)) {
        const data = getChatStartData(payload);
        const reasonParts = [data?.limitTitle, data?.stateDes || data?.stateDesc, data?.blockPageData?.shortDesc?.name]
            .filter(Boolean);
        const reason = reasonParts.join(': ') || '今日沟通已达上限';

        logger.warn(`检测到 chat/start 沟通上限响应: ${reason}`);
        if (!circuitBroken) {
            triggerCircuitBreaker(reason);
            if (onVipDetected) onVipDetected();
        }
    }
}

function scheduleVipUpgradeDialogAutoClose(source = '未知来源') {
    vipUpgradeAutoCloseAttempts = Math.max(vipUpgradeAutoCloseAttempts, 6);

    if (vipUpgradeAutoCloseInterval) return;

    vipUpgradeAutoCloseInterval = setInterval(() => {
        if (closeVipUpgradeDialog()) {
            clearInterval(vipUpgradeAutoCloseInterval);
            vipUpgradeAutoCloseInterval = null;
            vipUpgradeAutoCloseAttempts = 0;
            return;
        }

        vipUpgradeAutoCloseAttempts -= 1;
        if (vipUpgradeAutoCloseAttempts <= 0) {
            clearInterval(vipUpgradeAutoCloseInterval);
            vipUpgradeAutoCloseInterval = null;
            logger.warn(`未能自动关闭聊天升级卡提示弹窗: ${source}`);
        }
    }, 1000);
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
    if (document.hidden && !config.runInBackground) {
        return { safe: false, reason: '页面在后台，且未开启后台持续运行，暂停操作' };
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
                const isPopup = node.matches?.('.dialog-wrap, .dialog-container, [class*="dialog"], [class*="popup"], [class*="modal"]') ||
                    node.querySelector?.('.dialog-wrap, .dialog-container, [class*="dialog"], [class*="popup"], [class*="modal"]');
                if (isPopup) {
                    // 延迟一点检查内容
                    setTimeout(() => {
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
    const config = getConfig();
    if (document.hidden && !config.runInBackground) return; // 后台不执行且未开启持续运行

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

export function syncBehaviorSimulation() {
    const config = getConfig();
    if (config.behaviorSimEnabled && !circuitBroken) {
        startBehaviorSimulation();
    } else {
        stopBehaviorSimulation();
    }
}

// ====== APM 埋点拦截 ======

/**
 * 安装 XHR 拦截器，替换自动化工具产生的异常埋点数据
 */
export function installApmInterceptor() {
    if (apmInterceptorInstalled) return;
    apmInterceptorInstalled = true;

    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this._bossUrl = url;
        this._bossMethod = method;
        return originalOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (body) {
        const isChatStart = this._bossUrl && this._bossUrl.includes(CHAT_START_API_PATH);
        if (isChatStart) {
            this.addEventListener('load', function () {
                try {
                    const data = JSON.parse(this.responseText);
                    if (data?.code === 0 && data.zpData) {
                        publishChatStartResult(data.zpData);
                    }
                } catch (e) {
                    // ignore malformed chat/start responses
                }
            });
        }

        // 拦截 APM 埋点和行为日志请求
        const isApmLog = this._bossUrl && this._bossMethod === 'POST' && (
            this._bossUrl.includes('/wapi/zpApm/actionLog/') ||
            this._bossUrl.includes('/wapi/zpCommon/actionLog/')
        );
        if (isApmLog) {
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
 * 清洗 APM 及行为日志数据：移除自动化工具特征
 */
function cleanApmData(body) {
    if (!body || typeof body !== 'string') return body;

    try {
        const params = new URLSearchParams(body);
        
        // 1. 处理 APM 格式 (content=...)
        if (params.has('content')) {
            const content = params.get('content');
            const data = JSON.parse(decodeURIComponent(content));
            if (data.items && Array.isArray(data.items)) {
                let modified = false;
                for (const item of data.items) {
                    if (cleanSingleAction(item)) modified = true;
                }
                if (modified) {
                    const newContent = encodeURIComponent(JSON.stringify(data));
                    params.set('content', newContent);
                    return params.toString();
                }
            }
        }
        
        // 2. 处理业务行为日志格式 (ba=...)
        if (params.has('ba')) {
            const baContent = params.get('ba');
            const data = JSON.parse(decodeURIComponent(baContent));
            if (cleanSingleAction(data)) {
                const newBa = encodeURIComponent(JSON.stringify(data));
                params.set('ba', newBa);
                return params.toString();
            }
        }
        
        return body;
    } catch (e) {
        return body;
    }
}

/**
 * 清洗单个动作对象
 * @returns {boolean} 是否发生了修改
 */
function cleanSingleAction(item) {
    if (!item) return false;
    let modified = false;

    // 清除自动化工具特征
    if (item.p2 === 52001) {
        item.p2 = 0;
        modified = true;
    }
    // 修正负坐标 (仅对 p4 为坐标的场景，注意部分 ba= 请求中 p4 是时间戳)
    if (typeof item.p4 === 'string' && /-\d+/.test(item.p4) && item.p4.includes(',')) {
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

    // 补充针对 click() 触发的坐标暴露
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

    // 移除脚本按钮路径
    if (item.p8 && typeof item.p8 === 'string' && (item.p8.includes('#boss-helper') || item.p8.includes('#bh-') || item.p8.includes('.bh-'))) {
        item.p8 = '';
        modified = true;
    }

    return modified;
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
