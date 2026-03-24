/**
 * 打招呼核心模块
 * 节奏控制、招呼语模板渲染、打招呼执行
 */

import { logger, randomInterval, randomPick, chance, sleep, randomInt, scrollToElement } from './utils.js';
import { getConfig, incrementCount, isLimitReached, addRecord } from './config.js';
import {
    safetyCheck, recordFailure, recordSuccess,
    simulateScrollToElement, simulateMouseMoveToElement,
    isCircuitBroken,
} from './anti-detect.js';
import { getUngreetedTargets, markGreeted } from './filter.js';

// ====== 状态 ======
let isRunning = false;
let shouldStop = false;
let consecutiveCount = 0; // 连续操作计数
let onStatusChange = null;

// ====== 公开 API ======

export function setOnStatusChange(cb) {
    onStatusChange = cb;
}

export function isGreetingRunning() {
    return isRunning;
}

/**
 * 开始自动打招呼
 */
export async function startAutoGreeting() {
    if (isRunning) return;
    isRunning = true;
    shouldStop = false;
    consecutiveCount = 0;

    logger.info('🚀 开始自动打招呼');
    notifyStatus();

    await greetingLoop();

    isRunning = false;
    logger.info('⏹ 自动打招呼已停止');
    notifyStatus();
}

/**
 * 停止自动打招呼
 */
export function stopAutoGreeting() {
    shouldStop = true;
    logger.info('用户请求停止');
}

function notifyStatus() {
    if (onStatusChange) onStatusChange({ running: isRunning });
}

// ====== 核心循环 ======

async function greetingLoop() {
    const config = getConfig();

    while (!shouldStop) {
        // 1. 安全检测
        const safety = safetyCheck();
        if (!safety.safe) {
            logger.warn(`安全检测未通过: ${safety.reason}`);
            break;
        }

        // 2. 限额检查
        const limit = isLimitReached();
        if (limit.limited) {
            logger.warn(`达到限额: ${limit.reason}`);
            break;
        }

        // 3. 获取未打招呼的目标
        const targets = getUngreetedTargets();
        if (targets.length === 0) {
            logger.info('当前无未打招呼的目标候选人');
            // 尝试滚动加载更多
            if (config.autoLoadMore) {
                logger.info('尝试加载更多候选人...');
                scrollToLoadMore();
                await sleep(3500);

                // 主动触发一次基于 DOM 的扫描提取，作为新数据拦截兜底
                filterByDOM();

                const newTargets = getUngreetedTargets();
                if (newTargets.length === 0) {
                    logger.info('无更多目标候选人，停止当前循环');
                    break;
                }
                logger.info(`向下翻页成功，提取到新的待致意卡片`);
                continue;
            }
            break;
        }

        // 4. 随机跳过（风控模拟挑选行为）
        if (chance(config.skipProbability)) {
            logger.info('随机跳过本次（模拟挑选行为）');
            await sleep(randomInt(1000, 3000));
            continue;
        }

        // 5. 选择第一个目标（按顺序而非随机，更接近真人浏览）
        const target = targets[0];

        // 6. 模拟行为：滚动 → 鼠标移动 → 等待 → 点击
        const card = findCardElement(target);
        if (card) {
            simulateScrollToElement(card);
            await sleep(randomInt(500, 1500));
            const btn = findGreetButton(card);
            if (btn) {
                simulateMouseMoveToElement(btn);
                await sleep(randomInt(300, 800));
            }
        }

        // 7. 执行打招呼
        const greeting = renderGreeting(target, config);
        const success = await performGreeting(target, greeting, card);

        if (success) {
            const key = target.encryptGeekId || target.geekId;
            markGreeted(key);
            recordSuccess();
            incrementCount();
            consecutiveCount++;

            addRecord({
                name: target.name,
                school: target.school,
                schoolLabel: target.schoolLabel || '',
                title: target.title,
                experience: target.experience || '',
                greeting,
            });

            logger.info(`✅ 已向 ${target.name}(${target.school}) 发送招呼`);
        } else {
            recordFailure('打招呼操作失败');
            if (isCircuitBroken()) break;
        }

        // 8. 疲劳休息检查
        if (consecutiveCount >= config.consecutiveLimit) {
            const restTime = randomInt(config.restMinSeconds * 1000, config.restMaxSeconds * 1000);
            logger.info(`连续操作 ${consecutiveCount} 次，休息 ${Math.round(restTime / 1000)} 秒...`);
            consecutiveCount = 0;
            await sleep(restTime);
            if (shouldStop) break;
            continue;
        }

        // 9. 随机间隔等待
        const interval = randomInterval(config.greetInterval * 1000, 0.4);
        logger.info(`等待 ${(interval / 1000).toFixed(1)} 秒后继续...`);
        await sleep(interval);
    }
}

// ====== 打招呼执行 ======

/**
 * 执行打招呼（优先 DOM 点击，备选 API）
 */
async function performGreeting(target, greeting, card) {
    try {
        // 方式1：找到打招呼按钮并点击
        if (card) {
            const btn = findGreetButton(card);
            if (btn) {
                btn.click();
                await sleep(randomInt(800, 1500));

                // 检查是否弹出了聊天窗口/消息输入框，需要发送招呼语
                const sent = await trySendGreetingMessage(greeting);
                return sent;
            }
        }

        // 方式2：如果卡片上没找到按钮，尝试通过页面全局查找
        logger.warn('未找到打招呼按钮');
        return false;
    } catch (e) {
        logger.error('打招呼异常:', e.message);
        return false;
    }
}

/**
 * 尝试在弹出的聊天窗口中发送招呼语
 */
async function trySendGreetingMessage(greeting) {
    // 等待聊天框弹出
    await sleep(randomInt(500, 1000));

    // 尝试查找消息输入框
    const inputSelectors = [
        '.chat-input textarea',
        '.input-area textarea',
        '[class*="chat"] textarea',
        '[class*="message"] textarea',
        '.edit-area textarea',
        'textarea[name="msg"]',
    ];

    for (const sel of inputSelectors) {
        const input = document.querySelector(sel);
        if (input) {
            // 模拟输入
            input.value = greeting;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            await sleep(randomInt(300, 600));

            // 发送
            const sendSelectors = [
                '.btn-send',
                '[class*="send-btn"]',
                'button[type="submit"]',
                '.chat-op .btn-sure',
            ];
            for (const sendSel of sendSelectors) {
                const sendBtn = document.querySelector(sendSel);
                if (sendBtn) {
                    sendBtn.click();
                    await sleep(500);
                    return true;
                }
            }

            // 尝试 Enter 键发送
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            await sleep(500);
            return true;
        }
    }

    // 如果没有弹出输入框，可能点击按钮就直接发送了默认打招呼消息
    logger.info('未检测到消息输入框，可能已直接发送默认招呼');
    return true;
}

// ====== 辅助函数 ======

function findCardElement(target) {
    if (target.encryptGeekId) {
        // 优先通过新写入的持久化属性查找
        const cardById = document.querySelector(`[data-bh-id="${target.encryptGeekId}"]`);
        if (cardById) return cardById;

        // 原有的通过链接兜底查找寻找卡片
        const link = document.querySelector(`a[href*="${target.encryptGeekId}"]`);
        if (link) {
            return link.closest('[class*="card"], li');
        }
    }
    // 最后如果都没找到，按名字查找卡片
    const allCards = document.querySelectorAll('[class*="card-item"], [class*="recommend-card"], .card-list > li');
    for (const card of allCards) {
        if (card.textContent.includes(target.name)) {
            return card;
        }
    }
    return null;
}

function findGreetButton(card) {
    const btnSelectors = [
        '.start-chat-btn',
        '.btn-greet',
        '.button-chat',
        '[class*="greet"]',
        '[class*="chat-btn"]',
        'button[ka*="greet"]',
    ];
    for (const sel of btnSelectors) {
        const btn = card.querySelector(sel);
        if (btn && !btn.disabled && btn.offsetParent !== null) return btn;
    }
    return null;
}

/**
 * 渲染招呼语模板
 */
function renderGreeting(target, config) {
    const template = randomPick(config.greetingTemplates) || '你好，期待与您沟通！';

    return template
        .replace(/\{name\}/g, target.name || '')
        .replace(/\{school\}/g, target.school || '')
        .replace(/\{title\}/g, target.title || '')
        .replace(/\{experience\}/g, target.experience || '')
        .replace(/\{city\}/g, target.city || '');
}

/**
 * 滚动加载更多
 */
function scrollToLoadMore() {
    const allCards = document.querySelectorAll('[class*="card-item"], [class*="recommend-card"], .card-list > li');
    if (allCards.length > 0) {
        const lastCard = allCards[allCards.length - 1];
        lastCard.scrollIntoView({ behavior: 'smooth', block: 'end' });
    } else {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }

    setTimeout(() => {
        const loadMoreSelectors = [
            '.load-more',
            '.btn-loadmore',
            '[class*="load-more"]',
            '[class*="loadmore"]',
        ];
        for (const sel of loadMoreSelectors) {
            const btn = document.querySelector(sel);
            if (btn) {
                btn.click();
                return;
            }
        }
    }, 1500);
}
