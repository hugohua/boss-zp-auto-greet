/**
 * BOSS直聘智能招呼助手 — 入口模块
 * 组装各模块并初始化
 */

import { loadConfig } from './config.js';
import { logger } from './utils.js';
import { installApmInterceptor, startBehaviorSimulation, setupVipObserver, stopBehaviorSimulation } from './anti-detect.js';
import { installApiInterceptor, setOnCandidatesUpdated, filterByDOM, observeChatList } from './filter.js';
import { injectStyles } from './ui/styles.js';
import { createPanel, refreshStats } from './ui/panel.js';

function initialize() {
    // 防止重复初始化
    if (document.getElementById('boss-helper-panel')) return;

    // 1. 加载配置
    const config = loadConfig();
    logger.info('配置已加载');

    // 2. 注入样式
    injectStyles();

    // 3. 安装底层拦截器 (不受路由限制，抓包长驻)
    installApmInterceptor();
    installApiInterceptor();

    // 4. 初始化 UI 与组件库
    createPanel();
    setOnCandidatesUpdated(() => refreshStats());
    setupVipObserver(() => refreshStats());

    // 5. 组装不同页面的业务路由
    function routeHandler() {
        const path = location.pathname;
        const panel = document.getElementById('boss-helper-panel');

        // 5.1 推荐牛人/搜索列表页面
        if (path.includes('/recommend') || path.includes('/search')) {
            if (panel) panel.style.display = 'block';

            if (config.behaviorSimEnabled) {
                startBehaviorSimulation();
            }
            // 延迟筛选初次卡片
            setTimeout(() => {
                filterByDOM();
                refreshStats();
            }, 2000);

            // 挂载轮询侦听器以应对长列表无限滚动加载
            if (!window._bhRecommendPoller) {
                window._bhRecommendPoller = setInterval(() => {
                    if (location.pathname.includes('/recommend') || location.pathname.includes('/search')) {
                        filterByDOM();
                        refreshStats();
                    }
                }, 2000);
                logger.info('推荐列表滚动高亮巡航已启动');
            }
        } else {
            // 其他页面隐藏打招呼控制面板
            if (panel) panel.style.display = 'none';
            stopBehaviorSimulation();
        }

        // 5.2 聊天对话列表页面
        if (path.includes('/chat') || path.includes('/friend')) {
            observeChatList();
        }
    }

    // 初次进站执行
    routeHandler();

    // 6. SPA 路由劫持（监听网页内部无刷新跳转）
    let lastUrl = location.href;
    const observer = new MutationObserver(() => {
        const currentUrl = location.href;
        if (currentUrl !== lastUrl) {
            lastUrl = currentUrl;
            logger.info('路由发生切换: ' + currentUrl);
            setTimeout(routeHandler, 1000); // 留出 DOM 渲染时间
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // 7. 监听页面可见性变化
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && (location.pathname.includes('/recommend') || location.pathname.includes('/search'))) {
            logger.info('页面回到前台');
            setTimeout(() => {
                filterByDOM();
                refreshStats();
            }, 1000);
        }
    });

    logger.info('🎯 BOSS直聘智能招呼助手 v2.0 已启动');
}

// ====== 启动 ======
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}
