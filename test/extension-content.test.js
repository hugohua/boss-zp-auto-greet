import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockState = {
    currentConfig: { behaviorSimEnabled: true },
    bgConfig: { behaviorSimEnabled: true, greetInterval: 15 },
    dailyCount: 7,
    filterCount: 3,
    targets: [
        { schoolLabel: 'C9' },
        { schoolLabel: '强相关' },
        { schoolLabel: '强相关' },
    ],
    running: false,
    circuitBroken: false,
    onMessageHandler: null,
    logChangeCallback: null,
    candidateUpdatedCallback: null,
    statusChangeCallback: null,
    vipDetectedCallback: null,
    visibilityChangeCallback: null,
};

vi.mock('../src/config.js', () => ({
    loadConfig: vi.fn(() => mockState.currentConfig),
    updateConfig: vi.fn((next) => {
        mockState.currentConfig = { ...mockState.currentConfig, ...next };
    }),
    getDailyCount: vi.fn(() => mockState.dailyCount),
}));

vi.mock('../src/utils.js', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        getHistory: () => [],
    },
    setLogChangeCallback: vi.fn((cb) => {
        mockState.logChangeCallback = cb;
    }),
}));

vi.mock('../src/anti-detect.js', () => ({
    installApmInterceptor: vi.fn(),
    setupVipObserver: vi.fn((cb) => {
        mockState.vipDetectedCallback = cb;
    }),
    startBehaviorSimulation: vi.fn(),
    stopBehaviorSimulation: vi.fn(),
    isCircuitBroken: vi.fn(() => mockState.circuitBroken),
    resetCircuitBreaker: vi.fn(() => {
        mockState.circuitBroken = false;
    }),
}));

vi.mock('../src/filter.js', () => ({
    installApiInterceptor: vi.fn(),
    setOnCandidatesUpdated: vi.fn((cb) => {
        mockState.candidateUpdatedCallback = cb;
    }),
    filterByDOM: vi.fn(() => mockState.filterCount),
    getTargetCandidates: vi.fn(() => mockState.targets),
}));

vi.mock('../src/greeting.js', () => ({
    startAutoGreeting: vi.fn(() => {
        mockState.running = true;
    }),
    stopAutoGreeting: vi.fn(() => {
        mockState.running = false;
    }),
    isGreetingRunning: vi.fn(() => mockState.running),
    setOnStatusChange: vi.fn((cb) => {
        mockState.statusChangeCallback = cb;
    }),
}));

async function flushInit() {
    await Promise.resolve();
    await Promise.resolve();
}

describe('extension-content.js', () => {
    let runtimeSendMessage;
    let addListener;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();

        mockState.currentConfig = { behaviorSimEnabled: true };
        mockState.bgConfig = { behaviorSimEnabled: true, greetInterval: 15 };
        mockState.dailyCount = 7;
        mockState.filterCount = 3;
        mockState.targets = [
            { schoolLabel: 'C9' },
            { schoolLabel: '强相关' },
            { schoolLabel: '强相关' },
        ];
        mockState.running = false;
        mockState.circuitBroken = false;
        mockState.onMessageHandler = null;
        mockState.logChangeCallback = null;
        mockState.candidateUpdatedCallback = null;
        mockState.statusChangeCallback = null;
        mockState.vipDetectedCallback = null;
        mockState.visibilityChangeCallback = null;

        runtimeSendMessage = vi.fn((msg) => {
            if (msg?.type === 'GET_CONFIG') {
                return Promise.resolve(mockState.bgConfig);
            }
            return Promise.resolve({ ok: true });
        });

        addListener = vi.fn((handler) => {
            mockState.onMessageHandler = handler;
        });

        global.chrome = {
            runtime: {
                sendMessage: runtimeSendMessage,
                onMessage: {
                    addListener,
                },
            },
        };

        Object.defineProperty(document, 'hidden', {
            value: false,
            configurable: true,
            writable: true,
        });

        vi.spyOn(document, 'addEventListener').mockImplementation((type, listener) => {
            if (type === 'visibilitychange') {
                mockState.visibilityChangeCallback = listener;
            }
        });
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.restoreAllMocks();
        vi.useRealTimers();
        vi.resetModules();
        delete global.chrome;
    });

    it('初始化时应安装桥接、同步配置并按配置启动行为模拟', async () => {
        const configModule = await import('../src/config.js');
        const antiDetectModule = await import('../src/anti-detect.js');
        const filterModule = await import('../src/filter.js');
        const greetingModule = await import('../src/greeting.js');
        const utilsModule = await import('../src/utils.js');

        await import('../src/extension-content.js');
        await flushInit();

        expect(runtimeSendMessage).toHaveBeenCalledWith({ type: 'GET_CONFIG' });
        expect(configModule.updateConfig).toHaveBeenCalledWith(mockState.bgConfig);
        expect(antiDetectModule.installApmInterceptor).toHaveBeenCalledTimes(1);
        expect(filterModule.installApiInterceptor).toHaveBeenCalledTimes(1);
        expect(filterModule.setOnCandidatesUpdated).toHaveBeenCalledTimes(1);
        expect(greetingModule.setOnStatusChange).toHaveBeenCalledTimes(1);
        expect(antiDetectModule.setupVipObserver).toHaveBeenCalledTimes(1);
        expect(antiDetectModule.startBehaviorSimulation).toHaveBeenCalledTimes(1);
        expect(antiDetectModule.stopBehaviorSimulation).not.toHaveBeenCalled();
        expect(utilsModule.setLogChangeCallback).toHaveBeenCalledTimes(1);
        expect(addListener).toHaveBeenCalledTimes(1);
        expect(typeof mockState.onMessageHandler).toBe('function');
    });

    it('FILTER_DOM 消息应重新筛选并向后台同步运行态', async () => {
        const filterModule = await import('../src/filter.js');

        await import('../src/extension-content.js');
        await flushInit();

        runtimeSendMessage.mockClear();
        filterModule.filterByDOM.mockClear();

        const sendResponse = vi.fn();
        const isAsync = mockState.onMessageHandler({ type: 'FILTER_DOM' }, {}, sendResponse);
        expect(isAsync).toBe(true);

        await flushInit();

        expect(filterModule.filterByDOM).toHaveBeenCalledTimes(1);
        expect(sendResponse).toHaveBeenCalledWith({ count: mockState.filterCount });
        expect(runtimeSendMessage).toHaveBeenCalledWith({ type: 'GET_CONFIG' });
        expect(runtimeSendMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'UPDATE_RUNTIME',
            state: expect.objectContaining({
                running: false,
                circuitBroken: false,
                targetCount: 3,
                labelCounts: { C9: 1, 强相关: 2 },
                dailyCount: 7,
            }),
        }));
    });

    it('日志桥接应把最新日志发送给后台', async () => {
        await import('../src/extension-content.js');
        await flushInit();

        runtimeSendMessage.mockClear();

        const entry = { time: '16:00:00', level: 'info', message: '测试日志' };
        mockState.logChangeCallback([entry]);
        await flushInit();

        expect(runtimeSendMessage).toHaveBeenCalledWith({
            type: 'ADD_LOG',
            entry,
        });
    });

    it('页面回到前台后应重新同步配置并刷新筛选', async () => {
        const filterModule = await import('../src/filter.js');

        await import('../src/extension-content.js');
        await flushInit();

        runtimeSendMessage.mockClear();
        filterModule.filterByDOM.mockClear();

        mockState.visibilityChangeCallback();
        await vi.advanceTimersByTimeAsync(1000);
        await flushInit();

        expect(runtimeSendMessage).toHaveBeenCalledWith({ type: 'GET_CONFIG' });
        expect(filterModule.filterByDOM).toHaveBeenCalledTimes(1);
        expect(runtimeSendMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'UPDATE_RUNTIME',
        }));
    });
});
