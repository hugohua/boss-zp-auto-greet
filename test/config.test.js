import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    matchSchool,
    parseSchoolsText,
    serializeSchoolsText,
    getSchoolLabelCounts,
    loadConfig,
    getConfig,
    updateConfig,
    resetConfig,
    getRecords,
    addRecord,
    clearRecords,
    getDailyCount,
    isLimitReached,
} from '../src/config.js';

describe('config.js', () => {
    // 每次测试前重置配置，确保隔离
    beforeEach(() => {
        localStorage.clear();
        resetConfig();
    });

    afterEach(() => {
        localStorage.clear();
    });

    // ====== 院校匹配 ======
    describe('matchSchool', () => {
        it('应该匹配到目标院校并返回对象', () => {
            const config = getConfig();
            const result = matchSchool('清华大学', config);
            expect(result).not.toBeNull();
            expect(result.name).toBe('清华大学');
            expect(result.label).toBe('C9');
        });

        it('应该匹配到包含学校名的文本', () => {
            const config = getConfig();
            const result = matchSchool('毕业于清华大学计算机系', config);
            expect(result).not.toBeNull();
            expect(result.name).toBe('清华大学');
        });

        it('当不在目标院校列表中时应返回 null', () => {
            const config = getConfig();
            expect(matchSchool('某某大学', config)).toBeNull();
        });

        it('当文本为空时应返回 null', () => {
            const config = getConfig();
            expect(matchSchool('', config)).toBeNull();
            expect(matchSchool(null, config)).toBeNull();
        });

        it('应该只匹配已启用分类中的院校', () => {
            const config = { ...getConfig(), enabledSchoolLabels: ['C9'] };
            // C9 院校依然匹配
            expect(matchSchool('清华大学', config)).not.toBeNull();
            // 985 院校不应匹配（未启用）
            expect(matchSchool('华南理工大学', config)).toBeNull();
        });
    });

    // ====== 解析与序列化 ======
    describe('parseSchoolsText', () => {
        it('应该解析逗号分隔的学校文本', () => {
            const result = parseSchoolsText('清华大学,C9\n北京大学,C9');
            expect(result).toEqual([
                { name: '清华大学', label: 'C9' },
                { name: '北京大学', label: 'C9' },
            ]);
        });

        it('应该解析中文逗号分隔的学校文本', () => {
            const result = parseSchoolsText('清华大学，C9\n北京大学，C9');
            expect(result).toEqual([
                { name: '清华大学', label: 'C9' },
                { name: '北京大学', label: 'C9' },
            ]);
        });

        it('应该解析空格分隔的学校文本', () => {
            const result = parseSchoolsText('清华大学 C9\n北京大学 C9');
            expect(result).toEqual([
                { name: '清华大学', label: 'C9' },
                { name: '北京大学', label: 'C9' },
            ]);
        });

        it('应该在缺少分类时默认为"其他"', () => {
            const result = parseSchoolsText('某某大学');
            expect(result).toEqual([{ name: '某某大学', label: '其他' }]);
        });

        it('应该跳过空行', () => {
            const result = parseSchoolsText('清华大学 C9\n\n北京大学 C9');
            expect(result.length).toBe(2);
        });

        it('空文本应返回空数组', () => {
            expect(parseSchoolsText('')).toEqual([]);
            expect(parseSchoolsText(null)).toEqual([]);
            expect(parseSchoolsText('   ')).toEqual([]);
        });
    });

    describe('serializeSchoolsText', () => {
        it('应该将学校数组序列化为多行文本', () => {
            const result = serializeSchoolsText([
                { name: '清华大学', label: 'C9' },
                { name: '北京大学', label: 'C9' },
            ]);
            expect(result).toBe('清华大学 C9\n北京大学 C9');
        });

        it('空数组应返回空字符串', () => {
            expect(serializeSchoolsText([])).toBe('');
            expect(serializeSchoolsText(null)).toBe('');
        });
    });

    describe('getSchoolLabelCounts', () => {
        it('应该正确统计各分类数量', () => {
            const candidates = [
                { schoolLabel: 'C9' },
                { schoolLabel: 'C9' },
                { schoolLabel: '985' },
                { schoolLabel: '' },
                {},
            ];
            const counts = getSchoolLabelCounts(candidates);
            expect(counts).toEqual({ C9: 2, '985': 1 });
        });

        it('空列表应返回空对象', () => {
            expect(getSchoolLabelCounts([])).toEqual({});
        });
    });

    // ====== 配置管理 ======
    describe('配置管理', () => {
        it('loadConfig 应该返回包含默认值的配置', () => {
            const config = loadConfig();
            expect(config).toBeDefined();
            expect(config.greetInterval).toBe(10);
            expect(config.dailyLimit).toBe(200);
            expect(config.freshGraduateMode).toBe(false);
            expect(Array.isArray(config.greetingTemplates)).toBe(true);
        });

        it('getConfig 应该返回已加载的配置', () => {
            loadConfig();
            const config = getConfig();
            expect(config.greetInterval).toBe(10);
        });

        it('updateConfig 应该合并并持久化配置', () => {
            loadConfig();
            updateConfig({ greetInterval: 20 });
            const config = getConfig();
            expect(config.greetInterval).toBe(20);
            // 其他默认值不受影响
            expect(config.dailyLimit).toBe(200);
        });

        it('resetConfig 应该恢复为默认值', () => {
            loadConfig();
            updateConfig({ greetInterval: 999 });
            resetConfig();
            const config = getConfig();
            expect(config.greetInterval).toBe(10);
        });
    });

    // ====== 记录管理 ======
    describe('记录管理', () => {
        it('初始记录应为空', () => {
            expect(getRecords()).toEqual([]);
        });

        it('addRecord 应该添加记录', () => {
            addRecord({ name: '张三', school: '清华大学' });
            const records = getRecords();
            expect(records.length).toBe(1);
            expect(records[0].name).toBe('张三');
            expect(records[0].greetingTime).toBeDefined();
        });

        it('clearRecords 应该清空记录', () => {
            addRecord({ name: '张三' });
            addRecord({ name: '李四' });
            clearRecords();
            expect(getRecords()).toEqual([]);
        });
    });

    // ====== 每日计数 ======
    describe('每日计数', () => {
        it('getDailyCount 初始应为 0', () => {
            expect(getDailyCount()).toBe(0);
        });

        it('isLimitReached 未达上限时应返回 limited: false', () => {
            const result = isLimitReached();
            expect(result.limited).toBe(false);
        });
    });
});
