import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let mockConfig;

vi.mock('../src/config.js', () => ({
    getConfig: () => mockConfig,
    updateConfig: vi.fn((partial) => {
        mockConfig = { ...mockConfig, ...partial };
        return mockConfig;
    }),
    getDailyCount: vi.fn(() => 0),
    getSchoolLabelCounts: vi.fn(() => ({})),
    parseSchoolsText: vi.fn(() => []),
    serializeSchoolsText: vi.fn(() => ''),
}));

vi.mock('../src/utils.js', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        getHistory: () => [],
    },
    setLogChangeCallback: vi.fn(),
    getTodayKey: vi.fn(() => '2026-03-28'),
}));

vi.mock('../src/anti-detect.js', () => ({
    isCircuitBroken: vi.fn(() => false),
    resetCircuitBreaker: vi.fn(),
    syncBehaviorSimulation: vi.fn(),
}));

vi.mock('../src/filter.js', () => ({
    getTargetCandidates: vi.fn(() => []),
    filterByDOM: vi.fn(() => 0),
    filterChatListByDOM: vi.fn(() => 0),
}));

vi.mock('../src/greeting.js', () => ({
    startAutoGreeting: vi.fn(),
    stopAutoGreeting: vi.fn(),
    isGreetingRunning: vi.fn(() => false),
    setOnStatusChange: vi.fn(),
}));

vi.mock('../src/ui/notification.js', () => ({
    showNotification: vi.fn(),
}));

vi.mock('../src/ui/records.js', () => ({
    showRecordsModal: vi.fn(),
}));

describe('panel.js', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        mockConfig = {
            greetInterval: 10,
            dailyLimit: 150,
            autoLoadMore: true,
            freshGraduateMode: false,
            workHoursEnabled: false,
            behaviorSimEnabled: true,
            runInBackground: true,
            greetingTemplates: [],
            targetSchools: [
                { name: '清华大学', label: 'C9' },
            ],
            enabledSchoolLabels: ['C9'],
        };
        document.body.innerHTML = '';
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.resetModules();
        document.body.innerHTML = '';
    });

    it('切换应届生模式时应立即更新配置并重扫推荐列表', async () => {
        const panelModule = await import('../src/ui/panel.js');
        const configModule = await import('../src/config.js');
        const filterModule = await import('../src/filter.js');

        panelModule.createPanel();

        vi.mocked(configModule.updateConfig).mockClear();
        vi.mocked(filterModule.filterByDOM).mockClear();

        const checkbox = document.getElementById('bh-fresh-graduate-mode');
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));

        expect(configModule.updateConfig).toHaveBeenCalledWith({ freshGraduateMode: true });
        expect(filterModule.filterByDOM).toHaveBeenCalledWith({ notify: false });
    });

    it('点击重新扫描时应先同步应届生模式开关的当前值', async () => {
        const panelModule = await import('../src/ui/panel.js');
        const configModule = await import('../src/config.js');
        const filterModule = await import('../src/filter.js');

        panelModule.createPanel();

        vi.mocked(configModule.updateConfig).mockClear();
        vi.mocked(filterModule.filterByDOM).mockClear();

        const checkbox = document.getElementById('bh-fresh-graduate-mode');
        checkbox.checked = true;

        document.getElementById('bh-filter-btn').click();

        expect(configModule.updateConfig).toHaveBeenCalledWith({ freshGraduateMode: true });
        expect(filterModule.filterByDOM).toHaveBeenCalledTimes(1);
    });
});
