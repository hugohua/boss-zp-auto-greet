import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    getTargetCandidates,
    getUngreetedTargets,
    markGreeted,
    getGeekDataMap,
} from '../src/filter.js';

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
    getConfig: () => ({
        targetSchools: [
            { name: '清华大学', label: 'C9' },
            { name: '北京大学', label: 'C9' },
        ],
        enabledSchoolLabels: ['C9', '985', '211'],
    }),
    matchSchool: (text, config) => {
        if (!text) return null;
        const schools = [
            { name: '清华大学', label: 'C9' },
            { name: '北京大学', label: 'C9' },
        ];
        for (const s of schools) {
            if (text.includes(s.name)) return s;
        }
        return null;
    },
}));

describe('filter.js', () => {
    beforeEach(() => {
        // 清空内部 geekDataMap
        const map = getGeekDataMap();
        map.clear();
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
            map.set('id1', { geekId: 'id1', name: '张三', isTarget: true, greeted: false });
            map.set('id2', { geekId: 'id2', name: '李四', isTarget: true, greeted: true });

            const ungreeted = getUngreetedTargets();
            expect(ungreeted.length).toBe(1);
            expect(ungreeted[0].name).toBe('张三');
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
});
