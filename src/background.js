/**
 * Background Service Worker — 中枢总线
 * 负责配置存储管理、统计数据收集、Popup ↔ Content 消息转发
 */

// ====== 默认配置 ======

const DEFAULTS = {
    greetInterval: 10,
    dailyLimit: 80,
    hourlyLimit: 15,
    consecutiveLimit: 15,
    restMinSeconds: 60,
    restMaxSeconds: 180,
    skipProbability: 0.15,
    autoLoadMore: true,
    workHoursEnabled: false,
    workHoursStart: 9,
    workHoursEnd: 18,
    behaviorSimEnabled: true,
    greetingTemplates: [
        '你好，看到您的简历非常匹配我们的岗位需求，期待与您进一步沟通！',
        '您好！我们团队正在寻找优秀的人才，您的背景很契合，方便聊聊吗？',
        '你好，看到你的履历很优秀，想和你聊聊我们这边的机会，期待回复~',
        '您好，我们有一个不错的岗位机会，和您的经历非常匹配，欢迎了解！',
        '你好！对你的背景很感兴趣，我们这里有合适的发展机会，方便时可以聊聊~',
    ],
    targetSchools: [
        { name: '清华大学', label: 'C9' }, { name: '北京大学', label: 'C9' },
        { name: '浙江大学', label: 'C9' }, { name: '上海交通大学', label: 'C9' },
        { name: '复旦大学', label: 'C9' }, { name: '南京大学', label: 'C9' },
        { name: '中国科学技术大学', label: 'C9' }, { name: '哈尔滨工业大学', label: 'C9' },
        { name: '西安交通大学', label: 'C9' },
        { name: '华中科技大学', label: '985' }, { name: '武汉大学', label: '985' },
        { name: '中山大学', label: '985' }, { name: '四川大学', label: '985' },
        { name: '北京航空航天大学', label: '985' }, { name: '同济大学', label: '985' },
        { name: '东南大学', label: '985' }, { name: '中国人民大学', label: '985' },
        { name: '北京理工大学', label: '985' }, { name: '南开大学', label: '985' },
        { name: '天津大学', label: '985' }, { name: '山东大学', label: '985' },
        { name: '中南大学', label: '985' }, { name: '吉林大学', label: '985' },
        { name: '厦门大学', label: '985' }, { name: '大连理工大学', label: '985' },
        { name: '北京师范大学', label: '985' }, { name: '华南理工大学', label: '985' },
        { name: '电子科技大学', label: '985' }, { name: '重庆大学', label: '985' },
        { name: '湖南大学', label: '985' }, { name: '西北工业大学', label: '985' },
        { name: '兰州大学', label: '985' }, { name: '中国农业大学', label: '985' },
        { name: '中国海洋大学', label: '985' }, { name: '中央民族大学', label: '985' },
        { name: '东北大学', label: '985' }, { name: '华东师范大学', label: '985' },
        { name: '国防科技大学', label: '985' }, { name: '西北农林科技大学', label: '985' },
        { name: '上海财经大学', label: '211' }, { name: '中央财经大学', label: '211' },
        { name: '对外经济贸易大学', label: '211' }, { name: '北京邮电大学', label: '211' },
        { name: '华东理工大学', label: '211' }, { name: '南京航空航天大学', label: '211' },
        { name: '南京理工大学', label: '211' }, { name: '西安电子科技大学', label: '211' },
        { name: '哈尔滨工程大学', label: '211' }, { name: '武汉理工大学', label: '211' },
        { name: '西南财经大学', label: '211' }, { name: '中南财经政法大学', label: '211' },
        { name: '北京交通大学', label: '211' }, { name: '北京科技大学', label: '211' },
        { name: '北京外国语大学', label: '211' }, { name: '上海外国语大学', label: '211' },
        { name: '中国政法大学', label: '211' }, { name: '华中师范大学', label: '211' },
        { name: '苏州大学', label: '211' }, { name: '南京师范大学', label: '211' },
        { name: '暨南大学', label: '211' }, { name: '郑州大学', label: '211' },
        { name: '云南大学', label: '211' },
    ],
    enabledSchoolLabels: ['C9', '985', '211'],
};

// ====== 内存状态 ======

let runtimeState = {
    running: false,
    circuitBroken: false,
    targetCount: 0,
    c9: 0, '985': 0, '211': 0,
    logs: [],
};

// ====== 消息处理 ======

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    handleMessage(msg, sender).then(sendResponse);
    return true; // 异步响应
});

async function handleMessage(msg, sender) {
    switch (msg.type) {
        case 'GET_CONFIG': {
            const config = await getConfig();
            return config;
        }
        case 'UPDATE_CONFIG': {
            const config = await getConfig();
            const updated = { ...config, ...msg.config };
            await chrome.storage.sync.set({ boss_helper_config: updated });
            return { ok: true };
        }
        case 'GET_STATS': {
            const countData = await getDailyCountData();
            const hour = new Date().getHours().toString();
            return {
                ...runtimeState,
                dailyCount: countData.total,
                hourlyCount: countData.hourly[hour] || 0,
            };
        }
        case 'GET_LOGS': {
            return { logs: runtimeState.logs.slice(-30) };
        }
        case 'ADD_LOG': {
            runtimeState.logs.push(msg.entry);
            if (runtimeState.logs.length > 100) runtimeState.logs = runtimeState.logs.slice(-100);
            return { ok: true };
        }
        case 'UPDATE_RUNTIME': {
            // Content script 上报状态
            Object.assign(runtimeState, msg.state);
            return { ok: true };
        }
        case 'INCREMENT_COUNT': {
            return await incrementCount();
        }
        case 'ADD_RECORD': {
            return await addRecord(msg.record);
        }
        case 'GET_RECORDS': {
            const result = await chrome.storage.local.get('boss_helper_records');
            return { records: result.boss_helper_records || [] };
        }
        case 'ADD_GREETING': {
            const config = await getConfig();
            config.greetingTemplates.push(msg.text);
            await chrome.storage.sync.set({ boss_helper_config: config });
            return { ok: true };
        }
        case 'DELETE_GREETING': {
            const config2 = await getConfig();
            config2.greetingTemplates.splice(msg.index, 1);
            await chrome.storage.sync.set({ boss_helper_config: config2 });
            return { ok: true };
        }
        default:
            return { error: 'unknown message type' };
    }
}

// ====== 配置读取 ======

async function getConfig() {
    const result = await chrome.storage.sync.get('boss_helper_config');
    return { ...DEFAULTS, ...(result.boss_helper_config || {}) };
}

// ====== 计数管理 ======

async function getDailyCountData() {
    const today = new Date().toISOString().slice(0, 10);
    const result = await chrome.storage.local.get('boss_helper_daily');
    let data = result.boss_helper_daily || { date: today, total: 0, hourly: {} };
    if (data.date !== today) {
        data = { date: today, total: 0, hourly: {} };
    }
    return data;
}

async function incrementCount() {
    const data = await getDailyCountData();
    data.total += 1;
    const hour = new Date().getHours().toString();
    data.hourly[hour] = (data.hourly[hour] || 0) + 1;
    await chrome.storage.local.set({ boss_helper_daily: data });
    return data;
}

// ====== 记录管理 ======

async function addRecord(record) {
    const result = await chrome.storage.local.get('boss_helper_records');
    const records = result.boss_helper_records || [];
    records.push({ ...record, greetingTime: new Date().toLocaleString() });
    if (records.length > 500) records.splice(0, records.length - 500);
    await chrome.storage.local.set({ boss_helper_records: records });
    return { ok: true };
}

// ====== 安装事件 ======

chrome.runtime.onInstalled.addListener(() => {
    console.log('BOSS直聘智能招呼助手 v3.0 已安装');
});
