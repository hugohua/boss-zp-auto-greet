/**
 * BOSS直聘智能招呼助手 — 入口模块
 * 组装各模块并初始化
 * 支持推荐页和聊天页的目标院校高亮
 */

import { loadConfig } from './config.js';
import { describeScrollContainer, findScrollableContainer, isDocumentScrollContainer, logger } from './utils.js';
import { installApmInterceptor, setupVipObserver, syncBehaviorSimulation } from './anti-detect.js';
import { installApiInterceptor, setOnCandidatesUpdated, setOnChatGeekInfoUpdated, filterByDOM, filterChatListByDOM, highlightConversationPanel } from './filter.js';
import { injectStyles } from './ui/styles.js';
import { createPanel, refreshStats } from './ui/panel.js';

// 模块级初始化标志，防止重复初始化（避免 DOM 检查的竞态条件）
let initialized = false;
let currentPageMode = null;
let routeWatcherTimer = null;
let visibilityListenerBound = false;
let recommendObserver = null;
let recommendObserverRetryTimer = null;
let recommendScrollBindTimer = null;
let recommendScrollHandler = null;
let recommendScrollContainer = null;
let chatObserver = null;
let chatObserverRetryTimer = null;
let chatScrollHandler = null;
let candidateRescanTimer = null;
let chatListRefreshTimer = null;
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

// 路由检测（兼容 iframe 和顶层窗口）
function isChatPage() {
    const isChatUrl = (url) => url.includes('/web/chat/') && !url.includes('/recommend') && !url.includes('/frame/');

    // 直接在聊天页打开时
    if (isChatUrl(location.pathname)) return true;
    // 在 iframe 中时，检查顶层窗口
    try {
        if (window.top && window.top.location && isChatUrl(window.top.location.pathname)) return true;
    } catch (e) { /* 跨域 iframe 忽略 */ }
    return false;
}

function isRelevantRecommendListNode(node) {
    if (!node || node.nodeType !== 1) return false;
    return node.matches?.('.card-item, .candidate-card-wrap, .similar-geek-wrap') ||
        node.querySelector?.('.candidate-card-wrap, .similar-geek-wrap');
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

function stopRecommendMode() {
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

    if (recommendScrollContainer && recommendScrollHandler) {
        recommendScrollContainer.removeEventListener('scroll', recommendScrollHandler);
        recommendScrollContainer = null;
    }

    if (recommendScrollHandler) {
        window.removeEventListener('scroll', recommendScrollHandler);
        recommendScrollHandler = null;
    }
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
}

function scheduleCandidateRescan(delay = 500) {
    if (candidateRescanTimer) clearTimeout(candidateRescanTimer);
    candidateRescanTimer = setTimeout(() => {
        if (currentPageMode !== 'recommend') return;
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
    delays.forEach((delay) => {
        setTimeout(() => {
            if (currentPageMode === mode) {
                scanCurrentPage(`scheduled:${delay}ms`);
            }
        }, delay);
    });
}

// 当前页面的筛选函数
function scanCurrentPage(trigger = 'unknown') {
    logger.info(`[扫描] scanCurrentPage trigger=${trigger}, pathname=${location.pathname}, isChatPage=${isChatPage()}`);
    if (isChatPage()) {
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

    chatObserver = new MutationObserver(debounce(() => {
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
    createPanel();
    recommendScrollHandler = debounce(() => scanCurrentPage('scroll'), 800);
    window.addEventListener('scroll', recommendScrollHandler, { passive: true });
    scheduleRecommendScrollBinding();
    initRecommendListObserver();
    refreshStats();
    scheduleModeScans('recommend', [2000, 5000]);

    logger.info('🎯 BOSS直聘智能招呼助手 v2.0 已启动');
}

function syncPageMode() {
    const nextMode = isChatPage() ? 'chat' : 'recommend';
    if (nextMode === currentPageMode) return;

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
    }
}

function startRouteWatcher() {
    if (routeWatcherTimer) return;

    let lastPath = location.pathname;
    routeWatcherTimer = setInterval(() => {
        if (location.pathname !== lastPath) {
            const oldPath = lastPath;
            lastPath = location.pathname;
            logger.info(`路由变化: ${oldPath} → ${lastPath}`);
            syncPageMode();
            scheduleModeScans(currentPageMode, [1500, 4000]);
        }
    }, 1000);
}

function bindVisibilityListener() {
    if (visibilityListenerBound) return;
    visibilityListenerBound = true;

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            logger.info('页面进入后台');
        } else {
            logger.info('页面回到前台');
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
        } else if (currentPageMode === 'chat' || isChatPage()) {
            highlightConversationPanel(info);
        }
    });

    // 启动 VIP 弹窗观察器
    setupVipObserver(() => {
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
