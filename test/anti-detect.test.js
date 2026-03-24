import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    isCircuitBroken,
    resetCircuitBreaker,
    recordFailure,
    recordSuccess,
} from '../src/anti-detect.js';

// Mock logger to suppress console output during tests
vi.mock('../src/utils.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        logger: {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            getHistory: () => [],
        },
    };
});

// Mock config module
vi.mock('../src/config.js', () => ({
    getConfig: () => ({
        greetInterval: 10,
        dailyLimit: 80,
        consecutiveLimit: 15,
    }),
}));

describe('anti-detect.js', () => {
    describe('熔断器逻辑', () => {
        beforeEach(() => {
            resetCircuitBreaker();
        });

        it('初始状态不应处于熔断', () => {
            expect(isCircuitBroken()).toBe(false);
        });

        it('1-2 次失败不应触发熔断', () => {
            recordFailure('error 1');
            expect(isCircuitBroken()).toBe(false);
            recordFailure('error 2');
            expect(isCircuitBroken()).toBe(false);
        });

        it('连续 3 次失败应触发熔断', () => {
            recordFailure('error 1');
            recordFailure('error 2');
            recordFailure('error 3');
            expect(isCircuitBroken()).toBe(true);
        });

        it('recordSuccess 应该重置失败计数', () => {
            recordFailure('error 1');
            recordFailure('error 2');
            recordSuccess();
            recordFailure('error 3');
            // 因为中间成功一次，所以只累计 1 次失败
            expect(isCircuitBroken()).toBe(false);
        });

        it('resetCircuitBreaker 应该重置熔断状态', () => {
            recordFailure('error 1');
            recordFailure('error 2');
            recordFailure('error 3');
            expect(isCircuitBroken()).toBe(true);
            resetCircuitBreaker();
            expect(isCircuitBroken()).toBe(false);
        });
    });
});
