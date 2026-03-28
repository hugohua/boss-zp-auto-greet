/**
 * 打招呼核心模块
 * 节奏控制、招呼语模板渲染、打招呼执行
 */

import {
    logger, randomInterval, randomPick, chance, sleep, randomInt,
    describeScrollContainer, findScrollableContainer, getScrollMetrics, isDocumentScrollContainer,
    scrollContainerBy, scrollContainerTo,
} from './utils.js';
import { getConfig, incrementCount, isLimitReached, addRecord } from './config.js';
import {
    safetyCheck, recordFailure, recordSuccess,
    simulateScrollToElement, simulateMouseMoveToElement,
    isCircuitBroken,
} from './anti-detect.js';
import { getUngreetedTargets, markGreeted, filterByDOM } from './filter.js';

// ====== 状态 ======
let isRunning = false;
let shouldStop = false;
let consecutiveCount = 0; // 连续操作计数
let emptyLoadMoreAttempts = 0;
let onStatusChange = null;
const MAX_EMPTY_LOAD_MORE_ATTEMPTS = 5;
const RECOMMEND_CARD_SELECTOR = '.candidate-card-wrap, [class*="card-item"], [class*="recommend-card"], .card-list > li';
const RECOMMEND_SCROLL_CONTAINER_SELECTORS = [
    '.list-body',
    '#recommend-list',
    '.card-list-wrap',
    '.recommend-list-wrap',
    '.candidate-body',
];

/**
 * 可中断的 sleep：每 500ms 检查一次 shouldStop 标志
 * 停止按钮点击后最多 500ms 即可响应
 */
async function interruptibleSleep(ms) {
    const step = 500;
    let elapsed = 0;
    while (elapsed < ms && !shouldStop) {
        await sleep(Math.min(step, ms - elapsed));
        elapsed += step;
    }
}

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
    emptyLoadMoreAttempts = 0;

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
                const nextAttempt = emptyLoadMoreAttempts + 1;
                logger.info(`尝试加载更多候选人... (${nextAttempt}/${MAX_EMPTY_LOAD_MORE_ATTEMPTS})`);
                const loadedMore = await scrollToLoadMore();
                if (shouldStop) break;

                // 主动触发一次基于 DOM 的扫描提取，作为新数据拦截兜底
                filterByDOM({ notify: false });

                const newTargets = getUngreetedTargets();
                if (newTargets.length > 0) {
                    emptyLoadMoreAttempts = 0;
                    logger.info('向下翻页成功，提取到新的待致意卡片');
                    continue;
                }

                emptyLoadMoreAttempts += 1;

                if (!loadedMore) {
                    logger.info('滚动后未检测到新增卡片或分页内容');
                }

                if (hasRecommendListReachedEnd()) {
                    logger.info('推荐列表已显示没有更多了，停止当前循环');
                    break;
                }

                if (emptyLoadMoreAttempts < MAX_EMPTY_LOAD_MORE_ATTEMPTS) {
                    logger.info(
                        `当前页未发现目标候选人，继续尝试下一页 `
                        + `(${emptyLoadMoreAttempts}/${MAX_EMPTY_LOAD_MORE_ATTEMPTS})`,
                    );
                    await interruptibleSleep(randomInt(800, 1500));
                    continue;
                }

                logger.info(`连续 ${MAX_EMPTY_LOAD_MORE_ATTEMPTS} 次翻页后仍未发现目标候选人，停止当前循环`);
                break;
            }
            break;
        }

        emptyLoadMoreAttempts = 0;

        // 4. 随机跳过（风控模拟挑选行为）
        if (chance(config.skipProbability)) {
            logger.info('随机跳过本次（模拟挑选行为）');
            await interruptibleSleep(randomInt(1000, 3000));
            continue;
        }

        // 5. 选择第一个目标（按顺序而非随机，更接近真人浏览）
        const target = targets[0];

        // 6. 模拟行为：滚动 → 鼠标移动 → 等待 → 点击
        const card = findCardElement(target);
        if (card) {
            simulateScrollToElement(card);
            await interruptibleSleep(randomInt(500, 1500));
            if (shouldStop) break;
            const btn = findGreetButton(card);
            if (btn) {
                simulateMouseMoveToElement(btn);
                await interruptibleSleep(randomInt(300, 800));
                if (shouldStop) break;
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
            await interruptibleSleep(restTime);
            if (shouldStop) break;
            continue;
        }

        // 9. 随机间隔等待
        const interval = randomInterval(config.greetInterval * 1000, 0.4);
        logger.info(`等待 ${(interval / 1000).toFixed(1)} 秒后继续...`);
        await interruptibleSleep(interval);
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
    const allCards = document.querySelectorAll('.candidate-card-wrap, [class*="card-item"], [class*="recommend-card"], .card-list > li');
    for (const card of allCards) {
        if (card.textContent.includes(target.name)) {
            return card;
        }
    }
    return null;
}

function findGreetButton(card) {
    const btnSelectors = [
        'button.btn-greet',
        '.start-chat-btn',
        '.btn-greet',
        '.button-chat',
        '[class*="greet"]',
        '[class*="chat-btn"]',
        'button[ka*="greet"]',
    ];
    for (const sel of btnSelectors) {
        const btn = card.querySelector(sel);
        // 不检查 offsetParent，BOSS直聘的按钮在非 hover 状态可能不可见但仍可点击
        if (btn && !btn.disabled) return btn;
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

function getRecommendCards() {
    return Array.from(document.querySelectorAll(RECOMMEND_CARD_SELECTOR));
}

function getRecommendScrollContainer(lastCard = null) {
    return findScrollableContainer(
        lastCard || document.querySelector('.card-list') || document.querySelector('.candidate-card-wrap'),
        RECOMMEND_SCROLL_CONTAINER_SELECTORS,
    );
}

function getRecommendSnapshot(container) {
    const metrics = getScrollMetrics(container);
    return {
        cardCount: getRecommendCards().length,
        scrollTop: metrics.scrollTop,
        clientHeight: metrics.clientHeight,
        scrollHeight: metrics.scrollHeight,
    };
}

function hasRecommendListChanged(before, after) {
    return after.cardCount > before.cardCount || after.scrollHeight > before.scrollHeight + 20;
}

function hasRecommendListReachedEnd() {
    const endSelectors = [
        '.finished-wrap',
        '[class*="finished"]',
        '[class*="no-more"]',
        '[class*="empty"]',
    ];
    const endPattern = /没有更多|已经到底|到底了|暂无更多/;

    return endSelectors.some((sel) => {
        const el = document.querySelector(sel);
        return !!el && endPattern.test(el.textContent || '');
    });
}

function clickLoadMoreButton() {
    const loadMoreSelectors = [
        '.load-more',
        '.btn-loadmore',
        '[class*="load-more"]',
        '[class*="loadmore"]',
    ];

    for (const sel of loadMoreSelectors) {
        const btn = document.querySelector(sel);
        if (btn && !btn.disabled) {
            btn.click();
            logger.info(`尝试点击加载更多按钮: ${sel}`);
            return true;
        }
    }

    return false;
}

async function waitForRecommendListGrowth(before, container, timeoutMs) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline && !shouldStop) {
        await sleep(250);
        const after = getRecommendSnapshot(container);
        if (hasRecommendListChanged(before, after)) {
            return after;
        }
    }

    return null;
}

async function scrollPageToLoadMore() {
    const pageContainer = document.scrollingElement || document.documentElement || document.body;
    const before = getRecommendSnapshot(pageContainer);
    const targetTop = Math.max(
        before.scrollHeight,
        document.body?.scrollHeight || 0,
        document.documentElement?.scrollHeight || 0,
    );

    logger.info(
        `内部列表滚动未触发加载，回退到整页滚动: 容器=${describeScrollContainer(pageContainer)}, `
        + `scrollTop=${before.scrollTop}, scrollHeight=${before.scrollHeight}`,
    );

    if (typeof window.scrollTo === 'function') {
        window.scrollTo(0, targetTop);
        window.dispatchEvent(new Event('scroll'));
    } else {
        scrollContainerTo(pageContainer, targetTop);
    }

    await interruptibleSleep(3000);
    if (shouldStop) return false;

    const clickedLoadMore = clickLoadMoreButton();
    const after = await waitForRecommendListGrowth(before, pageContainer, clickedLoadMore ? 5000 : 3500);
    if (after) {
        logger.info(
            `整页滚动加载成功: cards ${before.cardCount} -> ${after.cardCount}, `
            + `scrollHeight ${before.scrollHeight} -> ${after.scrollHeight}`,
        );
        return true;
    }

    return false;
}

/**
 * 滚动加载更多
 */
export async function scrollToLoadMore() {
    if (hasRecommendListReachedEnd()) {
        logger.info('检测到推荐列表已无更多数据，停止继续滚动');
        return false;
    }

    const cards = getRecommendCards();
    const lastCard = cards.length > 0 ? cards[cards.length - 1] : null;
    const container = getRecommendScrollContainer(lastCard);
    const before = getRecommendSnapshot(container);

    logger.info(
        `加载更多: 容器=${describeScrollContainer(container)}, cards=${before.cardCount}, `
        + `scrollTop=${before.scrollTop}, scrollHeight=${before.scrollHeight}`,
    );

    const metrics = getScrollMetrics(container);
    const scrollTargets = [];
    const incrementalTarget = Math.min(
        metrics.scrollHeight,
        metrics.scrollTop + Math.max(Math.floor(metrics.clientHeight * 0.9), 420),
    );
    const bottomTarget = Math.max(0, metrics.scrollHeight - metrics.clientHeight);

    if (incrementalTarget > metrics.scrollTop + 8) {
        scrollTargets.push(incrementalTarget);
    }
    if (bottomTarget > metrics.scrollTop + 8 && bottomTarget !== incrementalTarget) {
        scrollTargets.push(bottomTarget);
    }

    if (lastCard && typeof lastCard.scrollIntoView === 'function') {
        lastCard.scrollIntoView({ behavior: 'smooth', block: 'end' });
        const afterScrollIntoView = await waitForRecommendListGrowth(before, container, 900);
        if (afterScrollIntoView) {
            logger.info(
                `加载更多成功: cards ${before.cardCount} -> ${afterScrollIntoView.cardCount}, `
                + `scrollHeight ${before.scrollHeight} -> ${afterScrollIntoView.scrollHeight}`,
            );
            return true;
        }
    }

    let clickedLoadMore = false;

    for (const targetTop of scrollTargets) {
        if (shouldStop) return false;

        scrollContainerTo(container, targetTop);
        await interruptibleSleep(randomInt(700, 1100));
        if (shouldStop) return false;

        clickedLoadMore = clickLoadMoreButton() || clickedLoadMore;

        const after = await waitForRecommendListGrowth(before, container, clickedLoadMore ? 1200 : 700);
        if (after) {
            logger.info(
                `加载更多成功: cards ${before.cardCount} -> ${after.cardCount}, `
                + `scrollHeight ${before.scrollHeight} -> ${after.scrollHeight}`,
            );
            return true;
        }
    }

    if (!scrollTargets.length && metrics.clientHeight > 0) {
        scrollContainerBy(container, Math.max(Math.floor(metrics.clientHeight * 0.8), 360));
        await interruptibleSleep(randomInt(700, 1100));
        if (shouldStop) return false;
    }

    clickedLoadMore = clickLoadMoreButton() || clickedLoadMore;

    const finalAfter = await waitForRecommendListGrowth(before, container, clickedLoadMore ? 5000 : 3500);
    if (finalAfter) {
        logger.info(
            `加载更多成功: cards ${before.cardCount} -> ${finalAfter.cardCount}, `
            + `scrollHeight ${before.scrollHeight} -> ${finalAfter.scrollHeight}`,
        );
        return true;
    }

    if (!isDocumentScrollContainer(container)) {
        const pageLoaded = await scrollPageToLoadMore();
        if (pageLoaded) return true;
    }

    const current = getRecommendSnapshot(container);
    logger.info(
        `加载更多未生效: 容器=${describeScrollContainer(container)}, cards=${current.cardCount}, `
        + `scrollTop=${current.scrollTop}, scrollHeight=${current.scrollHeight}`,
    );
    return false;
}
