/**
 * BOSS直聘智能招呼助手 — 入口模块
 * 组装各模块并初始化
 * 支持推荐页和聊天页的目标院校高亮
 */

import { loadConfig } from './config.js';
import { logger } from './utils.js';
import { installApmInterceptor, startBehaviorSimulation, setupVipObserver, stopBehaviorSimulation } from './anti-detect.js';
import { installApiInterceptor, setOnCandidatesUpdated, setOnChatGeekInfoUpdated, filterByDOM, filterChatListByDOM, highlightConversationPanel } from './filter.js';
import { injectStyles } from './ui/styles.js';
import { createPanel, refreshStats } from './ui/panel.js';

// 模块级初始化标志，防止重复初始化（避免 DOM 检查的竞态条件）
let initialized = false;
// 聊天模式是否已初始化（支持从推荐页 SPA 导航到聊天页时延迟初始化）
let chatModeInitialized = false;

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

function isRecommendPage() {
    return !isChatPage();
}

// 当前页面的筛选函数
function scanCurrentPage() {
    logger.info(`[路由] scanCurrentPage 被调用, pathname=${location.pathname}, isChatPage=${isChatPage()}`);
    if (isChatPage()) {
        filterChatListByDOM();
    } else {
        filterByDOM();
        refreshStats();
    }
}

/**
 * 聊天页模式初始化（独立函数，支持 SPA 路由切换时延迟调用）
 * 设置聊天页专属的回调、MutationObserver 和延时扫描
 */
function initChatMode() {
    if (chatModeInitialized) return;
    chatModeInitialized = true;

    logger.info('📨 启用聊天页模式（初始化回调 + MutationObserver）');

    // 连接聊天页 geek/info 回调
    setOnChatGeekInfoUpdated((info) => {
        if (info.type === 'listRefresh') {
            setTimeout(() => filterChatListByDOM(), 500);
        } else {
            highlightConversationPanel(info);
        }
    });

    // 初始扫描（延时等待 DOM 渲染）
    setTimeout(() => filterChatListByDOM(), 2000);
    setTimeout(() => filterChatListByDOM(), 5000);

    // 滚动监听
    const debouncedScan = debounce(() => filterChatListByDOM(), 150);
    window.addEventListener('scroll', debouncedScan, { passive: true });

    // MutationObserver 监听聊天列表
    const chatObserver = new MutationObserver(debounce(() => {
        filterChatListByDOM();
    }, 100));

    const observeChatContainer = () => {
        const container = document.querySelector('.user-list') ||
            document.querySelector('.chat-list') ||
            document.querySelector('[class*="friend-list"]') ||
            document.querySelector('.group');
        if (container) {
            chatObserver.observe(container, { childList: true, subtree: true });
            logger.info('聊天列表 MutationObserver 已启动');
        } else {
            setTimeout(observeChatContainer, 1000);
        }
    };
    observeChatContainer();

    logger.info('🎯 BOSS直聘智能招呼助手 v2.0 已启动（聊天页模式）');
}

function initialize() {
    // 单例守卫：模块级标志，立即生效，避免竞态条件
    if (initialized) return;
    initialized = true;

    const onChat = isChatPage();

    // 1. 加载配置
    const config = loadConfig();
    logger.info('配置已加载');

    // 2. 注入样式（两个页面都需要）
    injectStyles();

    // 3. 安装风控拦截器（在其他模块之前）
    installApmInterceptor();

    // 4. 安装候选人 API 拦截器（两个页面都需要）
    installApiInterceptor();

    if (onChat) {
        // ====== 聊天页专属初始化 ======
        initChatMode();
    } else {
        // ====== 推荐页完整初始化 ======

        // 连接候选人更新回调到 UI
        let isScanning = false;
        setOnCandidatesUpdated(() => {
            if (isScanning) return;
            isScanning = true;
            setTimeout(() => {
                filterByDOM();
                refreshStats();
                isScanning = false;
            }, 500);
        });

        // 连接聊天页回调（备用，推荐页 iframe 可能检测到 top 为聊天页）
        setOnChatGeekInfoUpdated((info) => {
            if (info.type === 'listRefresh') {
                setTimeout(() => filterChatListByDOM(), 500);
            } else {
                highlightConversationPanel(info);
            }
        });

        // 创建控制面板
        createPanel();

        // 启动 VIP 弹窗观察器
        setupVipObserver(() => {
            refreshStats();
        });

        // 启动后台行为模拟
        if (config.behaviorSimEnabled) {
            startBehaviorSimulation();
        }

        // 初始 DOM 筛选
        setTimeout(() => scanCurrentPage(), 2000);
        setTimeout(() => scanCurrentPage(), 5000);

        // 监听页面滚动
        const debouncedScan = debounce(() => scanCurrentPage(), 800);
        window.addEventListener('scroll', debouncedScan, { passive: true });

        // SPA 路由变化监听
        let lastPath = location.pathname;
        setInterval(() => {
            if (location.pathname !== lastPath) {
                const oldPath = lastPath;
                lastPath = location.pathname;
                logger.info(`路由变化: ${oldPath} → ${lastPath}`);
                // 如果切换到了聊天页，初始化聊天模式
                if (isChatPage()) {
                    initChatMode();
                }
                setTimeout(() => scanCurrentPage(), 1500);
                setTimeout(() => scanCurrentPage(), 4000);
            }
        }, 1000);

        // 监听页面可见性变化
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                logger.info('页面进入后台');
            } else {
                logger.info('页面回到前台');
                setTimeout(() => scanCurrentPage(), 1000);
            }
        });

        logger.info('🎯 BOSS直聘智能招呼助手 v2.0 已启动');
    }
}

// ====== 启动 ======
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}

