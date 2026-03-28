import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../src/config.js', () => ({
    getConfig: vi.fn(() => ({
        autoLoadMore: true,
        runInBackground: true,
        greetingTemplates: ['你好，期待与你沟通'],
    })),
    incrementCount: vi.fn(),
    isLimitReached: vi.fn(() => ({ limited: false })),
    addRecord: vi.fn(),
}));

vi.mock('../src/anti-detect.js', () => ({
    safetyCheck: vi.fn(() => ({ safe: true })),
    recordFailure: vi.fn(),
    recordSuccess: vi.fn(),
    simulateScrollToElement: vi.fn(),
    simulateMouseMoveToElement: vi.fn(),
    isCircuitBroken: vi.fn(() => false),
}));

vi.mock('../src/filter.js', () => ({
    getUngreetedTargets: vi.fn(() => []),
    getRecommendApiLoadSeq: vi.fn(() => 0),
    markGreeted: vi.fn(),
    filterByDOM: vi.fn(),
}));

function installScrollMetrics(el, { clientHeight, scrollHeight, scrollTop = 0 }) {
    let currentTop = scrollTop;
    let currentHeight = scrollHeight;

    Object.defineProperty(el, 'clientHeight', {
        configurable: true,
        get: () => clientHeight,
    });
    Object.defineProperty(el, 'scrollHeight', {
        configurable: true,
        get: () => currentHeight,
    });
    Object.defineProperty(el, 'scrollTop', {
        configurable: true,
        get: () => currentTop,
        set: (value) => {
            currentTop = value;
        },
    });

    el.scrollTo = vi.fn(({ top }) => {
        currentTop = top;
    });

    return {
        setScrollHeight(value) {
            currentHeight = value;
        },
    };
}

function buildRecommendListHtml() {
    return `
        <div class="candidate-body">
            <div class="recommend-list-wrap">
                <div id="recommend-list" class="card-list-wrap">
                    <div class="list-body" style="overflow-y: auto;">
                        <ul class="card-list">
                            <li class="card-item"><div class="candidate-card-wrap"><span class="name">候选人1</span></div></li>
                            <li class="card-item"><div class="candidate-card-wrap"><span class="name">候选人2</span></div></li>
                            <li class="card-item"><div class="candidate-card-wrap"><span class="name">候选人3</span></div></li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function installDocumentScrollMetrics({ innerHeight = 900, scrollHeight = 2400 } = {}) {
    Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        value: innerHeight,
    });
    Object.defineProperty(document.body, 'scrollHeight', {
        configurable: true,
        value: scrollHeight,
    });
    Object.defineProperty(document.documentElement, 'scrollHeight', {
        configurable: true,
        value: scrollHeight,
    });
}

function installWindowScrollMetrics({ innerHeight = 900, scrollHeight = 2400, scrollTop = 0 } = {}) {
    let currentTop = scrollTop;
    let currentHeight = scrollHeight;

    Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        value: innerHeight,
    });
    Object.defineProperty(window, 'scrollY', {
        configurable: true,
        get: () => currentTop,
    });
    Object.defineProperty(document.body, 'scrollHeight', {
        configurable: true,
        get: () => currentHeight,
    });
    Object.defineProperty(document.documentElement, 'scrollHeight', {
        configurable: true,
        get: () => currentHeight,
    });
    Object.defineProperty(document.body, 'scrollTop', {
        configurable: true,
        get: () => currentTop,
        set: (value) => {
            currentTop = value;
        },
    });
    Object.defineProperty(document.documentElement, 'scrollTop', {
        configurable: true,
        get: () => currentTop,
        set: (value) => {
            currentTop = value;
        },
    });

    const scrollToMock = vi.spyOn(window, 'scrollTo').mockImplementation((arg1, arg2) => {
        if (typeof arg1 === 'object' && arg1 !== null) {
            currentTop = Number(arg1.top) || 0;
            return;
        }
        currentTop = Number(arg2) || 0;
    });

    return {
        getScrollTop() {
            return currentTop;
        },
        setScrollTop(value) {
            currentTop = value;
        },
        setScrollHeight(value) {
            currentHeight = value;
        },
        scrollToMock,
    };
}

describe('greeting.js load-more scrolling', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        vi.spyOn(Math, 'random').mockReturnValue(0);
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        document.body.innerHTML = buildRecommendListHtml();
    });

    afterEach(() => {
        vi.runOnlyPendingTimers();
        Object.defineProperty(document, 'hidden', {
            configurable: true,
            value: false,
        });
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.resetModules();
    });

    it('should scroll the inner recommend container and detect new cards', async () => {
        const { scrollToLoadMore } = await import('../src/greeting.js');
        const listBody = document.querySelector('.list-body');
        const cardList = document.querySelector('.card-list');
        const cards = document.querySelectorAll('.candidate-card-wrap');
        const lastCard = cards[cards.length - 1];
        const metrics = installScrollMetrics(listBody, {
            clientHeight: 600,
            scrollHeight: 1400,
        });

        lastCard.scrollIntoView = vi.fn();
        const windowScrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

        setTimeout(() => {
            const item = document.createElement('li');
            item.className = 'card-item';
            item.innerHTML = '<div class="candidate-card-wrap"><span class="name">候选人4</span></div>';
            cardList.appendChild(item);
            metrics.setScrollHeight(1900);
        }, 1200);

        const resultPromise = scrollToLoadMore();
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(5000);

        await expect(resultPromise).resolves.toBe(true);
        expect(lastCard.scrollIntoView).toHaveBeenCalled();
        expect(listBody.scrollTo.mock.calls.length + lastCard.scrollIntoView.mock.calls.length).toBeGreaterThan(0);
        expect(windowScrollSpy).not.toHaveBeenCalled();
    });

    it('should return false when scrolling does not load more candidates', async () => {
        const { scrollToLoadMore } = await import('../src/greeting.js');
        const listBody = document.querySelector('.list-body');
        const cards = document.querySelectorAll('.candidate-card-wrap');
        const lastCard = cards[cards.length - 1];

        installScrollMetrics(listBody, {
            clientHeight: 600,
            scrollHeight: 1400,
        });

        lastCard.scrollIntoView = vi.fn();
        installDocumentScrollMetrics();
        const windowScrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

        const resultPromise = scrollToLoadMore();
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(14000);

        await expect(resultPromise).resolves.toBe(false);
        expect(lastCard.scrollIntoView).toHaveBeenCalled();
        expect(windowScrollSpy).toHaveBeenCalled();
    });

    it('should fall back to page scrolling when inner scrolling does not load more candidates', async () => {
        const { scrollToLoadMore } = await import('../src/greeting.js');
        const listBody = document.querySelector('.list-body');
        const cardList = document.querySelector('.card-list');
        const cards = document.querySelectorAll('.candidate-card-wrap');
        const lastCard = cards[cards.length - 1];

        installScrollMetrics(listBody, {
            clientHeight: 600,
            scrollHeight: 1400,
        });
        installDocumentScrollMetrics();

        lastCard.scrollIntoView = vi.fn();
        const windowScrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {
            setTimeout(() => {
                const item = document.createElement('li');
                item.className = 'card-item';
                item.innerHTML = '<div class="candidate-card-wrap"><span class="name">候选人4</span></div>';
                cardList.appendChild(item);
            }, 300);
        });

        const resultPromise = scrollToLoadMore();
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(15000);

        await expect(resultPromise).resolves.toBe(true);
        expect(lastCard.scrollIntoView).toHaveBeenCalled();
        expect(windowScrollSpy).toHaveBeenCalled();
    });

    it('should bounce from the page bottom to retrigger loading when already at the end', async () => {
        const { scrollToLoadMore } = await import('../src/greeting.js');
        const listBody = document.querySelector('.list-body');
        const cardList = document.querySelector('.card-list');
        const cards = document.querySelectorAll('.candidate-card-wrap');
        const lastCard = cards[cards.length - 1];

        Object.defineProperty(listBody, 'clientHeight', {
            configurable: true,
            value: 600,
        });
        Object.defineProperty(listBody, 'scrollHeight', {
            configurable: true,
            value: 600,
        });

        lastCard.scrollIntoView = vi.fn();

        const pageMetrics = installWindowScrollMetrics({
            innerHeight: 900,
            scrollHeight: 2400,
            scrollTop: 1500,
        });

        let retreated = false;
        pageMetrics.scrollToMock.mockImplementation((arg1, arg2) => {
            const nextTop = typeof arg1 === 'object' && arg1 !== null
                ? Number(arg1.top) || 0
                : Number(arg2) || 0;

            if (nextTop < pageMetrics.getScrollTop()) {
                retreated = true;
            }

            pageMetrics.setScrollTop(nextTop);

            if (retreated && nextTop >= 1500) {
                retreated = false;
                setTimeout(() => {
                    const item = document.createElement('li');
                    item.className = 'card-item';
                    item.innerHTML = '<div class="candidate-card-wrap"><span class="name">候选人4</span></div>';
                    cardList.appendChild(item);
                    pageMetrics.setScrollHeight(3000);
                }, 300);
            }
        });

        const resultPromise = scrollToLoadMore();
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(15000);

        await expect(resultPromise).resolves.toBe(true);
        expect(lastCard.scrollIntoView).toHaveBeenCalled();
        expect(pageMetrics.scrollToMock).toHaveBeenCalled();
    });

    it('should keep loading next pages instead of stopping after the first empty page', async () => {
        const greetingModule = await import('../src/greeting.js');
        const configModule = await import('../src/config.js');
        const filterModule = await import('../src/filter.js');

        configModule.getConfig.mockReturnValue({
            autoLoadMore: true,
            greetingTemplates: ['你好，期待与你沟通'],
            skipProbability: 0,
            greetInterval: 0,
            consecutiveLimit: 99,
            restMinSeconds: 0,
            restMaxSeconds: 0,
        });
        configModule.isLimitReached.mockImplementation(() => (
            configModule.incrementCount.mock.calls.length > 0
                ? { limited: true, reason: 'test-stop' }
                : { limited: false }
        ));

        const target = {
            name: '候选人3',
            school: '清华大学',
            title: '前端工程师',
            experience: '3年',
        };
        let getUngreetedTargetsCalls = 0;
        filterModule.getUngreetedTargets.mockImplementation(() => {
            getUngreetedTargetsCalls += 1;
            return getUngreetedTargetsCalls >= 6 ? [target] : [];
        });

        const targetCard = document.querySelectorAll('.candidate-card-wrap')[2];
        targetCard.insertAdjacentHTML('beforeend', '<button class="btn-greet">打招呼</button>');
        targetCard.querySelector('.btn-greet').click = vi.fn();

        const listBody = document.querySelector('.list-body');
        installScrollMetrics(listBody, {
            clientHeight: 600,
            scrollHeight: 1400,
        });
        installDocumentScrollMetrics();
        const windowScrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

        const resultPromise = greetingModule.startAutoGreeting();
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(50000);
        await resultPromise;

        expect(windowScrollSpy.mock.calls.length).toBeGreaterThan(1);
        expect(configModule.incrementCount).toHaveBeenCalledTimes(1);
        expect(filterModule.getUngreetedTargets.mock.calls.length).toBeGreaterThanOrEqual(6);
    }, 15000);

    it('should click a greet button rendered on the outer card container', async () => {
        const greetingModule = await import('../src/greeting.js');
        const configModule = await import('../src/config.js');
        const filterModule = await import('../src/filter.js');

        configModule.getConfig.mockReturnValue({
            autoLoadMore: false,
            greetingTemplates: ['你好，期待与你沟通'],
            skipProbability: 0,
            greetInterval: 0,
            consecutiveLimit: 99,
            restMinSeconds: 0,
            restMaxSeconds: 0,
        });
        configModule.isLimitReached.mockImplementation(() => (
            configModule.incrementCount.mock.calls.length > 0
                ? { limited: true, reason: 'test-stop' }
                : { limited: false }
        ));

        const target = {
            encryptGeekId: 'encrypt-target',
            name: '候选人2',
            school: '清华大学',
            title: '后端工程师',
            experience: '27年应届生',
        };

        filterModule.getUngreetedTargets.mockImplementation(() => [target]);

        const outerCard = document.querySelectorAll('.card-item')[1];
        const innerCard = outerCard.querySelector('.candidate-card-wrap');
        innerCard.setAttribute('data-bh-id', 'encrypt-target');
        outerCard.insertAdjacentHTML('beforeend', '<button class="btn-startchat">打招呼</button>');
        const greetButton = outerCard.querySelector('.btn-startchat');
        const onClick = vi.fn();
        greetButton.addEventListener('click', onClick);

        const resultPromise = greetingModule.startAutoGreeting();
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(5000);
        await resultPromise;

        expect(onClick).toHaveBeenCalledTimes(1);
        expect(configModule.incrementCount).toHaveBeenCalledTimes(1);
    });

    it('should keep running in background when load-more attempts are throttled', async () => {
        const greetingModule = await import('../src/greeting.js');
        const configModule = await import('../src/config.js');
        const filterModule = await import('../src/filter.js');

        configModule.getConfig.mockReturnValue({
            autoLoadMore: true,
            runInBackground: true,
            greetingTemplates: ['你好，期待与你沟通'],
            skipProbability: 0,
            greetInterval: 0,
            consecutiveLimit: 99,
            restMinSeconds: 0,
            restMaxSeconds: 0,
        });
        filterModule.getUngreetedTargets.mockReturnValue([]);
        filterModule.getRecommendApiLoadSeq.mockReturnValue(0);

        Object.defineProperty(document, 'hidden', {
            configurable: true,
            value: true,
        });

        const listBody = document.querySelector('.list-body');
        Object.defineProperty(listBody, 'clientHeight', {
            configurable: true,
            value: 600,
        });
        Object.defineProperty(listBody, 'scrollHeight', {
            configurable: true,
            value: 600,
        });

        installWindowScrollMetrics({
            innerHeight: 900,
            scrollHeight: 2400,
            scrollTop: 1500,
        });

        const resultPromise = greetingModule.startAutoGreeting();
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(70000);

        expect(greetingModule.isGreetingRunning()).toBe(true);

        greetingModule.stopAutoGreeting();
        await vi.advanceTimersByTimeAsync(5000);
        await resultPromise;

        Object.defineProperty(document, 'hidden', {
            configurable: true,
            value: false,
        });
    }, 15000);

    it('should wait briefly for a delayed greet button before failing', async () => {
        const greetingModule = await import('../src/greeting.js');
        const configModule = await import('../src/config.js');
        const filterModule = await import('../src/filter.js');

        configModule.getConfig.mockReturnValue({
            autoLoadMore: false,
            greetingTemplates: ['你好，期待与你沟通'],
            skipProbability: 0,
            greetInterval: 0,
            consecutiveLimit: 99,
            restMinSeconds: 0,
            restMaxSeconds: 0,
        });
        configModule.isLimitReached.mockImplementation(() => (
            configModule.incrementCount.mock.calls.length > 0
                ? { limited: true, reason: 'test-stop' }
                : { limited: false }
        ));

        const target = {
            encryptGeekId: 'encrypt-delay',
            name: '候选人1',
            school: '清华大学',
            title: '前端工程师',
            experience: '27年应届生',
        };

        filterModule.getUngreetedTargets.mockImplementation(() => [target]);

        const outerCard = document.querySelectorAll('.card-item')[0];
        const innerCard = outerCard.querySelector('.candidate-card-wrap');
        innerCard.setAttribute('data-bh-id', 'encrypt-delay');

        const onClick = vi.fn();
        setTimeout(() => {
            outerCard.insertAdjacentHTML('beforeend', '<button class="btn-startchat">打招呼</button>');
            outerCard.querySelector('.btn-startchat').addEventListener('click', onClick);
        }, 300);

        const resultPromise = greetingModule.startAutoGreeting();
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(5000);
        await resultPromise;

        expect(onClick).toHaveBeenCalledTimes(1);
        expect(configModule.incrementCount).toHaveBeenCalledTimes(1);
    });
});
