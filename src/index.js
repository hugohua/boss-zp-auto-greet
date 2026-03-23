/**
 * BOSS直聘智能招呼助手 — 入口模块
 * 组装各模块并初始化
 */

import { loadConfig } from './config.js';
import { logger } from './utils.js';
import { installApmInterceptor, startBehaviorSimulation, setupVipObserver, stopBehaviorSimulation } from './anti-detect.js';
import { installApiInterceptor, setOnCandidatesUpdated, filterByDOM } from './filter.js';
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

    // 3. 安装风控拦截器（在其他模块之前）
    installApmInterceptor();

    // 4. 安装候选人 API 拦截器
    installApiInterceptor();

    // 5. 连接候选人更新回调到 UI
    setOnCandidatesUpdated(() => {
        refreshStats();
    });

    // 6. 创建控制面板
    createPanel();

    // 7. 启动 VIP 弹窗观察器
    setupVipObserver(() => {
        refreshStats();
    });

    // 8. 启动后台行为模拟
    if (config.behaviorSimEnabled) {
        startBehaviorSimulation();
    }

    // 9. 初始 DOM 筛选（延迟，等页面内容加载）
    setTimeout(() => {
        filterByDOM();
        refreshStats();
    }, 3000);

    // 10. 监听页面可见性变化
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            logger.info('页面进入后台');
        } else {
            logger.info('页面回到前台');
            // 重新筛选可能新加载的候选人
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
