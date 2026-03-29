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
import { getUngreetedTargets, markGreeted, filterByDOM, getRecommendApiLoadSeq } from './filter.js';

// ====== 状态 ======
let isRunning = false;
let shouldStop = false;
let consecutiveCount = 0; // 连续操作计数
let emptyLoadMoreAttempts = 0;
let unresolvedTargetPasses = 0;
const statusChangeListeners = new Set();
const MAX_EMPTY_LOAD_MORE_ATTEMPTS = 5;
const MAX_UNRESOLVED_TARGET_PASSES = 3;
const RECOMMEND_CARD_SELECTOR = '.candidate-card-wrap, [class*="card-item"], [class*="recommend-card"], .card-list > li';
const RECOMMEND_SCROLL_CONTAINER_SELECTORS = [
    '.list-body',
    '#recommend-list',
    '.card-list-wrap',
    '.recommend-list-wrap',
    '.candidate-body',
];
const GREET_BUTTON_TEXT_PATTERN = /^(打招呼|立即沟通|立即开聊|开聊|聊一聊)$/;
const GREET_BUTTON_WAIT_OPTIONS = {
    attempts: 5,
    delayMs: 250,
    observeTimeoutMs: 1200,
};

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
    if (typeof cb !== 'function') return () => {};

    statusChangeListeners.add(cb);
    return () => {
        statusChangeListeners.delete(cb);
    };
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
    unresolvedTargetPasses = 0;

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
    statusChangeListeners.forEach((listener) => {
        listener({ running: isRunning });
    });
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
            unresolvedTargetPasses = 0;
            logger.info('当前无未打招呼的目标候选人');
            // 尝试滚动加载更多
            if (config.autoLoadMore) {
                const nextAttempt = emptyLoadMoreAttempts + 1;
                const apiSeqBeforeLoadMore = getRecommendApiLoadSeq();
                logger.info(`尝试触发更多候选人加载... (${nextAttempt}/${MAX_EMPTY_LOAD_MORE_ATTEMPTS})`);
                const loadedMore = await scrollToLoadMore();
                if (shouldStop) break;

                // 主动触发一次基于 DOM 的扫描提取，作为新数据拦截兜底
                filterByDOM({ notify: false });

                const apiAdvanced = getRecommendApiLoadSeq() > apiSeqBeforeLoadMore;
                const newTargets = getUngreetedTargets();
                if (newTargets.length > 0) {
                    emptyLoadMoreAttempts = 0;
                    if (apiAdvanced) {
                        logger.info('候选人列表接口已返回新一页数据，发现新的待致意卡片');
                    } else if (loadedMore) {
                        logger.info('推荐列表已加载到新的候选人内容，发现新的待致意卡片');
                    } else {
                        logger.info('重新扫描后发现新的待致意卡片');
                    }
                    continue;
                }

                if (apiAdvanced || loadedMore) {
                    emptyLoadMoreAttempts = 0;
                    if (apiAdvanced) {
                        logger.info('候选人列表接口已返回新一页数据，但暂未发现未打招呼的目标候选人');
                    } else {
                        logger.info('推荐列表出现了新的候选人内容，但暂未发现未打招呼的目标候选人');
                    }
                    await interruptibleSleep(randomInt(800, 1500));
                    continue;
                }

                if (hasRecommendListReachedEnd()) {
                    logger.info('推荐列表已显示没有更多了，停止当前循环');
                    break;
                }

                if (document.hidden && config.runInBackground) {
                    logger.info('后台页本次未检测到新的候选人内容，可能被浏览器节流；本次不计入连续失败次数');
                    await interruptibleSleep(randomInt(4000, 7000));
                    continue;
                }

                emptyLoadMoreAttempts += 1;
                logger.info('本次未检测到新的候选人内容（未触发候选人列表接口或列表未增长）');

                if (emptyLoadMoreAttempts < MAX_EMPTY_LOAD_MORE_ATTEMPTS) {
                    logger.info(
                        `当前未加载到下一页候选人内容，继续重试 `
                        + `(${emptyLoadMoreAttempts}/${MAX_EMPTY_LOAD_MORE_ATTEMPTS})`,
                    );
                    await interruptibleSleep(randomInt(800, 1500));
                    continue;
                }

                logger.info(`连续 ${MAX_EMPTY_LOAD_MORE_ATTEMPTS} 次加载更多尝试均未触发新的候选人内容，停止当前循环`);
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

        // 5. 优先选择当前 DOM 中已进入可操作状态的目标候选人
        const actionContext = await resolveActionableTarget(targets);
        if (!actionContext) {
            unresolvedTargetPasses += 1;
            logger.warn(
                `本轮未定位到可操作的目标候选人，先等待页面稳定后重试 `
                + `(${unresolvedTargetPasses}/${MAX_UNRESOLVED_TARGET_PASSES})`,
            );
            filterByDOM({ notify: false });

            if (unresolvedTargetPasses >= MAX_UNRESOLVED_TARGET_PASSES) {
                recordFailure('连续未定位到可操作目标或打招呼按钮');
                unresolvedTargetPasses = 0;
                if (isCircuitBroken()) break;
            }

            await interruptibleSleep(randomInt(800, 1500));
            continue;
        }
        unresolvedTargetPasses = 0;

        const { target, card, greetButton } = actionContext;

        // 6. 模拟行为：滚动 → 鼠标移动 → 等待 → 点击
        simulateScrollToElement(card);
        await interruptibleSleep(randomInt(500, 1500));
        if (shouldStop) break;

        const activeButton = greetButton || await waitForGreetButton(card, GREET_BUTTON_WAIT_OPTIONS);
        if (activeButton) {
            simulateMouseMoveToElement(activeButton);
            await interruptibleSleep(randomInt(300, 800));
            if (shouldStop) break;
        }

        // 7. 执行打招呼
        const greeting = renderGreeting(target, config);
        const success = await performGreeting(target, greeting, card, activeButton);

        if (isCircuitBroken()) {
            logger.warn('本轮打招呼过程中触发熔断，停止当前循环');
            break;
        }

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
async function performGreeting(target, greeting, card, preResolvedButton = null) {
    try {
        // 方式1：找到打招呼按钮并点击
        if (card) {
            const btn = preResolvedButton || await waitForGreetButton(card, GREET_BUTTON_WAIT_OPTIONS);
            if (btn) {
                btn.click();
                await sleep(randomInt(800, 1500));
                if (isCircuitBroken()) return false;

                // 检查是否弹出了聊天窗口/消息输入框，需要发送招呼语
                const sent = await trySendGreetingMessage(greeting);
                return sent;
            }
        }

        // 方式2：如果卡片上没找到按钮，尝试通过页面全局查找
        if (!card) {
            logger.warn(`未找到候选人卡片: ${formatTargetIdentity(target)}`);
        } else {
            logger.warn(buildMissingGreetButtonLog(target, card));
        }
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

function formatTargetIdentity(target) {
    const name = target?.name || '未知';
    const school = target?.school || '未知院校';
    const key = target?.encryptGeekId || target?.geekId || 'no-id';
    return `${name}/${school}/${key}`;
}

function describeElementBriefly(el) {
    if (!el || !el.tagName) return 'unknown';
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const classNames = typeof el.className === 'string'
        ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 3)
        : [];
    return `${tag}${id}${classNames.length ? `.${classNames.join('.')}` : ''}`;
}

function getCardPreview(card, maxLength = 80) {
    const text = String(card?.innerText || card?.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function collectActionCandidateSummary(card, limit = 6) {
    const actionCandidates = [];
    const seen = new Set();

    for (const root of getGreetSearchRoots(card)) {
        const elements = root?.querySelectorAll?.('button, a, [role="button"]') || [];
        for (const el of elements) {
            if (seen.has(el)) continue;
            seen.add(el);

            const text = String(el.textContent || '').replace(/\s+/g, '');
            const ka = el.getAttribute?.('ka') || '';
            actionCandidates.push([
                describeElementBriefly(el),
                text ? `text=${text}` : '',
                ka ? `ka=${ka}` : '',
            ].filter(Boolean).join(' '));

            if (actionCandidates.length >= limit) {
                return actionCandidates.join(', ');
            }
        }
    }

    return actionCandidates.join(', ') || 'none';
}

function buildMissingGreetButtonLog(target, card) {
    const preview = getCardPreview(card);
    const actionSummary = collectActionCandidateSummary(card);
    const previewText = preview ? `, preview=${preview}` : '';
    return `未找到打招呼按钮: target=${formatTargetIdentity(target)}, card=${describeElementBriefly(card)}${previewText}, actions=${actionSummary}`;
}

function isAvailableActionElement(el) {
    if (!el) return false;
    if (el.disabled) return false;
    if (el.getAttribute?.('aria-disabled') === 'true') return false;
    return true;
}

function getGreetSearchRoots(card) {
    const roots = [];
    const visited = new Set();

    const pushRoot = (el) => {
        if (!el || visited.has(el)) return;
        visited.add(el);
        roots.push(el);
    };

    pushRoot(card);
    pushRoot(card?.closest?.('.card-item'));
    pushRoot(card?.closest?.('[class*="card-item"]'));
    pushRoot(card?.closest?.('.recommend-card-wrap'));
    pushRoot(card?.closest?.('[class*="recommend-card"]'));
    pushRoot(card?.closest?.('li'));

    return roots;
}

function findGreetButton(card) {
    const btnSelectors = [
        'button.btn-greet',
        '.start-chat-btn',
        '.btn-greet',
        '.btn-startchat',
        '.btn-chat',
        '.btn-chat-now',
        '.op-btn',
        '.op-btn-chat',
        '.button-chat',
        '[class*="greet"]',
        '[class*="chat-btn"]',
        '[class*="start-chat"]',
        '[class*="startchat"]',
        'button[ka*="greet"]',
        '[ka*="greet"]',
        '[ka*="chat"]',
    ];

    const searchRoots = getGreetSearchRoots(card);
    for (const root of searchRoots) {
        for (const sel of btnSelectors) {
            const btn = root?.querySelector?.(sel);
            // 不检查 offsetParent，BOSS直聘的按钮在非 hover 状态可能不可见但仍可点击
            if (isAvailableActionElement(btn)) return btn;
        }

        const textCandidates = root?.querySelectorAll?.('button, a, [role="button"]') || [];
        for (const candidate of textCandidates) {
            const text = (candidate.textContent || '').replace(/\s+/g, '');
            if (!text) continue;
            if (!GREET_BUTTON_TEXT_PATTERN.test(text)) continue;
            if (!isAvailableActionElement(candidate)) continue;
            return candidate;
        }
    }

    return null;
}

function triggerCardHover(card) {
    const roots = getGreetSearchRoots(card);
    const hoverTargets = roots.length > 0 ? roots : [card];

    hoverTargets.forEach((target) => {
        if (!target) return;

        try {
            target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true }));
            target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
            simulateMouseMoveToElement(target);
        } catch (e) {
            // 忽略 hover 事件失败，继续重试查找
        }
    });
}

async function waitForGreetButton(card, options = {}) {
    const {
        attempts = 4,
        delayMs = 250,
        observeTimeoutMs = 0,
    } = options;
    if (!card) return null;

    for (let index = 0; index < attempts; index++) {
        const btn = findGreetButton(card);
        if (btn) return btn;

        triggerCardHover(card);
        if (index < attempts - 1) {
            await sleep(delayMs);
        }
    }

    if (observeTimeoutMs > 0) {
        const observed = await observeGreetButton(card, observeTimeoutMs);
        if (observed) return observed;
    }

    return findGreetButton(card);
}

async function observeGreetButton(card, timeoutMs) {
    if (!card || timeoutMs <= 0 || typeof MutationObserver === 'undefined') {
        return findGreetButton(card);
    }

    const searchRoots = getGreetSearchRoots(card).filter(Boolean);
    if (searchRoots.length === 0) return findGreetButton(card);

    return new Promise((resolve) => {
        let settled = false;
        let timer = null;
        let observer = null;

        const finish = (btn) => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            if (observer) observer.disconnect();
            resolve(btn || null);
        };

        const checkButton = () => {
            const btn = findGreetButton(card);
            if (btn) {
                finish(btn);
                return true;
            }
            triggerCardHover(card);
            return false;
        };

        observer = new MutationObserver(() => {
            checkButton();
        });

        searchRoots.forEach((root) => {
            if (!root?.isConnected) return;
            observer.observe(root, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class', 'style', 'disabled', 'aria-disabled'],
            });
        });

        if (checkButton()) return;

        timer = setTimeout(() => {
            finish(findGreetButton(card));
        }, timeoutMs);
    });
}

async function resolveActionableTarget(targets) {
    const missingCards = [];
    const missingButtons = [];

    for (const target of targets) {
        const card = findCardElement(target);
        if (!card) {
            missingCards.push(formatTargetIdentity(target));
            continue;
        }

        const greetButton = await waitForGreetButton(card, GREET_BUTTON_WAIT_OPTIONS);
        if (greetButton) {
            return { target, card, greetButton };
        }

        missingButtons.push(buildMissingGreetButtonLog(target, card));
    }

    if (missingCards.length > 0) {
        logger.warn(`以下目标候选人当前未定位到卡片: ${missingCards.slice(0, 5).join(' | ')}`);
    }
    if (missingButtons.length > 0) {
        logger.warn(missingButtons.slice(0, 3).join(' | '));
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

function getLoadMoreScrollBehavior() {
    return document.hidden ? 'auto' : 'smooth';
}

async function retryLoadMoreFromListBottom(before, container, metrics, behavior) {
    const maxScrollTop = Math.max(0, metrics.scrollHeight - metrics.clientHeight);
    if (maxScrollTop <= 0) return false;

    const retreatDistance = Math.max(Math.floor(metrics.clientHeight * 0.35), 240);
    const retreatTop = Math.max(0, maxScrollTop - retreatDistance);
    if (metrics.scrollTop <= retreatTop + 8) return false;

    logger.info(
        `当前已接近列表底部，尝试回弹后再次触发加载: scrollTop ${metrics.scrollTop} -> ${retreatTop} -> ${maxScrollTop}`,
    );

    scrollContainerTo(container, retreatTop, behavior);
    await interruptibleSleep(randomInt(350, 650));
    if (shouldStop) return false;

    scrollContainerTo(container, maxScrollTop, behavior);
    await interruptibleSleep(randomInt(700, 1100));
    if (shouldStop) return false;

    const clickedLoadMore = clickLoadMoreButton();
    const after = await waitForRecommendListGrowth(before, container, clickedLoadMore ? 1800 : 1200);
    if (after) {
        logger.info(
            `加载更多成功: cards ${before.cardCount} -> ${after.cardCount}, `
            + `scrollHeight ${before.scrollHeight} -> ${after.scrollHeight}`,
        );
        return true;
    }

    return false;
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
    const scrollBehavior = getLoadMoreScrollBehavior();
    const scrollTargets = [];
    const maxScrollTop = Math.max(0, metrics.scrollHeight - metrics.clientHeight);
    const incrementalTarget = Math.min(
        maxScrollTop,
        metrics.scrollTop + Math.max(Math.floor(metrics.clientHeight * 0.9), 420),
    );
    const bottomTarget = maxScrollTop;

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

        scrollContainerTo(container, targetTop, scrollBehavior);
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

    if (metrics.scrollTop >= maxScrollTop - 8) {
        const bounced = await retryLoadMoreFromListBottom(before, container, metrics, scrollBehavior);
        if (bounced) return true;
    }

    if (!scrollTargets.length && metrics.clientHeight > 0) {
        scrollContainerBy(container, Math.max(Math.floor(metrics.clientHeight * 0.8), 360), scrollBehavior);
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
