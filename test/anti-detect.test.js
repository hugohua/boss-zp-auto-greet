import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import {
    isCircuitBroken,
    resetCircuitBreaker,
    recordFailure,
    recordSuccess,
    closeVipUpgradeDialog,
    setupVipObserver,
    stopVipObserver,
    isVipUpgradeChatStartResult,
    isChatStartLimitReachedResult,
    installApmInterceptor,
    safetyCheck,
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
    const OriginalXMLHttpRequest = global.XMLHttpRequest;

    class MockXMLHttpRequest {
        constructor() {
            this.listeners = {};
            this.responseText = '';
            this.response = '';
            this.method = '';
            this.url = '';
            this.body = null;
        }

        open(method, url) {
            this.method = method;
            this.url = url;
        }

        addEventListener(event, handler) {
            if (!this.listeners[event]) {
                this.listeners[event] = [];
            }
            this.listeners[event].push(handler);
        }

        send(body) {
            this.body = body;
            const handlers = this.listeners.load || [];
            handlers.forEach((handler) => handler.call(this));
        }
    }

    beforeAll(() => {
        global.XMLHttpRequest = MockXMLHttpRequest;
        installApmInterceptor();
    });

    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = '';
    });

    afterAll(() => {
        global.XMLHttpRequest = OriginalXMLHttpRequest;
    });

    afterEach(() => {
        stopVipObserver();
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
    });

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

    describe('聊天升级卡提示处理', () => {
        beforeEach(() => {
            resetCircuitBreaker();
        });

        it('应该识别 chat/start 的升级提示响应', () => {
            expect(isVipUpgradeChatStartResult({
                status: 3,
                limitTitle: '您的免费开聊权益已升级',
                stateDes: '今日您的主动沟通人数已达100人上限，免费赠送您一张聊天升级卡，今日内有效，可额外沟通50人',
            })).toBe(true);
        });

        it('应该自动点击升级提示弹窗的关闭按钮', () => {
            document.body.innerHTML = `
                <div class="dialog-wrap dialog-icons-default">
                    <div class="dialog-layer"></div>
                    <div class="dialog-container">
                        <div class="dialog-header">
                            <h3 class="title">您的免费开聊权益已升级</h3>
                            <a href="javascript:;" class="close"><i class="icon-close"></i></a>
                        </div>
                        <div class="dialog-body">
                            <div class="tip-text">今日您的主动沟通人数已达100人上限，免费赠送您一张聊天升级卡，今日内有效，可额外沟通50人</div>
                        </div>
                        <div class="dialog-footer">
                            <div class="btns"><span class="btn btn-sure">确定</span></div>
                        </div>
                    </div>
                </div>
            `;

            const closeBtn = document.querySelector('.close');
            closeBtn.click = vi.fn();

            expect(closeVipUpgradeDialog()).toBe(true);
            expect(closeBtn.click).toHaveBeenCalledTimes(1);
        });

        it('不应该重复点击已经脱离 DOM 的升级提示弹窗', () => {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = `
                <div class="dialog-wrap dialog-icons-default">
                    <div class="dialog-layer"></div>
                    <div class="dialog-container">
                        <div class="dialog-header">
                            <h3 class="title">您的免费开聊权益已升级</h3>
                            <a href="javascript:;" class="close"><i class="icon-close"></i></a>
                        </div>
                        <div class="dialog-body">
                            <div class="tip-text">今日您的主动沟通人数已达100人上限，免费赠送您一张聊天升级卡，今日内有效，可额外沟通50人</div>
                        </div>
                    </div>
                </div>
            `;

            const dialog = wrapper.firstElementChild;
            const closeBtn = dialog.querySelector('.close');
            closeBtn.click = vi.fn();

            document.body.appendChild(dialog);
            expect(closeVipUpgradeDialog(dialog)).toBe(true);
            expect(closeBtn.click).toHaveBeenCalledTimes(1);

            dialog.remove();
            expect(closeVipUpgradeDialog(dialog)).toBe(false);
            expect(closeBtn.click).toHaveBeenCalledTimes(1);
        });

        it('setupVipObserver 不应将升级提示弹窗误判为熔断场景', async () => {
            setupVipObserver(vi.fn());

            const dialog = document.createElement('div');
            dialog.innerHTML = `
                <div class="dialog-wrap dialog-icons-default">
                    <div class="dialog-layer"></div>
                    <div class="dialog-container">
                        <div class="dialog-header">
                            <h3 class="title">您的免费开聊权益已升级</h3>
                            <a href="javascript:;" class="close"><i class="icon-close"></i></a>
                        </div>
                        <div class="dialog-body">
                            <div class="tip-text">今日您的主动沟通人数已达100人上限，免费赠送您一张聊天升级卡，今日内有效，可额外沟通50人</div>
                        </div>
                        <div class="dialog-footer">
                            <div class="btns"><span class="btn btn-sure">确定</span></div>
                        </div>
                    </div>
                </div>
            `;

            const closeBtn = dialog.querySelector('.close');
            closeBtn.click = vi.fn();

            document.body.appendChild(dialog.firstElementChild);
            await vi.advanceTimersByTimeAsync(500);

            expect(closeBtn.click).not.toHaveBeenCalled();
            expect(isCircuitBroken()).toBe(false);
        });
    });

    describe('chat/start 沟通上限判定', () => {
        beforeEach(() => {
            resetCircuitBreaker();
        });

        it('应该识别 chat/start 的沟通上限响应', () => {
            expect(isChatStartLimitReachedResult({
                status: 3,
                limitTitle: '今日沟通已达上限',
                stateDes: '今日该职位的主动沟通已达50人 请明日再试',
                blockPageData: {
                    templateId: 25,
                    shortDesc: {
                        name: '开聊不足',
                    },
                },
            })).toBe(true);
        });

        it('应通过接口响应直接触发熔断，而不是依赖 DOM 弹窗', () => {
            const onDetected = vi.fn();
            setupVipObserver(onDetected);

            const xhr = new XMLHttpRequest();
            xhr.responseText = JSON.stringify({
                code: 0,
                zpData: {
                    status: 3,
                    limitTitle: '今日沟通已达上限',
                    stateDes: '今日该职位的主动沟通已达50人 请明日再试',
                    blockPageData: {
                        templateId: 25,
                        shortDesc: {
                            name: '开聊不足',
                        },
                    },
                },
            });

            xhr.open('POST', `https://www.zhipin.com/wapi/zpjob/chat/start?ts=${Date.now()}`);
            xhr.send(JSON.stringify({ securityId: 'mock-security-id' }));

            expect(isCircuitBroken()).toBe(true);
            expect(onDetected).toHaveBeenCalledTimes(1);
            expect(document.body.innerHTML).toBe('');
        });

        it('safetyCheck 不应再因为 DOM 中的沟通上限弹窗而失败', () => {
            document.body.innerHTML = `
                <div class="dialog-wrap">
                    <div class="dialog-container">
                        <div class="dialog-header">
                            <h3 class="title">今日沟通已达上限</h3>
                        </div>
                        <div class="dialog-body">
                            <div class="tip-text">今日该职位的主动沟通已达50人 请明日再试</div>
                        </div>
                    </div>
                </div>
            `;

            expect(safetyCheck()).toEqual({ safe: true, reason: '' });
            expect(isCircuitBroken()).toBe(false);
        });
    });
});
