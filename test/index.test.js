import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as filterModule from '../src/filter.js';
import * as antiDetectModule from '../src/anti-detect.js';
import * as panelModule from '../src/ui/panel.js';
import * as stylesModule from '../src/ui/styles.js';
import * as configModule from '../src/config.js';

// Mocks
vi.mock('../src/filter.js', () => ({
    installApiInterceptor: vi.fn(),
    setOnCandidatesUpdated: vi.fn(),
    setOnChatGeekInfoUpdated: vi.fn(),
    filterByDOM: vi.fn(),
    filterChatListByDOM: vi.fn(),
    highlightConversationPanel: vi.fn()
}));

vi.mock('../src/anti-detect.js', () => ({
    installApmInterceptor: vi.fn(),
    startBehaviorSimulation: vi.fn(),
    setupVipObserver: vi.fn(),
    stopBehaviorSimulation: vi.fn()
}));

vi.mock('../src/config.js', () => ({
    loadConfig: vi.fn(() => ({ behaviorSimEnabled: false }))
}));

vi.mock('../src/utils.js', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        getHistory: () => [],
    }
}));

vi.mock('../src/ui/panel.js', () => ({
    createPanel: vi.fn(),
    refreshStats: vi.fn()
}));

vi.mock('../src/ui/styles.js', () => ({
    injectStyles: vi.fn()
}));

describe('index.js (SPA Routing & Initialization)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        // Reset location
        Object.defineProperty(window, 'location', {
            value: {
                pathname: '/recommend',
                href: 'https://www.zhipin.com/recommend',
                includes: vi.fn((str) => '/recommend'.includes(str))
            },
            writable: true
        });
        document.body.innerHTML = '<div class="user-list"></div>'; // Mock chat container for Observer
    });

    afterEach(() => {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
        // We need to clear modules if possible so next test gets a fresh index.js
        vi.resetModules();
    });

    it('should run initChatMode when navigating from recommend to chat page', async () => {
        // Import index.js dynamically so it runs `initialize()` with jsdom env
        await import('../src/index.js');

        // 1. Initial page is /recommend
        expect(filterModule.installApiInterceptor).toHaveBeenCalled();
        expect(panelModule.createPanel).toHaveBeenCalled();

        // verify setOnChatGeekInfoUpdated is called once from the recommend flow
        expect(filterModule.setOnChatGeekInfoUpdated).toHaveBeenCalledTimes(1);

        const initialCallCount = filterModule.setOnChatGeekInfoUpdated.mock.calls.length;

        // 2. Simulate SPA navigation to chat page
        window.location.pathname = '/web/chat/index';

        // 3. Fast-forward setInterval (1000ms checking for location pathname change)
        vi.advanceTimersByTime(1100);

        // 4. Checking side-effects of initChatMode:
        // initChatMode calls setOnChatGeekInfoUpdated
        expect(filterModule.setOnChatGeekInfoUpdated).toHaveBeenCalledTimes(initialCallCount + 1);

        // initChatMode schedules filterChatListByDOM via setTimeout
        vi.advanceTimersByTime(2100);
        expect(filterModule.filterChatListByDOM).toHaveBeenCalled();
    });
});
