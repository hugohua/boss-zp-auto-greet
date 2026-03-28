import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import {
    getTargetCandidates,
    getUngreetedTargets,
    markGreeted,
    getGeekDataMap,
    installApiInterceptor,
    filterByDOM,
    filterChatListByDOM,
    highlightConversationPanel,
    setOnCandidatesUpdated,
    setOnChatGeekInfoUpdated,
} from '../src/filter.js';
import { logger } from '../src/utils.js';

let mockConfig;
let mockStorage;

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
    readStorage: (key, defaultValue) => (key in mockStorage ? mockStorage[key] : defaultValue),
    writeStorage: vi.fn((key, value) => {
        mockStorage[key] = value;
    }),
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
        mockStorage = {};
        mockConfig = {
            targetSchools: [
                { name: '清华大学', label: 'C9' },
                { name: '北京大学', label: 'C9' },
            ],
            enabledSchoolLabels: ['C9', '985', '211'],
            freshGraduateMode: false,
        };

        // 清空内部 geekDataMap
        const map = getGeekDataMap();
        map.clear();
        document.body.innerHTML = '';
        setOnCandidatesUpdated(null);
        setOnChatGeekInfoUpdated(null);
        logger.info.mockClear();
        logger.warn.mockClear();
        logger.error.mockClear();
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

        it('开启应届生模式后只保留 27年应届生', () => {
            const map = getGeekDataMap();
            map.set('id1', {
                geekId: 'id1',
                name: '张三',
                school: '清华大学',
                schoolLabel: 'C9',
                isTarget: true,
                experience: '27年应届生',
                graduateYear: 2027,
                freshGraduate: 3,
            });
            map.set('id2', {
                geekId: 'id2',
                name: '李四',
                school: '北京大学',
                schoolLabel: 'C9',
                isTarget: true,
                experience: '3年',
                graduateYear: 2024,
                freshGraduate: 0,
            });

            mockConfig = {
                ...mockConfig,
                freshGraduateMode: true,
            };

            const targets = getTargetCandidates();
            expect(targets).toHaveLength(1);
            expect(targets[0].name).toBe('张三');
        });

        it('关闭应届生模式后应排除 27年应届生', () => {
            const map = getGeekDataMap();
            map.set('id1', {
                geekId: 'id1',
                name: '张三',
                school: '清华大学',
                schoolLabel: 'C9',
                isTarget: true,
                experience: '27年应届生',
                graduateYear: 2027,
                freshGraduate: 3,
            });
            map.set('id2', {
                geekId: 'id2',
                name: '李四',
                school: '北京大学',
                schoolLabel: 'C9',
                isTarget: true,
                experience: '3年',
                graduateYear: 2024,
                freshGraduate: 0,
            });

            const targets = getTargetCandidates();
            expect(targets).toHaveLength(1);
            expect(targets[0].name).toBe('李四');
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
            mockConfig = {
                ...mockConfig,
                freshGraduateMode: true,
            };

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
                                freshGraduate: 3,
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
                graduateYear: 2027,
                freshGraduate: 3,
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

        it('应能从聊天 geek/info 接口提取院校与届别信息', () => {
            mockConfig = {
                ...mockConfig,
                enabledSchoolLabels: ['强相关', 'C9', '985', '211'],
                targetSchools: [
                    { name: '杭州电子科技大学', label: '强相关' },
                    ...mockConfig.targetSchools,
                ],
            };

            const onChatInfo = vi.fn();
            setOnChatGeekInfoUpdated(onChatInfo);

            const xhr = new XMLHttpRequest();
            xhr.open('GET', '/wapi/zpjob/chat/geek/info?uid=123864541');
            xhr.responseText = JSON.stringify({
                code: 0,
                zpData: {
                    data: {
                        uid: 123864541,
                        name: '汪博特',
                        school: '杭州电子科技大学',
                        major: '计算数学',
                        edu: '硕士',
                        year: '27年应届生',
                        positionStatus: '在校-月内到岗',
                        applyStatusDes: '曾任',
                        eduExpList: [
                            {
                                timeDesc: '2024-2027',
                                school: '杭州电子科技大学',
                                major: '计算数学',
                                degree: '硕士',
                            },
                        ],
                    },
                },
            });

            xhr.send();

            expect(onChatInfo).toHaveBeenCalledTimes(1);
            const info = onChatInfo.mock.calls[0][0];
            expect(info.name).toBe('汪博特');
            expect(info.school).toBe('杭州电子科技大学');
            expect(info.major).toBe('计算数学');
            expect(info.degree).toBe('硕士');
            expect(info.experience).toBe('27年应届生');
            expect(info.graduateYear).toBe(2027);
            expect(info.is27FreshGraduate).toBe(true);
            expect(info.schoolMatch.label).toBe('强相关');
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
                freshGraduateMode: false,
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

        it('开启应届生模式后，DOM 里只高亮 27年应届生', () => {
            mockConfig = {
                ...mockConfig,
                freshGraduateMode: true,
            };

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
                    <div class="title">27年应届生</div>
                </div>
                <div class="candidate-card-wrap">
                    <div class="row name-wrap"><span class="name">李四</span></div>
                    <div class="timeline-wrap edu-exps">
                        <div class="join-text-wrap content">
                            <span>北京大学</span>
                            <span>计算机</span>
                            <span>本科</span>
                        </div>
                    </div>
                    <div class="title">26年应届生</div>
                </div>
            `;

            const count = filterByDOM({ notify: false });
            const cards = document.querySelectorAll('.candidate-card-wrap');

            expect(count).toBe(1);
            expect(cards[0].classList.contains('boss-helper-target')).toBe(true);
            expect(cards[1].classList.contains('boss-helper-target')).toBe(false);
        });

        it('关闭应届生模式后，DOM 里应排除 27年应届生', () => {
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
                    <div class="title">27年应届生</div>
                </div>
                <div class="candidate-card-wrap">
                    <div class="row name-wrap"><span class="name">李四</span></div>
                    <div class="timeline-wrap edu-exps">
                        <div class="join-text-wrap content">
                            <span>北京大学</span>
                            <span>计算机</span>
                            <span>本科</span>
                        </div>
                    </div>
                    <div class="title">3年</div>
                </div>
            `;

            const count = filterByDOM({ notify: false });
            const cards = document.querySelectorAll('.candidate-card-wrap');

            expect(count).toBe(1);
            expect(cards[0].classList.contains('boss-helper-target')).toBe(false);
            expect(cards[1].classList.contains('boss-helper-target')).toBe(true);
        });

        it('重扫前应清理挂在外层容器上的旧高亮', () => {
            mockConfig = {
                ...mockConfig,
                freshGraduateMode: true,
            };

            document.body.innerHTML = `
                <li class="card-item boss-helper-target bh-target-C9" data-school-label="C9">
                    <div class="candidate-card-wrap">
                        <div class="row name-wrap">
                            <span class="name">张三</span>
                            <span class="bh-card-label C9">C9</span>
                        </div>
                        <div class="timeline-wrap edu-exps">
                            <div class="join-text-wrap content">
                                <span>清华大学</span>
                                <span>计算机</span>
                                <span>本科</span>
                            </div>
                        </div>
                        <div class="title">26年应届生</div>
                    </div>
                </li>
            `;

            const count = filterByDOM({ notify: false });
            const outerCard = document.querySelector('.card-item');
            const innerCard = document.querySelector('.candidate-card-wrap');

            expect(count).toBe(0);
            expect(outerCard.classList.contains('boss-helper-target')).toBe(false);
            expect(outerCard.getAttribute('data-school-label')).toBeNull();
            expect(innerCard.classList.contains('boss-helper-target')).toBe(false);
            expect(document.querySelector('.bh-card-label')).toBeNull();
        });
    });

    describe('filterChatListByDOM', () => {
        it('重复扫描聊天列表时不应重复创建标签节点', () => {
            mockStorage.boss_helper_school_cache = {
                '604704359': {
                    name: '杜康磊',
                    school: '清华大学',
                    schoolLabel: 'C9',
                    is27FreshGraduate: false,
                },
            };

            document.body.innerHTML = `
                <div class="user-list">
                    <div class="geek-item-wrap">
                        <div class="geek-item" data-id="604704359-0">
                            <div class="title">
                                <span class="geek-item-top">
                                    <span class="geek-name">杜康磊</span>
                                    <span class="source-job">Agent开发工程师</span>
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            expect(filterChatListByDOM()).toBe(1);

            const firstLabel = document.querySelector('.bh-card-label[data-bh-chat-label="1"]');
            expect(firstLabel).not.toBeNull();
            expect(firstLabel.textContent).toBe('C9');

            expect(filterChatListByDOM()).toBe(1);

            const labels = document.querySelectorAll('.bh-card-label[data-bh-chat-label="1"]');
            expect(labels).toHaveLength(1);
            expect(labels[0]).toBe(firstLabel);
        });

        it('招聘模式不匹配时应只输出汇总日志，不再逐卡刷屏', () => {
            mockStorage.boss_helper_school_cache = {
                '604704359': {
                    name: '杜康磊',
                    school: '清华大学',
                    schoolLabel: 'C9',
                    is27FreshGraduate: true,
                },
                '604704360': {
                    name: '王小明',
                    school: '北京大学',
                    schoolLabel: 'C9',
                    is27FreshGraduate: true,
                },
            };

            mockConfig = {
                ...mockConfig,
                freshGraduateMode: false,
            };

            document.body.innerHTML = `
                <div class="user-list">
                    <div class="geek-item-wrap">
                        <div class="geek-item" data-id="604704359-0">
                            <span class="geek-item-top"><span class="geek-name">杜康磊</span></span>
                        </div>
                    </div>
                    <div class="geek-item-wrap">
                        <div class="geek-item" data-id="604704360-0">
                            <span class="geek-item-top"><span class="geek-name">王小明</span></span>
                        </div>
                    </div>
                </div>
            `;

            expect(filterChatListByDOM()).toBe(0);

            const messages = logger.info.mock.calls.map((args) => args.join(' '));
            expect(messages.some((message) => message.includes('与当前招聘模式不匹配，跳过'))).toBe(false);
            expect(messages.some((message) => message.includes('招聘模式不匹配 2 张'))).toBe(true);
        });

        it('应在会话详情区渲染目标院校信息条', () => {
            mockConfig = {
                ...mockConfig,
                enabledSchoolLabels: ['强相关', 'C9', '985', '211'],
                targetSchools: [
                    { name: '杭州电子科技大学', label: '强相关' },
                    ...mockConfig.targetSchools,
                ],
                freshGraduateMode: true,
            };

            document.body.innerHTML = `
                <div class="chat-conversation">
                    <div class="conversation-main">
                        <div class="base-info-single-top-detail">
                            <div class="base-info-item name-contet">
                                <span class="base-name">
                                    <span class="name-container">
                                        <span class="name-box">汪博特</span>
                                    </span>
                                </span>
                            </div>
                        </div>
                        <div class="base-info-single-main slide-content">
                            <div class="content">
                                <div class="position-content">
                                    <div class="position-item expect">
                                        <span class="label">期望：</span>
                                        <span class="value job">杭州 · 数据开发</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            highlightConversationPanel({
                name: '汪博特',
                school: '杭州电子科技大学',
                major: '计算数学',
                degree: '硕士',
                experience: '27年应届生',
                positionStatus: '在校-月内到岗',
                graduateYear: 2027,
                is27FreshGraduate: true,
                schoolMatch: { name: '杭州电子科技大学', label: '强相关' },
            });

            const headerLabel = document.querySelector('.bh-chat-school-label');
            const summary = document.querySelector('.bh-chat-target-summary');

            expect(headerLabel).not.toBeNull();
            expect(headerLabel.textContent).toBe('强相关');
            expect(summary).not.toBeNull();
            expect(summary.textContent).toContain('目标院校');
            expect(summary.textContent).toContain('杭州电子科技大学');
            expect(summary.textContent).toContain('27年应届生');
            expect(summary.textContent).not.toContain('与当前招聘模式不匹配');
        });
    });
});
