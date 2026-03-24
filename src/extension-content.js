import { loadConfig, updateConfig, getDailyCount, getHourlyCount } from './config.js';
import { logger, setLogChangeCallback } from './utils.js';
import {
    installApmInterceptor,
    setupVipObserver,
    startBehaviorSimulation,
    stopBehaviorSimulation,
    isCircuitBroken,
    resetCircuitBreaker,
} from './anti-detect.js';
import {
    installApiInterceptor,
    setOnCandidatesUpdated,
    filterByDOM,
    getTargetCandidates,
} from './filter.js';
import {
    startAutoGreeting,
    stopAutoGreeting,
    isGreetingRunning,
    setOnStatusChange,
} from './greeting.js';

let logSeeded = false;

async function initialize() {
    await syncConfigFromBg();
    setupBackgroundLogBridge();

    installApmInterceptor();
    installApiInterceptor();

    setOnCandidatesUpdated(syncRuntimeStats);
    setOnStatusChange(syncRuntimeStats);

    setupVipObserver(() => {
        syncRuntimeStats();
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            setTimeout(async () => {
                await syncConfigFromBg();
                filterByDOM();
                syncRuntimeStats();
            }, 1000);
        }
    });

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        handlePopupMessage(msg).then(sendResponse);
        return true;
    });

    const config = loadConfig();
    if (config.behaviorSimEnabled) {
        startBehaviorSimulation();
    } else {
        stopBehaviorSimulation();
    }

    setTimeout(async () => {
        await syncConfigFromBg();
        filterByDOM();
        syncRuntimeStats();
    }, 3000);

    logger.info('插件内容脚本已启动（复用 userscript 核心逻辑）');
}

async function handlePopupMessage(msg) {
    switch (msg.type) {
        case 'FILTER_DOM': {
            await syncConfigFromBg();
            const count = filterByDOM();
            syncRuntimeStats();
            logger.info(`重新扫描完成，发现 ${count} 名目标候选人`);
            return { count };
        }
        case 'START_GREETING':
            await syncConfigFromBg();
            startAutoGreeting();
            syncRuntimeStats();
            return { ok: true };
        case 'STOP_GREETING':
            stopAutoGreeting();
            syncRuntimeStats();
            return { ok: true };
        case 'RESET_CIRCUIT':
            resetCircuitBreaker();
            syncRuntimeStats();
            return { ok: true };
        default:
            return { error: 'unknown' };
    }
}

async function syncConfigFromBg() {
    try {
        const bgConfig = await chrome.runtime.sendMessage({ type: 'GET_CONFIG' });
        if (bgConfig) {
            updateConfig(bgConfig);
            return bgConfig;
        }
    } catch (e) {
        logger.warn('同步插件配置失败', e?.message || e);
    }
    return loadConfig();
}

function syncRuntimeStats() {
    const targets = getTargetCandidates();
    const counts = {};
    targets.forEach((target) => {
        if (target.schoolLabel) {
            counts[target.schoolLabel] = (counts[target.schoolLabel] || 0) + 1;
        }
    });

    chrome.runtime.sendMessage({
        type: 'UPDATE_RUNTIME',
        state: {
            running: isGreetingRunning(),
            circuitBroken: isCircuitBroken(),
            targetCount: targets.length,
            labelCounts: counts,
            dailyCount: getDailyCount(),
            hourlyCount: getHourlyCount(),
        },
    }).catch(() => { });
}

function setupBackgroundLogBridge() {
    setLogChangeCallback((history) => {
        const entry = history[history.length - 1];
        if (!entry) return;

        if (!logSeeded) {
            logSeeded = true;
        }

        chrome.runtime.sendMessage({
            type: 'ADD_LOG',
            entry,
        }).catch(() => { });
    });
}

initialize();
