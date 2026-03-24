/**
 * 配置管理模块
 * 集中管理所有配置项，使用 GM_setValue/GM_getValue 持久化
 */

// ====== 默认配置 ======

const DEFAULTS = {
    // 打招呼间隔（秒）
    greetInterval: 10,
    // 单日打招呼上限
    dailyLimit: 100,
    // 单小时上限
    hourlyLimit: 50,
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
    // 默认目标院校与标签配置
    targetSchoolsText: `清华大学 C9
北京大学 C9
浙江大学 C9
上海交通大学 C9
复旦大学 C9
南京大学 C9
中国科学技术大学 C9
哈尔滨工业大学 C9
西安交通大学 C9
华中科技大学 985
武汉大学 985
中山大学 985
四川大学 985
北京航空航天大学 985
同济大学 985
东南大学 985
中国人民大学 985
北京理工大学 985
南开大学 985
天津大学 985
山东大学 985
中南大学 985
吉林大学 985
厦门大学 985
大连理工大学 985
北京师范大学 985
华南理工大学 985
电子科技大学 985
重庆大学 985
湖南大学 985
西北工业大学 985
兰州大学 985
中国农业大学 985
中国海洋大学 985
中央民族大学 985
东北大学 985
华东师范大学 985
国防科技大学 985
西北农林科技大学 985
上海财经大学 211
中央财经大学 211
对外经济贸易大学 211
北京邮电大学 211
华东理工大学 211
南京航空航天大学 211
南京理工大学 211
西安电子科技大学 211
哈尔滨工程大学 211
武汉理工大学 211
西南财经大学 211
中南财经政法大学 211
北京交通大学 211
北京科技大学 211
北京外国语大学 211
上海外国语大学 211
中国政法大学 211
华中师范大学 211
苏州大学 211
南京师范大学 211
暨南大学 211
郑州大学 211
云南大学 211`,
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
    parseTargetSchools(currentConfig);
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
    if (partial.targetSchoolsText !== undefined) {
        parseTargetSchools(currentConfig);
    }
    gmSet(STORAGE_KEY, currentConfig);
    return currentConfig;
}

/**
 * 重置为默认配置
 */
export function resetConfig() {
    currentConfig = { ...DEFAULTS };
    parseTargetSchools(currentConfig);
    gmSet(STORAGE_KEY, currentConfig);
    return currentConfig;
}

// ====== 院校匹配 ======

/**
 * 解析 targetSchoolsText 并生成 targetSchools 数组
 */
function parseTargetSchools(config) {
    const text = config.targetSchoolsText || '';
    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
    const schools = [];
    for (const line of lines) {
        const parts = line.split(/[ ,，\t]+/);
        if (parts.length >= 2) {
            schools.push({ name: parts[0], label: parts[1] });
        }
    }
    config.targetSchools = schools;
}

/**
 * 匹配学校名称，返回匹配到的院校对象 { name, label } 或 null
 * 仅匹配 enabledSchoolLabels 中启用的分类
 */
export function matchSchool(schoolText, config) {
    if (!schoolText) return null;
    config = config || getConfig();
    const enabledLabels = config.enabledSchoolLabels || [];
    for (const s of (config.targetSchools || [])) {
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
    const counts = {};
    for (const c of candidates) {
        if (c.schoolLabel) {
            counts[c.schoolLabel] = (counts[c.schoolLabel] || 0) + 1;
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
