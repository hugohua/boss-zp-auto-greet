import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import {
    getTargetCandidates,
    getUngreetedTargets,
    markGreeted,
    getGeekDataMap,
    installApiInterceptor,
    filterByDOM,
    setOnCandidatesUpdated,
} from '../src/filter.js';

let mockConfig;

// Mock logger
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

// Mock config
vi.mock('../src/config.js', () => ({
    getConfig: () => mockConfig,
    matchSchool: (text, config = mockConfig) => {
        if (!text) return null;
        for (const s of config.targetSchools) {
            if (!(config.enabledSchoolLabels || []).includes(s.label)) continue;
            if (text.includes(s.name)) return s;
        }
        return null;
    },
    readStorage: (key, defaultValue) => defaultValue,
    writeStorage: vi.fn(),
}));

describe('filter.js', () => {
    class MockXMLHttpRequest {
        constructor() {
            this.listeners = {};
            this.responseText = '';
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
        installApiInterceptor();
    });

    beforeEach(() => {
        mockConfig = {
            targetSchools: [
                { name: '清华大学', label: 'C9' },
                { name: '北京大学', label: 'C9' },
            ],
            enabledSchoolLabels: ['C9', '985', '211'],
        };

        // 清空内部 geekDataMap
        const map = getGeekDataMap();
        map.clear();
        document.body.innerHTML = '';
        setOnCandidatesUpdated(null);
    });

    describe('getTargetCandidates / getUngreetedTargets', () => {
        it('初始应返回空数组', () => {
            expect(getTargetCandidates()).toEqual([]);
            expect(getUngreetedTargets()).toEqual([]);
        });

        it('添加目标候选人后应能获取到', () => {
            const map = getGeekDataMap();
            map.set('id1', { geekId: 'id1', name: '张三', school: '清华大学', isTarget: true, schoolLabel: 'C9' });
            map.set('id2', { geekId: 'id2', name: '李四', school: '某某大学', isTarget: false, schoolLabel: '' });

            const targets = getTargetCandidates();
            expect(targets.length).toBe(1);
            expect(targets[0].name).toBe('张三');
        });

        it('getUngreetedTargets 应该过滤已打招呼的', () => {
            const map = getGeekDataMap();
            map.set('id1', { geekId: 'id1', name: '张三', school: '清华大学', isTarget: true, greeted: false });
            map.set('id2', { geekId: 'id2', name: '李四', school: '北京大学', isTarget: true, greeted: true });

            const ungreeted = getUngreetedTargets();
            expect(ungreeted.length).toBe(1);
            expect(ungreeted[0].name).toBe('张三');
        });

        it('应根据最新配置动态重算目标候选人', () => {
            const map = getGeekDataMap();
            map.set('id1', {
                geekId: 'id1',
                name: '张三',
                school: '清华大学',
                schoolLabel: 'C9',
                isTarget: true,
                hasApiData: true,
            });

            expect(getTargetCandidates()).toHaveLength(1);

            mockConfig = {
                ...mockConfig,
                enabledSchoolLabels: [],
            };

            expect(getTargetCandidates()).toHaveLength(0);
        });
    });

    describe('markGreeted', () => {
        it('应该将指定候选人标记为已打招呼', () => {
            const map = getGeekDataMap();
            map.set('id1', { geekId: 'id1', name: '张三', isTarget: true, greeted: false });

            markGreeted('id1');

            const data = map.get('id1');
            expect(data.greeted).toBe(true);
        });

        it('标记不存在的 key 不应报错', () => {
            expect(() => markGreeted('nonexistent')).not.toThrow();
        });
    });

    describe('installApiInterceptor', () => {
        it('应能从 geek/list 的 geekCard 结构中提取候选人信息', () => {
            const xhr = new XMLHttpRequest();
            xhr.responseText = JSON.stringify({
                code: 0,
                zpData: {
                    geekList: [
                        {
                            encryptGeekId: 'encrypt-1',
                            geekCard: {
                                encryptGeekId: 'encrypt-1',
                                geekName: '黄思佳',
                                geekDegree: '本科',
                                geekWorkYear: '27年应届生',
                                expectPositionName: '数据开发',
                                expectLocationName: '杭州',
                                ageDesc: '21岁',
                                expectId: 1478120370,
                                lid: 'lid-1',
                                securityId: 'security-1',
                                geekEdu: {
                                    school: '清华大学',
                                    degreeName: '本科',
                                },
                            },
                        },
                    ],
                },
            });

            xhr.open('GET', 'https://www.zhipin.com/wapi/zpjob/rec/geek/list?page=1');
            xhr.send();

            const candidate = getGeekDataMap().get('encrypt-1');
            expect(candidate).toMatchObject({
                encryptGeekId: 'encrypt-1',
                name: '黄思佳',
                school: '清华大学',
                degree: '本科',
                title: '数据开发',
                experience: '27年应届生',
                age: '21岁',
                city: '杭州',
                lid: 'lid-1',
                securityId: 'security-1',
                expectId: 1478120370,
                isTarget: true,
                schoolLabel: 'C9',
            });
        });

        it('重复解析同一候选人时应保留已打招呼状态', () => {
            const map = getGeekDataMap();
            map.set('encrypt-1', {
                encryptGeekId: 'encrypt-1',
                name: '旧数据',
                school: '清华大学',
                isTarget: true,
                greeted: true,
            });

            const xhr = new XMLHttpRequest();
            xhr.responseText = JSON.stringify({
                code: 0,
                zpData: {
                    geekList: [
                        {
                            encryptGeekId: 'encrypt-1',
                            geekCard: {
                                encryptGeekId: 'encrypt-1',
                                geekName: '黄思佳',
                                geekEdu: {
                                    school: '清华大学',
                                },
                            },
                        },
                    ],
                },
            });

            xhr.open('GET', 'https://www.zhipin.com/wapi/zpjob/rec/geek/list?page=2');
            xhr.send();

            const candidate = getGeekDataMap().get('encrypt-1');
            expect(candidate.greeted).toBe(true);
            expect(candidate.name).toBe('黄思佳');
        });

        it('新响应缺失字段时不应覆盖已有候选人信息', () => {
            const map = getGeekDataMap();
            map.set('encrypt-2', {
                encryptGeekId: 'encrypt-2',
                name: '王五',
                school: '清华大学',
                title: '前端工程师',
                isTarget: true,
            });

            const xhr = new XMLHttpRequest();
            xhr.responseText = JSON.stringify({
                code: 0,
                zpData: {
                    geekList: [
                        {
                            encryptGeekId: 'encrypt-2',
                            geekCard: {
                                encryptGeekId: 'encrypt-2',
                            },
                        },
                    ],
                },
            });

            xhr.open('GET', 'https://www.zhipin.com/wapi/zpjob/rec/geek/list?page=4');
            xhr.send();

            const candidate = getGeekDataMap().get('encrypt-2');
            expect(candidate.name).toBe('王五');
            expect(candidate.school).toBe('清华大学');
            expect(candidate.title).toBe('前端工程师');
        });

        it('应继续兼容旧的扁平字段结构', () => {
            const xhr = new XMLHttpRequest();
            xhr.responseText = JSON.stringify({
                code: 0,
                zpData: {
                    geekList: [
                        {
                            encryptGeekId: 'encrypt-legacy',
                            geekName: '李四',
                            eduSchool: '北京大学',
                            eduDegree: '硕士',
                            expectPositionName: '算法工程师',
                            workYears: '3年',
                            age: '25岁',
                            cityName: '北京',
                            lid: 'legacy-lid',
                            securityId: 'legacy-security',
                            expectId: 42,
                        },
                    ],
                },
            });

            xhr.open('GET', 'https://www.zhipin.com/wapi/zpjob/rec/geek/list?page=3');
            xhr.send();

            const candidate = getGeekDataMap().get('encrypt-legacy');
            expect(candidate).toMatchObject({
                name: '李四',
                school: '北京大学',
                degree: '硕士',
                title: '算法工程师',
                experience: '3年',
                age: '25岁',
                city: '北京',
                lid: 'legacy-lid',
                securityId: 'legacy-security',
                expectId: 42,
                isTarget: true,
                schoolLabel: 'C9',
            });
        });
    });

    describe('filterByDOM', () => {
        it('notify=false 时不应触发 candidates 更新回调', () => {
            document.body.innerHTML = `
                <div class="candidate-card-wrap">
                    <div class="row name-wrap"><span class="name">张三</span></div>
                    <div class="timeline-wrap edu-exps">
                        <div class="join-text-wrap content">
                            <span>清华大学</span>
                            <span>计算机</span>
                            <span>本科</span>
                        </div>
                    </div>
                </div>
            `;

            const onUpdated = vi.fn();
            setOnCandidatesUpdated(onUpdated);

            filterByDOM({ notify: false });

            expect(onUpdated).not.toHaveBeenCalled();
        });

        it('默认仍应触发 candidates 更新回调', () => {
            document.body.innerHTML = `
                <div class="candidate-card-wrap">
                    <div class="row name-wrap"><span class="name">张三</span></div>
                    <div class="timeline-wrap edu-exps">
                        <div class="join-text-wrap content">
                            <span>清华大学</span>
                            <span>计算机</span>
                            <span>本科</span>
                        </div>
                    </div>
                </div>
            `;

            const onUpdated = vi.fn();
            setOnCandidatesUpdated(onUpdated);

            filterByDOM();

            expect(onUpdated).toHaveBeenCalledTimes(1);
        });

        it('应为无原生 id 的卡片生成稳定回退 key，并保留已打招呼状态', () => {
            document.body.innerHTML = `
                <div class="candidate-card-wrap">
                    <div class="row name-wrap"><span class="name">张三</span></div>
                    <div class="timeline-wrap edu-exps">
                        <div class="join-text-wrap content">
                            <span>清华大学</span>
                            <span>计算机</span>
                            <span>本科</span>
                        </div>
                    </div>
                    <div class="title">前端工程师</div>
                </div>
            `;

            filterByDOM({ notify: false });

            const firstKey = Array.from(getGeekDataMap().keys())[0];
            markGreeted(firstKey);

            document.body.innerHTML = `
                <div class="candidate-card-wrap">
                    <div class="row name-wrap"><span class="name">张三</span></div>
                    <div class="timeline-wrap edu-exps">
                        <div class="join-text-wrap content">
                            <span>清华大学</span>
                            <span>计算机</span>
                            <span>本科</span>
                        </div>
                    </div>
                    <div class="title">前端工程师</div>
                </div>
            `;

            filterByDOM({ notify: false });

            const keys = Array.from(getGeekDataMap().keys());
            expect(keys).toEqual([firstKey]);
            expect(getGeekDataMap().get(firstKey).greeted).toBe(true);
        });

        it('应在卡片消失后清理仅来自 DOM 的旧目标', () => {
            document.body.innerHTML = `
                <div class="candidate-card-wrap">
                    <div class="row name-wrap"><span class="name">张三</span></div>
                    <div class="timeline-wrap edu-exps">
                        <div class="join-text-wrap content">
                            <span>清华大学</span>
                            <span>计算机</span>
                            <span>本科</span>
                        </div>
                    </div>
                </div>
            `;

            filterByDOM({ notify: false });
            expect(getTargetCandidates()).toHaveLength(1);

            document.body.innerHTML = '';
            filterByDOM({ notify: false });

            expect(getTargetCandidates()).toHaveLength(0);
            expect(getGeekDataMap().size).toBe(0);
        });

        it('强相关标签应映射到稳定的样式类名', () => {
            mockConfig = {
                targetSchools: [
                    { name: '杭州电子科技大学', label: '强相关' },
                ],
                enabledSchoolLabels: ['强相关'],
            };

            document.body.innerHTML = `
                <div class="candidate-card-wrap">
                    <div class="row name-wrap"><span class="name">王俊鹏</span></div>
                    <div class="timeline-wrap edu-exps">
                        <div class="join-text-wrap content">
                            <span>杭州电子科技大学</span>
                            <span>计算机</span>
                            <span>本科</span>
                        </div>
                    </div>
                </div>
            `;

            filterByDOM({ notify: false });

            const card = document.querySelector('.candidate-card-wrap');
            const label = document.querySelector('.bh-card-label');

            expect(card.classList.contains('bh-target-strong')).toBe(true);
            expect(card.getAttribute('data-school-label')).toBe('强相关');
            expect(label.classList.contains('strong')).toBe(true);
            expect(label.textContent).toBe('强相关');
        });
    });
});
