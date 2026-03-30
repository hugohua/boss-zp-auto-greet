import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as filterModule from '../src/filter.js';
import * as antiDetectModule from '../src/anti-detect.js';
import * as panelModule from '../src/ui/panel.js';
import * as stylesModule from '../src/ui/styles.js';
import * as configModule from '../src/config.js';

const greetingState = vi.hoisted(() => ({
    running: false,
    listeners: [],
}));

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
    setupVipObserver: vi.fn(),
    syncBehaviorSimulation: vi.fn()
}));

vi.mock('../src/config.js', () => ({
    loadConfig: vi.fn(() => ({ behaviorSimEnabled: false }))
}));

vi.mock('../src/utils.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        logger: {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            getHistory: () => [],
        }
    };
});

vi.mock('../src/ui/panel.js', () => ({
    createPanel: vi.fn(),
    refreshStats: vi.fn()
}));

vi.mock('../src/ui/styles.js', () => ({
    injectStyles: vi.fn()
}));

vi.mock('../src/greeting.js', () => ({
    isGreetingRunning: vi.fn(() => greetingState.running),
    setOnStatusChange: vi.fn((cb) => {
        if (typeof cb === 'function') {
            greetingState.listeners.push(cb);
        }
        return () => {
            greetingState.listeners = greetingState.listeners.filter((listener) => listener !== cb);
        };
    }),
}));

function emitGreetingStatus(running) {
    greetingState.running = running;
    greetingState.listeners.forEach((listener) => listener({ running }));
}

describe('index.js (SPA Routing & Initialization)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        greetingState.running = false;
        greetingState.listeners = [];
        // Reset location
        Object.defineProperty(window, 'location', {
            value: {
                pathname: '/recommend',
                href: 'https://www.zhipin.com/recommend',
                includes: vi.fn((str) => '/recommend'.includes(str))
            },
            writable: true
        });
        document.body.innerHTML = '';
    });

    afterEach(() => {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
        // We need to clear modules if possible so next test gets a fresh index.js
        vi.resetModules();
    });

    it('should run initChatMode when navigating from recommend to chat page', async () => {
        document.body.innerHTML = `
            <ul class="card-list">
                <li class="card-item">
                    <div class="candidate-card-wrap">
                        <div class="card-inner" data-geek="target-1" data-geekid="target-1">
                            <span class="name">马珑航</span>
                        </div>
                    </div>
                </li>
            </ul>
        `;

        // Import index.js dynamically so it runs `initialize()` with jsdom env
        await import('../src/index.js');

        // 1. Initial page is /recommend
        expect(filterModule.installApiInterceptor).toHaveBeenCalled();
        expect(panelModule.createPanel).toHaveBeenCalled();

        // 回调现在在初始化时统一注册一次
        expect(filterModule.setOnChatGeekInfoUpdated).toHaveBeenCalledTimes(1);

        // 2. Simulate SPA navigation to chat page
        window.location.pathname = '/web/chat/index';
        document.body.innerHTML = '<div class="user-list"></div><div class="conversation-main"></div>';

        // 3. Fast-forward setInterval (1000ms checking for location pathname change)
        vi.advanceTimersByTime(1100);

        // 4. 聊天模式会启动延迟扫描
        vi.advanceTimersByTime(2100);
        expect(filterModule.filterChatListByDOM).toHaveBeenCalled();
    });

    it('should swap body mode classes shortly after chat DOM replaces recommend DOM', async () => {
        document.body.innerHTML = `
            <ul class="card-list">
                <li class="card-item">
                    <div class="candidate-card-wrap">
                        <div class="card-inner" data-geek="target-1" data-geekid="target-1">
                            <span class="name">马珑航</span>
                        </div>
                    </div>
                </li>
            </ul>
        `;

        await import('../src/index.js');

        expect(document.body.classList.contains('bh-recommend-mode')).toBe(true);
        expect(document.body.classList.contains('bh-chat-mode')).toBe(false);

        window.location.pathname = '/web/chat/index';
        window.location.href = 'https://www.zhipin.com/web/chat/index';
        document.body.innerHTML = `
            <div class="chat-conversation">
                <div class="user-list"></div>
                <div class="conversation-main"></div>
            </div>
        `;

        vi.advanceTimersByTime(300);

        expect(document.body.classList.contains('bh-chat-mode')).toBe(true);
        expect(document.body.classList.contains('bh-recommend-mode')).toBe(false);
    });

    it('should switch into chat mode when chat DOM appears even if the url does not change', async () => {
        document.body.innerHTML = `
            <ul class="card-list">
                <li class="card-item">
                    <div class="candidate-card-wrap">
                        <div class="card-inner" data-geek="target-1" data-geekid="target-1">
                            <span class="name">马珑航</span>
                        </div>
                    </div>
                </li>
            </ul>
        `;

        await import('../src/index.js');

        filterModule.filterChatListByDOM.mockClear();

        document.body.innerHTML = `
            <div class="chat-conversation">
                <div class="user-list"></div>
                <div class="conversation-main"></div>
            </div>
        `;

        vi.advanceTimersByTime(1100);
        vi.advanceTimersByTime(2100);

        expect(filterModule.filterChatListByDOM).toHaveBeenCalled();
    });

    it('should enter recommend mode only once when recommend DOM appears after loading the chat page', async () => {
        Object.defineProperty(window, 'location', {
            value: {
                pathname: '/web/chat/index',
                href: 'https://www.zhipin.com/web/chat/index',
                includes: vi.fn((str) => '/web/chat/index'.includes(str))
            },
            writable: true
        });

        document.body.innerHTML = '<div class="user-list"></div><div class="conversation-main"></div>';

        await import('../src/index.js');

        panelModule.createPanel.mockClear();
        filterModule.filterByDOM.mockClear();
        panelModule.refreshStats.mockClear();

        document.body.innerHTML = `
            <div class="candidate-body">
                <div class="recommend-list-wrap">
                    <div class="list-body">
                        <ul class="card-list">
                            <li class="card-item">
                                <div class="candidate-card-wrap">
                                    <div class="card-inner" data-geek="target-1" data-geekid="target-1">
                                        <span class="name">马珑航</span>
                                    </div>
                                </div>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        `;

        vi.advanceTimersByTime(1100);
        vi.advanceTimersByTime(3100);

        expect(panelModule.createPanel).toHaveBeenCalledTimes(1);
        expect(panelModule.refreshStats).toHaveBeenCalled();

        filterModule.filterByDOM.mockClear();
        panelModule.refreshStats.mockClear();

        emitGreetingStatus(true);
        await Promise.resolve();

        expect(filterModule.filterByDOM).toHaveBeenCalledTimes(1);
        expect(panelModule.refreshStats).toHaveBeenCalledTimes(1);
    });

    it('should wait for recommend DOM before creating the panel', async () => {
        Object.defineProperty(window, 'location', {
            value: {
                pathname: '/web/chat/recommend',
                href: 'https://www.zhipin.com/web/chat/recommend',
                includes: vi.fn((str) => '/web/chat/recommend'.includes(str))
            },
            writable: true
        });

        document.body.innerHTML = '<div class="container-wrap"></div>';

        await import('../src/index.js');

        expect(panelModule.createPanel).not.toHaveBeenCalled();

        document.body.innerHTML = `
            <div class="candidate-body">
                <div class="recommend-list-wrap">
                    <div class="list-body">
                        <ul class="card-list">
                            <li class="card-item">
                                <div class="candidate-card-wrap">
                                    <div class="card-inner" data-geek="target-1" data-geekid="target-1">
                                        <span class="name">马珑航</span>
                                    </div>
                                </div>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        `;

        vi.advanceTimersByTime(350);

        expect(panelModule.createPanel).toHaveBeenCalledTimes(1);
    });

    it('should rescan recommend list when similar candidate cards are injected into .card-list', async () => {
        document.body.innerHTML = `
            <ul class="card-list">
                <li class="card-item">
                    <div class="candidate-card-wrap">
                        <div class="card-inner" data-geek="target-1" data-geekid="target-1">
                            <span class="name">马珑航</span>
                        </div>
                    </div>
                </li>
            </ul>
        `;

        await import('../src/index.js');

        expect(filterModule.filterByDOM).not.toHaveBeenCalled();

        filterModule.filterByDOM.mockClear();
        panelModule.refreshStats.mockClear();

        emitGreetingStatus(true);
        await Promise.resolve();
        filterModule.filterByDOM.mockClear();
        panelModule.refreshStats.mockClear();

        const list = document.querySelector('.card-list');
        const injected = document.createElement('li');
        injected.className = 'card-item';
        injected.innerHTML = `
            <div class="similar-geek-wrap">
                <div class="title">为你推荐 与马珑航相似的15个牛人</div>
            </div>
        `;
        list.appendChild(injected);

        await Promise.resolve();
        vi.advanceTimersByTime(200);

        expect(filterModule.filterByDOM).toHaveBeenCalledTimes(1);
        expect(panelModule.refreshStats).toHaveBeenCalledTimes(1);
    });

    it('should rescan recommend list when the inner list-body scrolls', async () => {
        document.body.innerHTML = `
            <div class="candidate-body">
                <div class="recommend-list-wrap">
                    <div id="recommend-list" class="card-list-wrap">
                        <div class="list-body" style="overflow-y: auto;">
                            <ul class="card-list">
                                <li class="card-item">
                                    <div class="candidate-card-wrap">
                                        <div class="card-inner" data-geek="target-1" data-geekid="target-1">
                                            <span class="name">马珑航</span>
                                        </div>
                                    </div>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const listBody = document.querySelector('.list-body');
        Object.defineProperty(listBody, 'clientHeight', { value: 600, configurable: true });
        Object.defineProperty(listBody, 'scrollHeight', { value: 1600, configurable: true });

        await import('../src/index.js');
        vi.advanceTimersByTime(20);

        expect(filterModule.filterByDOM).not.toHaveBeenCalled();

        emitGreetingStatus(true);
        await Promise.resolve();
        filterModule.filterByDOM.mockClear();
        panelModule.refreshStats.mockClear();

        listBody.dispatchEvent(new Event('scroll'));
        vi.advanceTimersByTime(900);

        expect(filterModule.filterByDOM).toHaveBeenCalledTimes(1);
        expect(panelModule.refreshStats).toHaveBeenCalledTimes(1);
    });

    it('should not rescan recommend list when only helper labels are injected inside an existing card', async () => {
        document.body.innerHTML = `
            <ul class="card-list">
                <li class="card-item">
                    <div class="candidate-card-wrap">
                        <div class="card-inner" data-geek="target-1" data-geekid="target-1">
                            <div class="row name-wrap">
                                <span class="name">马珑航</span>
                            </div>
                        </div>
                    </div>
                </li>
            </ul>
        `;

        await import('../src/index.js');

        emitGreetingStatus(true);
        await Promise.resolve();
        filterModule.filterByDOM.mockClear();
        panelModule.refreshStats.mockClear();

        const nameWrap = document.querySelector('.name-wrap');
        const label = document.createElement('span');
        label.className = 'bh-card-label C9';
        label.textContent = 'C9';
        nameWrap.appendChild(label);

        await Promise.resolve();
        vi.advanceTimersByTime(200);

        expect(filterModule.filterByDOM).not.toHaveBeenCalled();
        expect(panelModule.refreshStats).not.toHaveBeenCalled();
    });

    it('should stop chat observers after navigating back to recommend page', async () => {
        document.body.innerHTML = '<div class="user-list"></div><ul class="card-list"></ul>';

        await import('../src/index.js');

        window.location.pathname = '/web/chat/index';
        vi.advanceTimersByTime(1100);

        window.location.pathname = '/recommend';
        vi.advanceTimersByTime(1100);

        filterModule.filterChatListByDOM.mockClear();

        const chatList = document.querySelector('.user-list');
        const item = document.createElement('div');
        item.className = 'chat-item';
        chatList.appendChild(item);

        await Promise.resolve();
        vi.advanceTimersByTime(200);

        expect(filterModule.filterChatListByDOM).not.toHaveBeenCalled();
    });

    it('should not rescan chat list when only helper labels are injected into an existing chat card', async () => {
        Object.defineProperty(window, 'location', {
            value: {
                pathname: '/web/chat/index',
                href: 'https://www.zhipin.com/web/chat/index',
                includes: vi.fn((str) => '/web/chat/index'.includes(str))
            },
            writable: true
        });

        document.body.innerHTML = `
            <div class="user-list">
                <div role="listitem">
                    <div class="geek-item-wrap">
                        <div class="geek-item" data-id="604704359-0">
                            <span class="geek-item-top">
                                <span class="geek-name">杜康磊</span>
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        await import('../src/index.js');
        filterModule.filterChatListByDOM.mockClear();

        const nameWrap = document.querySelector('.geek-item-top');
        const label = document.createElement('span');
        label.className = 'bh-card-label bh-chat-inline-label C9';
        label.setAttribute('data-bh-chat-label', '1');
        label.textContent = 'C9';
        nameWrap.appendChild(label);

        await Promise.resolve();
        vi.advanceTimersByTime(200);

        expect(filterModule.filterChatListByDOM).not.toHaveBeenCalled();
    });

    it('should refresh only the chat list when prefetched geek info arrives', async () => {
        Object.defineProperty(window, 'location', {
            value: {
                pathname: '/web/chat/index',
                href: 'https://www.zhipin.com/web/chat/index',
                includes: vi.fn((str) => '/web/chat/index'.includes(str))
            },
            writable: true
        });

        document.body.innerHTML = '<div class="user-list"></div>';

        await import('../src/index.js');

        const callback = filterModule.setOnChatGeekInfoUpdated.mock.calls[0][0];
        filterModule.filterChatListByDOM.mockClear();
        filterModule.highlightConversationPanel.mockClear();

        callback({
            prefetch: true,
            name: '杜康磊',
            schoolMatch: { label: 'C9' },
        });

        vi.advanceTimersByTime(150);

        expect(filterModule.filterChatListByDOM).toHaveBeenCalledTimes(1);
        expect(filterModule.highlightConversationPanel).not.toHaveBeenCalled();
    });

    it('should trigger quick rescans when page becomes hidden during active recommend scanning', async () => {
        document.body.innerHTML = `
            <div class="candidate-body">
                <div class="recommend-list-wrap">
                    <div id="recommend-list" class="card-list-wrap">
                        <div class="list-body" style="overflow-y: auto;">
                            <ul class="card-list">
                                <li class="card-item">
                                    <div class="candidate-card-wrap"></div>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        `;

        Object.defineProperty(document, 'hidden', {
            configurable: true,
            value: false,
        });

        await import('../src/index.js');
        emitGreetingStatus(true);
        await Promise.resolve();
        filterModule.filterByDOM.mockClear();

        Object.defineProperty(document, 'hidden', {
            configurable: true,
            value: true,
        });
        document.dispatchEvent(new Event('visibilitychange'));

        vi.advanceTimersByTime(450);
        expect(filterModule.filterByDOM.mock.calls.length).toBeGreaterThan(0);

        const callsAfter450ms = filterModule.filterByDOM.mock.calls.length;
        vi.advanceTimersByTime(1100);
        expect(filterModule.filterByDOM.mock.calls.length).toBeGreaterThan(callsAfter450ms);
    });

    it('should stop background heartbeat scans after page becomes visible again', async () => {
        document.body.innerHTML = `
            <div class="candidate-body">
                <div class="recommend-list-wrap">
                    <div id="recommend-list" class="card-list-wrap">
                        <div class="list-body" style="overflow-y: auto;">
                            <ul class="card-list">
                                <li class="card-item">
                                    <div class="candidate-card-wrap"></div>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        `;

        Object.defineProperty(document, 'hidden', {
            configurable: true,
            value: true,
        });

        await import('../src/index.js');
        emitGreetingStatus(true);
        await Promise.resolve();
        filterModule.filterByDOM.mockClear();

        vi.advanceTimersByTime(15100);
        expect(filterModule.filterByDOM.mock.calls.length).toBeGreaterThan(0);

        Object.defineProperty(document, 'hidden', {
            configurable: true,
            value: false,
        });
        document.dispatchEvent(new Event('visibilitychange'));
        vi.advanceTimersByTime(1100);

        filterModule.filterByDOM.mockClear();
        vi.advanceTimersByTime(20000);
        expect(filterModule.filterByDOM).not.toHaveBeenCalled();
    });
});
