/**
 * 配置管理模块
 * 集中管理所有配置项，使用 GM_setValue/GM_getValue 持久化
 */

// ====== 默认配置 ======

const DEFAULTS = {
    // 打招呼间隔（秒）
    greetInterval: 10,
    // 单日打招呼上限
    dailyLimit: 150,
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
    // 风控：后台持续运行开关
    runInBackground: true,
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
        // 补充院校
        { name: '南京航空航天大学', label: '211' },
        { name: '北京交通大学', label: '211' },
        { name: '哈尔滨工程大学', label: '211' },
        { name: '西安电子科技大学', label: '211' },
        { name: '南方科技大学', label: '强相关' },
        { name: '华东理工大学', label: '211' },
        { name: '南京理工大学', label: '211' },
        { name: '重庆邮电大学', label: '强相关' },
        { name: '西南交通大学', label: '211' },
        { name: '北京科技大学', label: '211' },
        { name: '北京邮电大学', label: '211' },
        { name: '上海大学', label: '211' },
        { name: '暨南大学', label: '211' },
        { name: '合肥工业大学', label: '211' },
        { name: '南京邮电大学', label: '强相关' },
        { name: '杭州电子科技大学', label: '强相关' },
        { name: '武汉理工大学', label: '211' },
        { name: '西北大学', label: '211' },
        { name: '深圳大学', label: '强相关' },
        { name: '香港大学', label: '211' },
        { name: '香港科技大学', label: '211' },
        { name: '香港中文大学', label: '211' },
        { name: '香港城市大学', label: '211' },
        { name: '香港理工大学', label: '211' },
        { name: '麻省理工学院', label: 'TOP50' },
        { name: '牛津大学', label: 'TOP50' },
        { name: '剑桥大学', label: 'TOP50' },
        { name: '斯坦福大学', label: 'TOP50' },
        { name: '哈佛大学', label: 'TOP50' },
        { name: '加州理工学院', label: 'TOP50' },
        { name: '帝国理工学院', label: 'TOP50' },
        { name: '伦敦大学学院', label: 'TOP50' },
        { name: '苏黎世联邦理工学院', label: 'TOP50' },
        { name: '芝加哥大学', label: 'TOP50' },
        { name: '新加坡国立大学', label: 'TOP50' },
        { name: '南洋理工大学', label: 'TOP50' },
        { name: '宾夕法尼亚大学', label: 'TOP50' },
        { name: '洛桑联邦理工学院', label: 'TOP50' },
        { name: '耶鲁大学', label: 'TOP50' },
        { name: '爱丁堡大学', label: 'TOP50' },
        { name: '哥伦比亚大学', label: 'TOP50' },
        { name: '普林斯顿大学', label: 'TOP50' },
        { name: '康奈尔大学', label: 'TOP50' },
        { name: '密歇根大学安娜堡分校', label: 'TOP50' },
        { name: '东京大学', label: 'TOP50' },
        { name: '约翰霍普金斯大学', label: 'TOP50' },
        { name: '多伦多大学', label: 'TOP50' },
        { name: '麦吉尔大学', label: 'TOP50' },
        { name: '加州大学伯克利分校', label: 'TOP50' },
        { name: '墨尔本大学', label: 'TOP50' },
        { name: '加州大学洛杉矶分校', label: 'TOP50' },
        { name: '纽约大学', label: 'TOP50' },
        { name: '巴黎文理研究大学', label: 'TOP50' },
        { name: '英属哥伦比亚大学', label: 'TOP50' },
        { name: '加州大学圣地亚哥分校', label: 'TOP50' },
        { name: '巴黎理工学院', label: 'TOP50' },
        { name: '慕尼黑工业大学', label: 'TOP50' },
        { name: '卡耐基梅隆大学', label: 'TOP50' },
        { name: '东京工业大学', label: 'TOP50' },
        { name: '代尔夫特理工大学', label: 'TOP50' },
        { name: '德克萨斯大学奥斯汀分校', label: 'TOP50' },
        { name: '索邦大学', label: 'TOP50' },
        { name: '莫斯科国立大学', label: 'TOP50' },
        { name: '伊利诺伊大学厄本那-香槟分校', label: 'TOP50' },
        { name: '华盛顿大学', label: 'TOP50' },
        { name: '佐治亚理工学院', label: 'TOP50' },
        { name: '瑞典皇家理工学院', label: 'TOP50' },
        { name: '南加州大学', label: 'TOP50' },
        { name: '普渡大学西拉法叶分校', label: 'TOP50' },
        { name: '埃因霍温理工大学', label: 'TOP50' },
        { name: '米兰理工大学', label: 'TOP50' },
        { name: '滑铁卢大学', label: 'TOP50' },
        { name: '柏林工业大学', label: 'TOP50' },
        { name: '亚琛工业大学', label: 'TOP50' },
        { name: '曼彻斯特大学', label: '海外' },
        { name: '澳洲国立大学', label: '海外' },
        { name: '西北大学（美国）', label: '海外' },
        { name: '京都大学', label: '海外' },
        { name: '伦敦大学国王学院', label: '海外' },
        { name: '首尔国立大学', label: '海外' },
        { name: '悉尼大学', label: '海外' },
        { name: '新南威尔士大学', label: '海外' },
        { name: '昆士兰大学', label: '海外' },
        { name: '伦敦政治经济学院', label: '海外' },
        { name: '杜克大学', label: '海外' },
        { name: '阿姆斯特丹大学', label: '海外' },
        { name: '莫纳什大学', label: '海外' },
        { name: '布朗大学', label: '海外' },
        { name: '华威大学', label: '海外' },
        { name: '布里斯托大学', label: '海外' },
        { name: '海德堡大学', label: '海外' },
        { name: '慕尼黑大学', label: '海外' },
        { name: '马来亚大学', label: '海外' },
        { name: '国立台湾大学', label: '海外' },
        { name: '鲁汶大学（荷语）', label: '海外' },
        { name: '苏黎世大学', label: '海外' },
        { name: '格拉斯哥大学', label: '海外' },
        { name: '高丽大学', label: '海外' },
        { name: '威斯康辛大学麦迪逊分校', label: '海外' },
        { name: '大阪大学', label: '海外' },
        { name: '南安普敦大学', label: '海外' },
        { name: '延世大学', label: '海外' },
        { name: '哥本哈根大学', label: '海外' },
        { name: '浦项科技大学', label: '海外' },
        { name: '东北大学（日本）', label: '海外' },
        { name: '杜伦大学', label: '海外' },
        { name: '奥克兰大学', label: '海外' },
        { name: '巴黎萨克雷大学', label: '海外' },
        { name: '隆德大学', label: '海外' },
        { name: '伯明翰大学', label: '海外' },
        { name: '圣安德鲁斯大学', label: '海外' },
        { name: '利兹大学', label: '海外' },
        { name: '西澳大学', label: '海外' },
        { name: '莱斯大学', label: '海外' },
        { name: '谢菲尔德大学', label: '海外' },
        { name: '宾州州立大学公园分校', label: '海外' },
        { name: '成均馆大学', label: '海外' },
        { name: '丹麦科技大学', label: '海外' },
        { name: '北卡罗来纳大学教堂山分校', label: '海外' },
        { name: '都柏林圣三一学院', label: '海外' },
        { name: '奥斯陆大学', label: '海外' },
        { name: '诺丁汉大学', label: '海外' },
        { name: '赫尔辛基大学', label: '海外' },
        { name: '日内瓦大学', label: '海外' },
        { name: '圣路易斯华盛顿大学', label: '海外' },
        { name: '阿卜杜勒阿齐兹国王大学', label: '海外' },
        { name: '乌得勒支大学', label: '海外' },
        { name: '蒙特利尔大学', label: '海外' },
        { name: '波士顿大学', label: '海外' },
        { name: '阿尔托大学', label: '海外' },
        { name: '莱顿大学', label: '海外' },
        { name: '伦敦大学玛丽女王学院', label: '海外' },
        { name: '名古屋大学', label: '海外' },
        { name: '伯尔尼大学', label: '海外' },
        { name: '俄亥俄州立大学', label: '海外' },
        { name: '查尔姆斯工业大学', label: '海外' },
        { name: '万格宁根大学', label: '海外' },
        { name: '九州大学', label: '海外' },
        { name: '乌普萨拉大学', label: '海外' },
        { name: '阿尔伯塔大学', label: '海外' },
        { name: '柏林自由大学', label: '海外' },
        { name: '柏林洪堡大学', label: '海外' },
        { name: '格罗宁根大学', label: '海外' },
        { name: '纽卡斯尔大学（英国）', label: '海外' },
        { name: '卡尔斯鲁厄理工学院', label: '海外' },
        { name: '加州大学戴维斯分校', label: '海外' },
        { name: '巴塞尔大学', label: '海外' },
        { name: '麦克马斯特大学', label: '海外' },
        { name: '根特大学', label: '海外' },
        { name: '北海道大学', label: '海外' },
        { name: '加州大学圣塔芭芭拉分校', label: '海外' },
        { name: '斯德哥尔摩大学', label: '海外' },
        { name: '维也纳大学', label: '海外' },
        { name: '罗切斯特大学', label: '海外' },
        { name: '奥胡斯大学', label: '海外' },
        { name: '汉阳大学', label: '海外' },
        { name: '密歇根州立大学', label: '海外' },
        { name: '马里兰大学学院公园分校', label: '海外' },
        { name: '艾茉莉大学', label: '海外' },
        { name: '凯斯西储大学', label: '海外' },
        { name: '匹兹堡大学', label: '海外' },
        { name: '博洛尼亚大学', label: '海外' },
        { name: '德州农工大学', label: '海外' },
        { name: '巴塞罗那大学', label: '海外' },
        { name: '罗马第一大学', label: '海外' },
        { name: '佛罗里达大学', label: '海外' },
        { name: '都柏林大学学院', label: '海外' },
        { name: '蒂宾根大学', label: '海外' },
        { name: '伊拉斯姆斯大学', label: '海外' },
        { name: '国立清华大学', label: '海外' },
        { name: '哥德堡大学', label: '海外' },
        { name: '明尼苏达大学双城分校', label: '海外' },
        { name: '鲁汶大学（法语）', label: '海外' },
        { name: '特文特大学', label: '海外' },
        { name: '达特茅斯学院', label: '海外' },
        { name: '德累斯顿工业大学', label: '海外' },
        { name: '早稻田大学', label: '海外' },
        { name: '亚利桑那州立大学', label: '海外' },
        { name: '弗吉尼亚大学', label: '海外' },
        { name: '加州大学尔湾分校', label: '海外' },
        { name: '圣彼得堡国立大学', label: '海外' },
        { name: '东北大学（美国）', label: '海外' }
    ],
    // 启用的院校分类（可选择性开关）
    enabledSchoolLabels: ['C9', '985', '211', '强相关', 'TOP50', '海外'],
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
    const enabledLabels = config.enabledSchoolLabels || ['C9', '985', '211', '强相关', 'TOP50', '海外'];
    for (const s of config.targetSchools) {
        if (enabledLabels.includes(s.label) && schoolText.includes(s.name)) {
            return s;
        }
    }
    return null;
}

/**
 * 按分类统计目标院校数量（动态收集所有标签）
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

/**
 * 解析学校文本（多行，每行格式：学校名 类别 或 学校名,类别）
 * 返回 [{ name, label }] 数组
 */
export function parseSchoolsText(text) {
    if (!text || !text.trim()) return [];
    const results = [];
    const lines = text.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        // 支持逗号或空格分隔
        let parts;
        if (trimmed.includes(',') || trimmed.includes('，')) {
            parts = trimmed.split(/[,，]/).map(s => s.trim()).filter(Boolean);
        } else {
            parts = trimmed.split(/\s+/).filter(Boolean);
        }
        const name = parts[0];
        const label = parts[1] || '其他';
        if (name) {
            results.push({ name, label });
        }
    }
    return results;
}

/**
 * 将 targetSchools 数组序列化为多行文本
 */
export function serializeSchoolsText(schools) {
    if (!schools || !schools.length) return '';
    return schools.map(s => `${s.name} ${s.label}`).join('\n');
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
    const data = gmGet(DAILY_COUNT_KEY, { date: today, total: 0 });
    // 日期变了就重置
    if (data.date !== today) {
        return { date: today, total: 0 };
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
 * 增加计数
 */
export function incrementCount() {
    const data = getDailyCountData();
    data.total += 1;
    gmSet(DAILY_COUNT_KEY, data);
    return data;
}

/**
 * 检查是否达到限额
 */
export function isLimitReached() {
    const config = getConfig();
    if (getDailyCount() >= config.dailyLimit) return { limited: true, reason: '已达今日上限' };
    return { limited: false, reason: '' };
}
