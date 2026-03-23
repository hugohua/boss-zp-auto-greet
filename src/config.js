/**
 * 配置管理模块
 * 集中管理所有配置项，使用 GM_setValue/GM_getValue 持久化
 */

// ====== 默认配置 ======

const DEFAULTS = {
    // 打招呼间隔（秒）
    greetInterval: 10,
    // 单日打招呼上限
    dailyLimit: 80,
    // 单小时上限
    hourlyLimit: 15,
    // 连续操作上限（到达后触发休息）
    consecutiveLimit: 15,
    // 休息时长范围（秒）
    restMinSeconds: 60,
    restMaxSeconds: 180,
    // 随机跳过概率 0~1
    skipProbability: 0.15,
    // 自动加载更多
    autoLoadMore: true,
    // 工作时段限制
    workHoursEnabled: false,
    workHoursStart: 9,
    workHoursEnd: 18,
    // 风控：行为模拟开关
    behaviorSimEnabled: true,
    // 招呼语模板列表
    greetingTemplates: [
        '你好，看到您的简历非常匹配我们的岗位需求，期待与您进一步沟通！',
        '您好！我们团队正在寻找优秀的人才，您的背景很契合，方便聊聊吗？',
        '你好，看到你的履历很优秀，想和你聊聊我们这边的机会，期待回复~',
        '您好，我们有一个不错的岗位机会，和您的经历非常匹配，欢迎了解！',
        '你好！对你的背景很感兴趣，我们这里有合适的发展机会，方便时可以聊聊~',
    ],
    // 目标院校名单 { name: 学校名, label: 分类 }
    targetSchools: [
        // C9 联盟（9所）
        { name: '清华大学', label: 'C9' },
        { name: '北京大学', label: 'C9' },
        { name: '浙江大学', label: 'C9' },
        { name: '上海交通大学', label: 'C9' },
        { name: '复旦大学', label: 'C9' },
        { name: '南京大学', label: 'C9' },
        { name: '中国科学技术大学', label: 'C9' },
        { name: '哈尔滨工业大学', label: 'C9' },
        { name: '西安交通大学', label: 'C9' },
        // 985（非C9部分）
        { name: '华中科技大学', label: '985' },
        { name: '武汉大学', label: '985' },
        { name: '中山大学', label: '985' },
        { name: '四川大学', label: '985' },
        { name: '北京航空航天大学', label: '985' },
        { name: '同济大学', label: '985' },
        { name: '东南大学', label: '985' },
        { name: '中国人民大学', label: '985' },
        { name: '北京理工大学', label: '985' },
        { name: '南开大学', label: '985' },
        { name: '天津大学', label: '985' },
        { name: '山东大学', label: '985' },
        { name: '中南大学', label: '985' },
        { name: '吉林大学', label: '985' },
        { name: '厦门大学', label: '985' },
        { name: '大连理工大学', label: '985' },
        { name: '北京师范大学', label: '985' },
        { name: '华南理工大学', label: '985' },
        { name: '电子科技大学', label: '985' },
        { name: '重庆大学', label: '985' },
        { name: '湖南大学', label: '985' },
        { name: '西北工业大学', label: '985' },
        { name: '兰州大学', label: '985' },
        { name: '中国农业大学', label: '985' },
        { name: '中国海洋大学', label: '985' },
        { name: '中央民族大学', label: '985' },
        { name: '东北大学', label: '985' },
        { name: '华东师范大学', label: '985' },
        { name: '国防科技大学', label: '985' },
        { name: '西北农林科技大学', label: '985' },
        // 211（非985部分，精选）
        { name: '上海财经大学', label: '211' },
        { name: '中央财经大学', label: '211' },
        { name: '对外经济贸易大学', label: '211' },
        { name: '北京邮电大学', label: '211' },
        { name: '华东理工大学', label: '211' },
        { name: '南京航空航天大学', label: '211' },
        { name: '南京理工大学', label: '211' },
        { name: '西安电子科技大学', label: '211' },
        { name: '哈尔滨工程大学', label: '211' },
        { name: '武汉理工大学', label: '211' },
        { name: '西南财经大学', label: '211' },
        { name: '中南财经政法大学', label: '211' },
        { name: '北京交通大学', label: '211' },
        { name: '北京科技大学', label: '211' },
        { name: '北京外国语大学', label: '211' },
        { name: '上海外国语大学', label: '211' },
        { name: '中国政法大学', label: '211' },
        { name: '华中师范大学', label: '211' },
        { name: '苏州大学', label: '211' },
        { name: '南京师范大学', label: '211' },
        { name: '暨南大学', label: '211' },
        { name: '郑州大学', label: '211' },
        { name: '云南大学', label: '211' },
    ],
    // 启用的院校分类（可选择性开关）
    enabledSchoolLabels: ['C9', '985', '211'],
};

// ====== 存储键 ======
const STORAGE_KEY = 'boss_helper_config';
const RECORDS_KEY = 'boss_helper_records';
const DAILY_COUNT_KEY = 'boss_helper_daily_count';

// ====== 运行时配置 ======
let currentConfig = null;

/**
 * 安全调用 GM_getValue
 */
function gmGet(key, defaultValue) {
    try {
        if (typeof GM_getValue === 'function') {
            return GM_getValue(key, defaultValue);
        }
    } catch (e) {
        // GM API 不可用
    }
    // 回退到 localStorage
    try {
        const val = localStorage.getItem(key);
        return val !== null ? JSON.parse(val) : defaultValue;
    } catch (e) {
        return defaultValue;
    }
}

/**
 * 安全调用 GM_setValue
 */
function gmSet(key, value) {
    try {
        if (typeof GM_setValue === 'function') {
            GM_setValue(key, value);
            return;
        }
    } catch (e) {
        // GM API 不可用
    }
    // 回退到 localStorage
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        // 忽略
    }
}

// ====== 公开 API ======

/**
 * 加载配置（合并默认值 + 持久化值）
 */
export function loadConfig() {
    const saved = gmGet(STORAGE_KEY, {});
    currentConfig = { ...DEFAULTS, ...saved };
    return currentConfig;
}

/**
 * 获取当前配置
 */
export function getConfig() {
    if (!currentConfig) return loadConfig();
    return currentConfig;
}

/**
 * 更新配置项并持久化
 */
export function updateConfig(partial) {
    currentConfig = { ...getConfig(), ...partial };
    gmSet(STORAGE_KEY, currentConfig);
    return currentConfig;
}

/**
 * 重置为默认配置
 */
export function resetConfig() {
    currentConfig = { ...DEFAULTS };
    gmSet(STORAGE_KEY, currentConfig);
    return currentConfig;
}

// ====== 院校匹配 ======

/**
 * 匹配学校名称，返回匹配到的院校对象 { name, label } 或 null
 * 仅匹配 enabledSchoolLabels 中启用的分类
 */
export function matchSchool(schoolText, config) {
    if (!schoolText) return null;
    config = config || getConfig();
    const enabledLabels = config.enabledSchoolLabels || ['C9', '985', '211'];
    for (const s of config.targetSchools) {
        if (enabledLabels.includes(s.label) && schoolText.includes(s.name)) {
            return s;
        }
    }
    return null;
}

/**
 * 按分类统计目标院校数量
 */
export function getSchoolLabelCounts(candidates) {
    const counts = { C9: 0, '985': 0, '211': 0 };
    for (const c of candidates) {
        if (c.schoolLabel && counts[c.schoolLabel] !== undefined) {
            counts[c.schoolLabel]++;
        }
    }
    return counts;
}

// ====== 打招呼记录管理 ======

/**
 * 获取所有打招呼记录
 */
export function getRecords() {
    return gmGet(RECORDS_KEY, []);
}

/**
 * 添加一条打招呼记录
 */
export function addRecord(record) {
    const records = getRecords();
    records.push({
        ...record,
        greetingTime: new Date().toLocaleString(),
    });
    // 最多保留最近 500 条
    if (records.length > 500) records.splice(0, records.length - 500);
    gmSet(RECORDS_KEY, records);
    return records;
}

/**
 * 清空记录
 */
export function clearRecords() {
    gmSet(RECORDS_KEY, []);
}

// ====== 每日计数管理 ======

function getDailyCountData() {
    const today = new Date().toISOString().slice(0, 10);
    const data = gmGet(DAILY_COUNT_KEY, { date: today, total: 0, hourly: {} });
    // 日期变了就重置
    if (data.date !== today) {
        return { date: today, total: 0, hourly: {} };
    }
    return data;
}

/**
 * 获取今日已打招呼次数
 */
export function getDailyCount() {
    return getDailyCountData().total;
}

/**
 * 获取当前小时已打招呼次数
 */
export function getHourlyCount() {
    const data = getDailyCountData();
    const hour = new Date().getHours().toString();
    return data.hourly[hour] || 0;
}

/**
 * 增加计数
 */
export function incrementCount() {
    const data = getDailyCountData();
    data.total += 1;
    const hour = new Date().getHours().toString();
    data.hourly[hour] = (data.hourly[hour] || 0) + 1;
    gmSet(DAILY_COUNT_KEY, data);
    return data;
}

/**
 * 检查是否达到限额
 */
export function isLimitReached() {
    const config = getConfig();
    if (getDailyCount() >= config.dailyLimit) return { limited: true, reason: '已达今日上限' };
    if (getHourlyCount() >= config.hourlyLimit) return { limited: true, reason: '已达本小时上限' };
    return { limited: false, reason: '' };
}
