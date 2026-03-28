import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    randomInterval,
    randomInt,
    chance,
    sleep,
    randomPick,
    logger,
    setLogChangeCallback,
    queryFallback,
    queryAllFallback,
    isDocumentScrollContainer,
    isScrollableElement,
    getScrollMetrics,
    findScrollableContainer,
    scrollContainerTo,
    scrollContainerBy,
    describeScrollContainer,
    getTodayKey,
    getCurrentHour
} from '../src/utils.js';

describe('utils.js', () => {
    describe('随机化工具', () => {
        it('randomInterval 应该返回在波动范围内的值', () => {
            const base = 1000;
            const variance = 0.3; // ±30%
            const min = base * (1 - variance);
            const max = base * (1 + variance);

            for (let i = 0; i < 50; i++) {
                const val = randomInterval(base, variance);
                expect(val).toBeGreaterThanOrEqual(min);
                expect(val).toBeLessThanOrEqual(max);
            }
        });

        it('randomInt 应该返回在 min 和 max 之间的整数', () => {
            const min = 1, max = 5;
            for (let i = 0; i < 50; i++) {
                const val = randomInt(min, max);
                expect(val).toBeGreaterThanOrEqual(min);
                expect(val).toBeLessThanOrEqual(max);
                expect(Number.isInteger(val)).toBe(true);
            }
        });

        it('chance 应该按概率返回布尔值', () => {
            expect(typeof chance(0.5)).toBe('boolean');
            expect(chance(1)).toBe(true);
            expect(chance(0)).toBe(false);
        });

        it('sleep 应该在指定的时间后解决', async () => {
            const start = Date.now();
            await sleep(50);
            const elapsed = Date.now() - start;
            // 允许存在一定误差
            expect(elapsed).toBeGreaterThanOrEqual(40);
        });

        it('randomPick 应该从数组中随机挑选一个元素', () => {
            const arr = [1, 2, 3];
            const val = randomPick(arr);
            expect(arr).toContain(val);

            expect(randomPick([])).toBe(null);
            expect(randomPick(null)).toBe(null);
        });
    });

    describe('日志工具', () => {
        beforeEach(() => {
            // 清理并拦截 console
            vi.spyOn(console, 'log').mockImplementation(() => { });
            vi.spyOn(console, 'warn').mockImplementation(() => { });
            vi.spyOn(console, 'error').mockImplementation(() => { });
        });

        afterEach(() => {
            vi.restoreAllMocks();
            setLogChangeCallback(null);
        });

        it('logger.info 应该记录日志并调用 callback', () => {
            const cb = vi.fn();
            setLogChangeCallback(cb);

            logger.info('test info message');

            const history = logger.getHistory();
            expect(history.length).toBeGreaterThan(0);
            const entry = history[history.length - 1];
            expect(entry.level).toBe('info');
            expect(entry.message).toBe('test info message');
            expect(cb).toHaveBeenCalledWith(history);
            expect(console.log).toHaveBeenCalled();
        });

        it('logger.warn 应该调用 console.warn', () => {
            logger.warn('test warn');
            expect(console.warn).toHaveBeenCalled();
            const history = logger.getHistory();
            expect(history[history.length - 1].level).toBe('warn');
        });

        it('logger.error 应该调用 console.error', () => {
            logger.error('test error', { detail: 1 });
            expect(console.error).toHaveBeenCalled();
            const history = logger.getHistory();
            expect(history[history.length - 1].level).toBe('error');
            expect(history[history.length - 1].message).toBe('test error {"detail":1}');
        });
    });

    describe('DOM 辅助', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <div class="test-class" id="test-id">Content 1</div>
                <div class="test-class">Content 2</div>
                <span class="other-class"></span>
            `;
        });

        it('queryFallback 应该返回第一个匹配的元素', () => {
            const el1 = queryFallback(['#none', '#test-id']);
            expect(el1).not.toBeNull();
            expect(el1.id).toBe('test-id');

            const el2 = queryFallback(['#none', '.none-class']);
            expect(el2).toBeNull();
        });

        it('queryAllFallback 应该返回所有匹配的元素', () => {
            const els1 = queryAllFallback(['.none-class', '.test-class']);
            expect(els1.length).toBe(2);
            expect(els1[0].classList.contains('test-class')).toBe(true);

            const els2 = queryAllFallback(['#none', '.none-class']);
            expect(els2.length).toBe(0);
        });

        it('isScrollableElement 应该识别可滚动容器', () => {
            const el = document.createElement('div');
            el.style.overflowY = 'auto';
            document.body.appendChild(el);

            Object.defineProperty(el, 'clientHeight', { value: 200, configurable: true });
            Object.defineProperty(el, 'scrollHeight', { value: 520, configurable: true });

            expect(isScrollableElement(el)).toBe(true);
            expect(isScrollableElement(null)).toBe(false);
        });

        it('findScrollableContainer 应该优先返回最近的可滚动祖先', () => {
            document.body.innerHTML = `
                <div id="outer" style="overflow-y:auto;">
                    <div id="inner" class="list-body" style="overflow-y:auto;">
                        <div id="target"></div>
                    </div>
                </div>
            `;

            const outer = document.getElementById('outer');
            const inner = document.getElementById('inner');
            const target = document.getElementById('target');

            Object.defineProperty(outer, 'clientHeight', { value: 300, configurable: true });
            Object.defineProperty(outer, 'scrollHeight', { value: 800, configurable: true });
            Object.defineProperty(inner, 'clientHeight', { value: 200, configurable: true });
            Object.defineProperty(inner, 'scrollHeight', { value: 900, configurable: true });

            expect(findScrollableContainer(target, ['.list-body'])).toBe(inner);
        });

        it('scrollContainerTo 应该滚动元素并派发 scroll 事件', () => {
            const el = document.createElement('div');
            let eventCount = 0;
            el.addEventListener('scroll', () => {
                eventCount++;
            });
            el.scrollTo = vi.fn();

            scrollContainerTo(el, 240);

            expect(el.scrollTo).toHaveBeenCalledWith({ top: 240, behavior: 'smooth' });
            expect(eventCount).toBe(1);
        });

        it('scrollContainerBy 应该基于当前 scrollTop 增量滚动', () => {
            const el = document.createElement('div');
            Object.defineProperty(el, 'scrollTop', { value: 120, configurable: true });
            Object.defineProperty(el, 'clientHeight', { value: 200, configurable: true });
            Object.defineProperty(el, 'scrollHeight', { value: 900, configurable: true });
            el.scrollTo = vi.fn();

            scrollContainerBy(el, 80);

            expect(el.scrollTo).toHaveBeenCalledWith({ top: 200, behavior: 'smooth' });
        });

        it('describeScrollContainer 应该输出便于日志排查的容器描述', () => {
            const el = document.createElement('div');
            el.id = 'recommend-list';
            el.className = 'list-body card-list-wrap extra';

            expect(describeScrollContainer(el)).toBe('div#recommend-list.list-body.card-list-wrap');
            expect(isDocumentScrollContainer(window)).toBe(true);
        });

        it('getScrollMetrics 应该读取元素滚动信息', () => {
            const el = document.createElement('div');
            Object.defineProperty(el, 'scrollTop', { value: 88, configurable: true });
            Object.defineProperty(el, 'clientHeight', { value: 320, configurable: true });
            Object.defineProperty(el, 'scrollHeight', { value: 1024, configurable: true });

            expect(getScrollMetrics(el)).toEqual({
                scrollTop: 88,
                clientHeight: 320,
                scrollHeight: 1024,
            });
        });
    });

    describe('日期工具', () => {
        it('getTodayKey 应该返回 YYYY-MM-DD 格式的字符串', () => {
            const val = getTodayKey();
            expect(val).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        });

        it('getCurrentHour 应该返回当前小时数', () => {
            const val = getCurrentHour();
            expect(val).toBeGreaterThanOrEqual(0);
            expect(val).toBeLessThanOrEqual(23);
        });
    });
});
