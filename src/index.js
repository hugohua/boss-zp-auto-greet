/**
 * BOSS直聘智能招呼助手 — 入口模块
 * 组装各模块并初始化
 * 支持推荐页和聊天页的目标院校高亮
 */

import { loadConfig } from './config.js';
import { describeScrollContainer, findScrollableContainer, isDocumentScrollContainer, logger } from './utils.js';
import { installApmInterceptor, setupVipObserver, syncBehaviorSimulation } from './anti-detect.js';
import { installApiInterceptor, setOnCandidatesUpdated, setOnChatGeekInfoUpdated, filterByDOM, filterChatListByDOM, highlightConversationPanel } from './filter.js';
import { isGreetingRunning, setOnStatusChange, startAutoGreeting, stopAutoGreeting } from './greeting.js';
import { injectStyles } from './ui/styles.js';
import { createPanel, refreshStats } from './ui/panel.js';

// 模块级初始化标志，防止重复初始化（避免 DOM 检查的竞态条件）
let initialized = false;
let currentPageMode = null;
let routeWatcherTimer = null;
let visibilityListenerBound = false;
let recommendObserver = null;
let recommendObserverRetryTimer = null;
let recommendPanelRetryTimer = null;
let recommendScrollBindTimer = null;
let recommendScrollHandler = null;
let recommendScrollContainer = null;
let recommendScanningActive = false;
let chatObserver = null;
let chatObserverRetryTimer = null;
let chatScrollHandler = null;
let candidateRescanTimer = null;
let chatListRefreshTimer = null;
let modeScanTimers = [];
let backgroundHeartbeatTimer = null;
let shouldResumeGreetingOnRecommendReturn = false;
let resumeGreetingRetryTimer = null;
const ROUTE_WATCH_INTERVAL_MS = 250;
const BACKGROUND_HEARTBEAT_INTERVAL_MS = 15000;
const CHAT_PAGE_DOM_SELECTORS = [
    '.conversation-main',
    '.chat-conversation',
    '.user-list',
    '.chat-list',
    '[class*="friend-list"]',
];
const RECOMMEND_PAGE_DOM_SELECTORS = [
    '.candidate-body',
    '.card-list',
    '.recommend-list-wrap',
    '.candidate-card-wrap',
    '.similar-geek-wrap',
];
const RECOMMEND_SCROLL_CONTAINER_SELECTORS = [
    '.list-body',
    '#recommend-list',
    '.card-list-wrap',
    '.recommend-list-wrap',
    '.candidate-body',
];

// 防抖工具
function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

function isChatUrl(url = '') {
    return url.includes('/web/chat/') && !url.includes('/recommend') && !url.includes('/frame/');
}

function isRecommendUrl(url = '') {
    return url.includes('/recommend');
}

function readWindowLocationSnapshot(targetWindow) {
    try {
        const targetLocation = targetWindow?.location;
        if (!targetLocation) {
            return { pathname: '', href: '' };
        }
        return {
            pathname: String(targetLocation.pathname || ''),
            href: String(targetLocation.href || targetLocation.pathname || ''),
        };
    } catch (e) {
        return { pathname: '', href: '' };
    }
}

function getObservedLocationSnapshots() {
    const currentSnapshot = readWindowLocationSnapshot(window);
    const snapshots = [currentSnapshot];
    const topSnapshot = readWindowLocationSnapshot(window.top);

    if (
        (topSnapshot.href || topSnapshot.pathname) &&
        (topSnapshot.href !== currentSnapshot.href || topSnapshot.pathname !== currentSnapshot.pathname)
    ) {
        snapshots.push(topSnapshot);
    }

    return snapshots;
}

function hasAnyDomMarker(selectors) {
    return selectors.some((selector) => !!document.querySelector(selector));
}

function hasRecommendPageDom() {
    return hasAnyDomMarker(RECOMMEND_PAGE_DOM_SELECTORS);
}

function syncBodyModeClass(mode) {
    if (!document.body) return;

    document.body.classList.toggle('bh-chat-mode', mode === 'chat');
    document.body.classList.toggle('bh-recommend-mode', mode === 'recommend');
}

function detectPageMode() {
    const snapshots = getObservedLocationSnapshots();
    const currentSnapshot = snapshots[0] || { pathname: '', href: '' };
    const hasChatDom = hasAnyDomMarker(CHAT_PAGE_DOM_SELECTORS);
    const hasRecommendDom = hasAnyDomMarker(RECOMMEND_PAGE_DOM_SELECTORS);
    const hasCurrentChatUrl = isChatUrl(currentSnapshot.pathname) || isChatUrl(currentSnapshot.href);
    const hasCurrentRecommendUrl = isRecommendUrl(currentSnapshot.pathname) || isRecommendUrl(currentSnapshot.href);
    const hasObservedChatUrl = snapshots.some(({ pathname, href }) => isChatUrl(pathname) || isChatUrl(href));
    const hasObservedRecommendUrl = snapshots.some(({ pathname, href }) => isRecommendUrl(pathname) || isRecommendUrl(href));

    // DOM 已经切页但 SPA URL 还没跟上的时候，以当前文档结构为准。
    if (hasChatDom && !hasRecommendDom) return 'chat';
    if (hasRecommendDom && !hasChatDom) return 'recommend';

    if (hasCurrentChatUrl) return 'chat';
    if (hasCurrentRecommendUrl) return 'recommend';

    if (hasObservedChatUrl && !hasRecommendDom) return 'chat';
    if (hasObservedRecommendUrl && !hasChatDom) return 'recommend';

    if (hasChatDom) return 'chat';
    if (hasRecommendDom) return 'recommend';

    return currentPageMode || 'recommend';
}

function isChatPage() {
    return detectPageMode() === 'chat';
}

function getRouteWatchKey() {
    const routeParts = getObservedLocationSnapshots()
        .map(({ href, pathname }) => href || pathname)
        .filter(Boolean);
    return Array.from(new Set(routeParts)).join(' | ') || 'unknown';
}

function scheduleRecommendPanelEnsure(delay = 0) {
    if (delay <= 0 && currentPageMode === 'recommend' && hasRecommendPageDom()) {
        createPanel();
        if (recommendPanelRetryTimer) {
            clearTimeout(recommendPanelRetryTimer);
            recommendPanelRetryTimer = null;
        }
        return;
    }

    if (recommendPanelRetryTimer) {
        clearTimeout(recommendPanelRetryTimer);
        recommendPanelRetryTimer = null;
    }

    recommendPanelRetryTimer = setTimeout(() => {
        if (currentPageMode !== 'recommend') return;

        if (hasRecommendPageDom()) {
            createPanel();
            recommendPanelRetryTimer = null;
            return;
        }

        scheduleRecommendPanelEnsure(300);
    }, delay);
}

function clearModeScanTimers(mode) {
    modeScanTimers = modeScanTimers.filter((entry) => {
        if (mode && entry.mode !== mode) return true;
        clearTimeout(entry.timerId);
        return false;
    });
}

function stopBackgroundHeartbeat() {
    if (!backgroundHeartbeatTimer) return;
    clearInterval(backgroundHeartbeatTimer);
    backgroundHeartbeatTimer = null;
}

function startBackgroundHeartbeat() {
    if (backgroundHeartbeatTimer) return;

    backgroundHeartbeatTimer = setInterval(() => {
        if (!document.hidden) {
            stopBackgroundHeartbeat();
            return;
        }

        if (currentPageMode !== 'recommend' || !recommendScanningActive || !isGreetingRunning()) {
            return;
        }

        scanCurrentPage('background-heartbeat');
    }, BACKGROUND_HEARTBEAT_INTERVAL_MS);
}

function isRelevantRecommendListNode(node) {
    if (!node || node.nodeType !== 1) return false;
    return node.matches?.('.card-item, .candidate-card-wrap, .similar-geek-wrap') ||
        node.querySelector?.('.candidate-card-wrap, .similar-geek-wrap');
}

function isRelevantChatListNode(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.matches?.('.bh-card-label, .bh-chat-school-label')) return false;
    return node.matches?.('[role="listitem"], .geek-item-wrap, .geek-item, [data-id]') ||
        node.querySelector?.('[role="listitem"], .geek-item-wrap, .geek-item, [data-id]');
}

function bindRecommendScrollContainer(baseElement = null) {
    if (!recommendScrollHandler) return;

    const rawContainer = findScrollableContainer(
        baseElement || document.querySelector('.card-list') || document.querySelector('.candidate-card-wrap'),
        RECOMMEND_SCROLL_CONTAINER_SELECTORS,
    );
    const nextContainer = isDocumentScrollContainer(rawContainer) ? null : rawContainer;

    if (recommendScrollContainer === nextContainer) return;

    if (recommendScrollContainer) {
        recommendScrollContainer.removeEventListener('scroll', recommendScrollHandler);
    }

    recommendScrollContainer = nextContainer;

    if (recommendScrollContainer) {
        recommendScrollContainer.addEventListener('scroll', recommendScrollHandler, { passive: true });
        logger.info(`推荐列表滚动监听已绑定: ${describeScrollContainer(recommendScrollContainer)}`);
    }
}

function scheduleRecommendScrollBinding(delay = 0) {
    if (recommendScrollBindTimer) clearTimeout(recommendScrollBindTimer);
    recommendScrollBindTimer = setTimeout(() => {
        if (currentPageMode !== 'recommend') return;

        bindRecommendScrollContainer();

        if (!recommendScrollContainer) {
            scheduleRecommendScrollBinding(1000);
        }
    }, delay);
}

function initRecommendListObserver() {
    if (recommendObserver) return;

    const debouncedRescan = debounce(() => {
        scheduleCandidateRescan(100);
    }, 100);

    recommendObserver = new MutationObserver((mutations) => {
        const hasRelevantMutation = mutations.some((mutation) =>
            mutation.type === 'childList' &&
            (
                Array.from(mutation.addedNodes).some(isRelevantRecommendListNode) ||
                Array.from(mutation.removedNodes).some(isRelevantRecommendListNode)
            )
        );

        if (hasRelevantMutation) {
            debouncedRescan();
        }
    });

    const observeRecommendContainer = () => {
        if (currentPageMode !== 'recommend') return;

        const container = document.querySelector('.card-list') ||
            document.querySelector('#recommend-list') ||
            document.querySelector('.list-body') ||
            document.querySelector('.recommend-list-wrap');

        if (container) {
            recommendObserver.observe(container, { childList: true });
            bindRecommendScrollContainer(container);
            logger.info('推荐列表 MutationObserver 已启动');
        } else {
            recommendObserverRetryTimer = setTimeout(observeRecommendContainer, 1000);
        }
    };

    observeRecommendContainer();
}

function stopRecommendScanning(reason = 'unknown') {
    const hadActiveScanner = recommendScanningActive ||
        !!recommendObserver ||
        !!recommendObserverRetryTimer ||
        !!recommendScrollBindTimer ||
        !!recommendScrollHandler ||
        !!candidateRescanTimer;

    recommendScanningActive = false;

    if (recommendObserver) {
        recommendObserver.disconnect();
        recommendObserver = null;
    }

    if (recommendObserverRetryTimer) {
        clearTimeout(recommendObserverRetryTimer);
        recommendObserverRetryTimer = null;
    }

    if (recommendScrollBindTimer) {
        clearTimeout(recommendScrollBindTimer);
        recommendScrollBindTimer = null;
    }

    if (candidateRescanTimer) {
        clearTimeout(candidateRescanTimer);
        candidateRescanTimer = null;
    }

    clearModeScanTimers('recommend');
    stopBackgroundHeartbeat();

    if (recommendScrollContainer && recommendScrollHandler) {
        recommendScrollContainer.removeEventListener('scroll', recommendScrollHandler);
        recommendScrollContainer = null;
    }

    if (recommendScrollHandler) {
        window.removeEventListener('scroll', recommendScrollHandler);
        recommendScrollHandler = null;
    }

    if (hadActiveScanner) {
        logger.info(`推荐页扫描器已停止: ${reason}`);
    }
}

function startRecommendScanning(trigger = 'auto-greet-start') {
    if (currentPageMode !== 'recommend' || recommendScanningActive || !isGreetingRunning()) return;

    recommendScanningActive = true;
    recommendScrollHandler = debounce(() => scanCurrentPage('scroll'), 800);
    window.addEventListener('scroll', recommendScrollHandler, { passive: true });
    scheduleRecommendScrollBinding();
    initRecommendListObserver();
    scanCurrentPage(trigger);
    scheduleModeScans('recommend', [2000, 5000]);
    if (document.hidden) {
        startBackgroundHeartbeat();
    }
    logger.info(`推荐页扫描器已启动: ${trigger}`);
}

function syncRecommendScanningState(trigger = 'status-change') {
    if (currentPageMode !== 'recommend') {
        stopRecommendScanning(trigger);
        return;
    }

    if (isGreetingRunning()) {
        startRecommendScanning(trigger);
        return;
    }

    stopRecommendScanning(trigger);
}

function stopRecommendMode() {
    stopRecommendScanning('切换出推荐页');

    if (recommendPanelRetryTimer) {
        clearTimeout(recommendPanelRetryTimer);
        recommendPanelRetryTimer = null;
    }
}

function clearResumeGreetingRetryTimer() {
    if (!resumeGreetingRetryTimer) return;
    clearTimeout(resumeGreetingRetryTimer);
    resumeGreetingRetryTimer = null;
}

function pauseGreetingForRouteSwitch() {
    if (!isGreetingRunning()) return;

    shouldResumeGreetingOnRecommendReturn = true;
    stopAutoGreeting();
    logger.info('检测到离开推荐页，已暂停自动打招呼，返回推荐页后将自动恢复');
}

function resumeGreetingAfterRouteSwitch(delay = 0) {
    if (!shouldResumeGreetingOnRecommendReturn) return;
    if (currentPageMode !== 'recommend') return;
    if (isGreetingRunning()) {
        shouldResumeGreetingOnRecommendReturn = false;
        clearResumeGreetingRetryTimer();
        return;
    }

    clearResumeGreetingRetryTimer();
    resumeGreetingRetryTimer = setTimeout(() => {
        resumeGreetingRetryTimer = null;

        if (currentPageMode !== 'recommend' || !shouldResumeGreetingOnRecommendReturn) return;

        if (isGreetingRunning()) {
            shouldResumeGreetingOnRecommendReturn = false;
            return;
        }

        startAutoGreeting();
        shouldResumeGreetingOnRecommendReturn = false;
        logger.info('已返回推荐页，自动打招呼已恢复运行');
    }, delay);
}

function stopChatMode() {
    if (chatObserver) {
        chatObserver.disconnect();
        chatObserver = null;
    }

    if (chatObserverRetryTimer) {
        clearTimeout(chatObserverRetryTimer);
        chatObserverRetryTimer = null;
    }

    if (chatScrollHandler) {
        window.removeEventListener('scroll', chatScrollHandler);
        chatScrollHandler = null;
    }

    clearModeScanTimers('chat');
}

function scheduleCandidateRescan(delay = 500) {
    if (currentPageMode !== 'recommend' || !recommendScanningActive || !isGreetingRunning()) return;
    if (candidateRescanTimer) clearTimeout(candidateRescanTimer);
    candidateRescanTimer = setTimeout(() => {
        candidateRescanTimer = null;
        if (currentPageMode !== 'recommend' || !recommendScanningActive || !isGreetingRunning()) return;
        filterByDOM({ notify: false });
        refreshStats();
    }, delay);
}

function scheduleChatListRefresh(delay = 500) {
    if (chatListRefreshTimer) clearTimeout(chatListRefreshTimer);
    chatListRefreshTimer = setTimeout(() => {
        if (currentPageMode !== 'chat') return;
        filterChatListByDOM();
    }, delay);
}

function scheduleModeScans(mode, delays) {
    clearModeScanTimers(mode);
    delays.forEach((delay) => {
        const timerId = setTimeout(() => {
            modeScanTimers = modeScanTimers.filter((entry) => entry.timerId !== timerId);
            if (currentPageMode === mode) {
                scanCurrentPage(`scheduled:${delay}ms`);
            }
        }, delay);
        modeScanTimers.push({ mode, timerId });
    });
}

// 当前页面的筛选函数
function scanCurrentPage(trigger = 'unknown') {
    const chatPage = isChatPage();
    if (!chatPage && (!recommendScanningActive || !isGreetingRunning())) {
        return;
    }

    logger.info(`[扫描] scanCurrentPage trigger=${trigger}, pathname=${location.pathname}, isChatPage=${chatPage}`);
    if (chatPage) {
        filterChatListByDOM();
    } else {
        filterByDOM({ notify: false });
        refreshStats();
    }
}

/**
 * 启动聊天页模式的 DOM 监听
 */
function startChatMode() {
    logger.info('📨 启用聊天页模式（初始化回调 + MutationObserver）');

    chatScrollHandler = debounce(() => filterChatListByDOM(), 150);
    window.addEventListener('scroll', chatScrollHandler, { passive: true });

    chatObserver = new MutationObserver(debounce((mutations) => {
        const hasRelevantMutation = mutations.some((mutation) =>
            mutation.type === 'childList' &&
            (
                Array.from(mutation.addedNodes).some(isRelevantChatListNode) ||
                Array.from(mutation.removedNodes).some(isRelevantChatListNode)
            )
        );

        if (!hasRelevantMutation) return;
        filterChatListByDOM();
    }, 100));

    const observeChatContainer = () => {
        if (currentPageMode !== 'chat') return;

        const container = document.querySelector('.user-list') ||
            document.querySelector('.chat-list') ||
            document.querySelector('[class*="friend-list"]') ||
            document.querySelector('.group');
        if (container) {
            chatObserver.observe(container, { childList: true, subtree: true });
            logger.info('聊天列表 MutationObserver 已启动');
        } else {
            chatObserverRetryTimer = setTimeout(observeChatContainer, 1000);
        }
    };

    observeChatContainer();
    scheduleModeScans('chat', [2000, 5000]);

    logger.info('🎯 BOSS直聘智能招呼助手 v2.0 已启动（聊天页模式）');
}

function startRecommendMode() {
    scheduleRecommendPanelEnsure();
    filterByDOM({ notify: false });
    refreshStats();
    syncRecommendScanningState('recommend-mode-enter');

    logger.info('🎯 BOSS直聘智能招呼助手 v2.0 已启动');
}

function syncPageMode() {
    const nextMode = detectPageMode();
    syncBodyModeClass(nextMode);
    if (nextMode === currentPageMode) return;

    if (currentPageMode === 'recommend' && nextMode !== 'recommend') {
        pauseGreetingForRouteSwitch();
    }

    if (currentPageMode === 'chat') {
        stopChatMode();
    }
    if (currentPageMode === 'recommend') {
        stopRecommendMode();
    }

    currentPageMode = nextMode;

    if (nextMode === 'chat') {
        startChatMode();
    } else {
        startRecommendMode();
        resumeGreetingAfterRouteSwitch(300);
    }
}

function startRouteWatcher() {
    if (routeWatcherTimer) return;

    let lastRouteKey = getRouteWatchKey();
    routeWatcherTimer = setInterval(() => {
        const nextRouteKey = getRouteWatchKey();
        const nextMode = detectPageMode();

        if (nextRouteKey !== lastRouteKey || nextMode !== currentPageMode) {
            const oldRouteKey = lastRouteKey;
            lastRouteKey = nextRouteKey;
            logger.info(`路由/模式变化: ${oldRouteKey} → ${nextRouteKey}，mode=${currentPageMode || 'none'}→${nextMode}`);
            syncPageMode();
            if (currentPageMode === 'chat' || (currentPageMode === 'recommend' && recommendScanningActive && isGreetingRunning())) {
                scheduleModeScans(currentPageMode, [1500, 4000]);
            } else {
                clearModeScanTimers('recommend');
            }
        }
    }, ROUTE_WATCH_INTERVAL_MS);
}

function bindVisibilityListener() {
    if (visibilityListenerBound) return;
    visibilityListenerBound = true;

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            logger.info('页面进入后台');
            if (currentPageMode === 'recommend' && recommendScanningActive && isGreetingRunning()) {
                scheduleModeScans('recommend', [400, 1500]);
                startBackgroundHeartbeat();
            }
        } else {
            logger.info('页面回到前台');
            stopBackgroundHeartbeat();
            setTimeout(() => scanCurrentPage('visibility'), 1000);
        }
    });
}

function initialize() {
    // 单例守卫：模块级标志，立即生效，避免竞态条件
    if (initialized) return;
    initialized = true;

    // 1. 加载配置
    loadConfig();
    logger.info('配置已加载');

    // 2. 注入样式（两个页面都需要）
    injectStyles();

    // 3. 安装风控拦截器（在其他模块之前）
    installApmInterceptor();

    // 4. 安装候选人 API 拦截器（两个页面都需要）
    installApiInterceptor();

    // 连接候选人更新回调到 UI
    setOnCandidatesUpdated(() => {
        scheduleCandidateRescan(500);
    });

    // 聊天页 geek/info 与列表刷新回调
    setOnChatGeekInfoUpdated((info) => {
        if (!info) return;

        if (info.type === 'listRefresh') {
            scheduleChatListRefresh(500);
        } else if (info.prefetch) {
            scheduleChatListRefresh(120);
        } else if (currentPageMode === 'chat' || isChatPage()) {
            highlightConversationPanel(info);
        }
    });

    // 启动 VIP 弹窗观察器
    setupVipObserver(() => {
        refreshStats();
    });

    setOnStatusChange(({ running }) => {
        if (currentPageMode !== 'recommend') return;

        if (running) {
            startRecommendScanning('auto-greeting-start');
            return;
        }

        stopRecommendScanning('auto-greeting-stop');
        refreshStats();
    });

    syncBehaviorSimulation();
    syncPageMode();
    startRouteWatcher();
    bindVisibilityListener();
}

// ====== 启动 ======
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}
