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
