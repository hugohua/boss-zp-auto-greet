/**
 * 候选人筛选模块
 * 通过 API 拦截获取候选人数据 + DOM 回退解析
 * 支持推荐页和聊天页的目标院校高亮
 */

import { logger, queryAllFallback } from './utils.js';
import { getConfig, matchSchool, readStorage, writeStorage } from './config.js';

// ====== 状态 ======
const geekDataMap = new Map(); // geekId -> candidateInfo
let apiInterceptInstalled = false;
let onCandidatesUpdated = null; // 回调
let onChatGeekInfoUpdated = null; // 聊天页 geek/info 回调

// ====== 学校缓存 ======
const SCHOOL_CACHE_KEY = 'boss_helper_school_cache';
const DOM_FALLBACK_PREFIX = 'dom_fallback_';

function loadSchoolCache() {
    return readStorage(SCHOOL_CACHE_KEY, {});
}

function saveSchoolCache(cache) {
    writeStorage(SCHOOL_CACHE_KEY, cache);
}

function addToSchoolCache(uid, name, school, schoolLabel) {
    const cache = loadSchoolCache();
    cache[String(uid)] = { name, school, schoolLabel, ts: Date.now() };
    // 同时用名字做 key，便于 DOM 匹配
    if (name) cache['name_' + name] = { uid, school, schoolLabel, ts: Date.now() };
    saveSchoolCache(cache);
}

// ====== 公开 API ======

export function setOnCandidatesUpdated(cb) {
    onCandidatesUpdated = cb;
}

export function setOnChatGeekInfoUpdated(cb) {
    onChatGeekInfoUpdated = cb;
}

export function getGeekDataMap() {
    return geekDataMap;
}

/**
 * 安装 API 拦截器，从推荐接口响应中提取候选人数据
 */
export function installApiInterceptor() {
    if (apiInterceptInstalled) return;
    apiInterceptInstalled = true;

    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    // 注意：anti-detect.js 也会覆写 open/send，需要确保初始化顺序
    // 这里监听的是 response 而非 request，不会冲突

    const origXhrOpen = XMLHttpRequest.prototype.open;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this._filterUrl = url;
        return origXhrOpen.call(this, method, url, ...rest);
    };

    const origAddEventListener = XMLHttpRequest.prototype.addEventListener;

    // 拦截 load 事件来读取响应
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (body) {
        if (this._filterUrl && isRecommendApi(this._filterUrl)) {
            this.addEventListener('load', function () {
                try {
                    const data = JSON.parse(this.responseText);
                    if (data.code === 0 && data.zpData) {
                        parseApiCandidates(data.zpData);
                    }
                } catch (e) {
                    // 响应解析失败，忽略
                }
            });
        }
        // 拦截聊天页 geek/info 接口
        if (this._filterUrl && isChatGeekInfoApi(this._filterUrl)) {
            this.addEventListener('load', function () {
                try {
                    const data = JSON.parse(this.responseText);
                    if (data.code === 0 && data.zpData) {
                        parseChatGeekInfo(data.zpData);
                    }
                } catch (e) { /* ignore */ }
            });
        }
        // 拦截聊天列表接口，触发列表扫描
        if (this._filterUrl && isChatListApi(this._filterUrl)) {
            this.addEventListener('load', function () {
                try {
                    const data = JSON.parse(this.responseText);
                    if (data.code === 0 && data.zpData) {
                        parseChatFriendList(data.zpData);
                    }
                } catch (e) { /* ignore */ }
            });
        }
        return origSend.call(this, body);
    };

    logger.info('候选人 API 拦截器已安装');
}

function isRecommendApi(url) {
    return url.includes('/wapi/zpgeek/recommend/') ||
        url.includes('/wapi/zpboss/recommend/') ||
        url.includes('/wapi/zpgeek/search/') ||
        url.includes('/wapi/zpjob/rec/geek/') ||
        url.includes('/wapi/zpjob/rec/f1/card');
}

function isChatGeekInfoApi(url) {
    return url.includes('/wapi/zpjob/chat/geek/info');
}

function isChatListApi(url) {
    return url.includes('/wapi/zprelation/friend/getBossFriendListV2') ||
        url.includes('/wapi/zprelation/friend/filterByLabel');
}

function pickValue(...values) {
    for (const value of values) {
        if (value !== undefined && value !== null && value !== '') {
            return value;
        }
    }
    return '';
}

function extractSchoolFromText(text) {
    if (!text || typeof text !== 'string') return '';

    const normalized = text.replace(/\s+/g, ' ').trim();
    const match = normalized.match(/毕业于\s*([^·]+)/);
    return match ? match[1].trim() : '';
}

function normalizeApiCandidate(geek) {
    const card = geek.geekCard || {};
    const topEdu = Array.isArray(geek.showEdus) ? geek.showEdus[0] : null;
    const cardEdu = card.geekEdu || (Array.isArray(card.geekEdus) ? card.geekEdus[0] : null) || card.geekHighestDegreeEdu || null;

    return {
        uid: pickValue(geek.uid, geek.userId, card.geekId),
        geekId: pickValue(geek.geekId, card.geekId, geek.encryptGeekId),
        encryptGeekId: pickValue(geek.encryptGeekId, card.encryptGeekId, card.encGeekId),
        name: pickValue(geek.geekName, geek.name, card.geekName),
        school: pickValue(
            geek.eduSchool,
            geek.school,
            topEdu?.school,
            cardEdu?.school,
            extractSchoolFromText(card.middleContent?.content),
        ),
        degree: pickValue(
            geek.eduDegree,
            geek.degree,
            topEdu?.degreeName,
            card.geekDegree,
            cardEdu?.degreeName,
        ),
        title: pickValue(
            geek.expectPositionName,
            geek.title,
            card.expectPositionName,
            card.viewExpect?.positionName,
        ),
        experience: pickValue(geek.workYears, geek.experience, card.geekWorkYear),
        age: pickValue(geek.age, card.ageDesc, card.ageLight?.content),
        city: pickValue(geek.cityName, geek.city, card.expectLocationName, card.viewExpect?.locationName),
        lid: pickValue(geek.lid, card.lid),
        securityId: pickValue(geek.securityId, card.securityId),
        expectId: pickValue(geek.expectId, card.expectId),
        source: 'api',
        hasApiData: true,
    };
}

function mergeCandidateInfo(existing, incoming) {
    const hasApiData = !!(existing.hasApiData || incoming.hasApiData);
    const hasDomData = !!(existing.hasDomData || incoming.hasDomData);

    return {
        uid: pickValue(incoming.uid, existing.uid),
        geekId: pickValue(incoming.geekId, existing.geekId),
        encryptGeekId: pickValue(incoming.encryptGeekId, existing.encryptGeekId),
        name: pickValue(incoming.name, existing.name, '未知'),
        school: pickValue(incoming.school, existing.school),
        degree: pickValue(incoming.degree, existing.degree),
        title: pickValue(incoming.title, existing.title),
        experience: pickValue(incoming.experience, existing.experience),
        age: pickValue(incoming.age, existing.age),
        city: pickValue(incoming.city, existing.city),
        lid: pickValue(incoming.lid, existing.lid),
        securityId: pickValue(incoming.securityId, existing.securityId),
        expectId: pickValue(incoming.expectId, existing.expectId),
        source: hasApiData ? 'api' : pickValue(incoming.source, existing.source),
        hasApiData,
        hasDomData,
        greeted: existing.greeted,
        greetedTime: existing.greetedTime,
    };
}

function applyCandidateMatch(candidate, config = getConfig()) {
    const schoolMatch = matchSchool(candidate.school, config);
    candidate.isTarget = !!schoolMatch;
    candidate.schoolLabel = schoolMatch ? schoolMatch.label : '';
    return candidate;
}

function getSchoolLabelClass(label = '') {
    const labelClassMap = {
        '985': 'n985',
        '211': 'n211',
        '强相关': 'strong',
        TOP50: 'top50',
        海外: 'overseas',
    };

    return labelClassMap[label] || label;
}

function createDomFallbackKey({ name = '', school = '', title = '' }) {
    const raw = [name, school, title]
        .map((part) => String(part || '').trim())
        .filter(Boolean)
        .join('|');

    if (!raw) return '';

    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
        hash = ((hash << 5) - hash) + raw.charCodeAt(i);
        hash |= 0;
    }

    return `${DOM_FALLBACK_PREFIX}${Math.abs(hash).toString(36)}`;
}

function findCandidateKeyByIdentity(candidate, preferredKey = '') {
    if (preferredKey && geekDataMap.has(preferredKey)) {
        return preferredKey;
    }

    if (!candidate?.name || !candidate?.school) {
        return '';
    }

    for (const [key, existing] of geekDataMap.entries()) {
        if (key === preferredKey) continue;
        if (existing.name !== candidate.name || existing.school !== candidate.school) continue;

        if (candidate.title && existing.title && candidate.title !== existing.title) {
            continue;
        }

        return key;
    }

    return '';
}

function isDomOnlyCandidate(candidate) {
    return !!candidate && !candidate.hasApiData;
}

function clearRecommendCardHighlight(card) {
    card.classList.remove('boss-helper-target');
    Array.from(card.classList)
        .filter((className) => className.startsWith('bh-target-'))
        .forEach((className) => card.classList.remove(className));
    card.removeAttribute('data-school-label');
    card.querySelectorAll('.bh-card-label').forEach((label) => label.remove());
}

/**
 * 从 API 响应中解析候选人数据
 */
function parseApiCandidates(zpData) {
    const list = zpData.geekList || zpData.resultList || zpData.list || [];
    if (!list.length) return;

    const config = getConfig();
    let targetCount = 0;

    for (const geek of list) {
        const normalized = normalizeApiCandidate(geek);
        const key = normalized.encryptGeekId || normalized.geekId;
        if (!key) continue;

        const existingKey = findCandidateKeyByIdentity(normalized, key);
        const existing = existingKey ? (geekDataMap.get(existingKey) || {}) : {};
        const info = applyCandidateMatch(mergeCandidateInfo(existing, normalized), config);
        if (info.isTarget) targetCount++;

        geekDataMap.set(key, info);
        if (existingKey && existingKey !== key) {
            geekDataMap.delete(existingKey);
        }

        // 将目标院校候选人写入持久化缓存（供聊天页使用）
        if (info.isTarget && info.uid) {
            addToSchoolCache(info.uid, info.name, info.school, info.schoolLabel);
        }
    }

    logger.info(`API 解析: 获取 ${list.length} 名候选人，目标院校 ${targetCount} 名`);
    if (onCandidatesUpdated) onCandidatesUpdated(geekDataMap);
}

/**
 * 解析聊天页 geek/info 接口响应，提取学校数据并缓存
 */
function parseChatGeekInfo(zpData) {
    const data = zpData.data;
    if (!data || !data.uid) return;

    const config = getConfig();
    const school = data.school || '';
    const schoolMatch = matchSchool(school, config);

    if (schoolMatch) {
        addToSchoolCache(data.uid, data.geekName || data.name || '', school, schoolMatch.label);
        logger.info(`聊天 geek/info: ${data.geekName || data.name || data.uid} → ${school} [${schoolMatch.label}]`);
    }

    // 触发右侧面板高亮和左侧列表刷新
    if (onChatGeekInfoUpdated) {
        onChatGeekInfoUpdated({ uid: data.uid, name: data.geekName || data.name || '', school, schoolMatch });
    }
}

/**
 * 解析聊天列表好友接口，触发左侧列表扫描
 */
function parseChatFriendList(zpData) {
    const list = zpData.friendList || [];
    if (!list.length) return;

    logger.info(`聊天列表 API: 获取 ${list.length} 名联系人，触发列表扫描`);
    // 触发聊天列表 DOM 扫描
    if (onChatGeekInfoUpdated) {
        onChatGeekInfoUpdated({ type: 'listRefresh' });
    }
}

/**
 * DOM 回退筛选（当 API 拦截未生效时使用）
 */
export function filterByDOM(options = {}) {
    const { notify = true } = options;
    document.body.classList.add('bh-recommend-mode');
    document.body.classList.remove('bh-chat-mode');
    const config = getConfig();
    const cardSelectors = [
        '.candidate-card-wrap',
        '.recommend-card-wrap',
        '.card-item',
        '.candidate-card',
        '.card-list > li',
        '[class*="geek-card"]',
    ];

    const cards = queryAllFallback(cardSelectors);
    let targetCount = 0;
    const seenKeys = new Set();

    cards.forEach(card => {
        clearRecommendCardHighlight(card);

        // 尝试多种选择器获取学校信息
        const schoolSelectors = [
            '.edu-exps .join-text-wrap.content span:first-child',
            '.timeline-wrap.edu-exps .content span:first-child',
            '.edu-exps .content',
            '[class*="school"]',
            '[class*="edu"]',
            '.info-school',
            '.geek-school',
        ];

        let schoolText = '';
        for (const sel of schoolSelectors) {
            const el = card.querySelector(sel);
            if (el) {
                schoolText = el.textContent.trim();
                break;
            }
        }

        if (!schoolText) {
            // 尝试从整个卡片文本中匹配学校
            const fullText = card.textContent;
            for (const s of config.targetSchools) {
                if (fullText.includes(s.name)) {
                    schoolText = s.name;
                    break;
                }
            }
        }

        // 提取基本信息
        const nameEl = card.querySelector('span.name') || card.querySelector('[class*="name"]:not([class*="company"]):not([class*="wrap"])');
        const titleEl = card.querySelector('[class*="title"], [class*="position"]');

        const name = nameEl ? nameEl.textContent.trim() : '未知';
        const title = titleEl ? titleEl.textContent.trim() : '';

        const baseInfo = {
            geekId: '',
            name,
            school: schoolText,
            title,
            source: 'dom',
            hasDomData: true,
        };

        // 尝试获取 geekId
        let encryptGeekId = card.getAttribute('data-bh-id');

        if (!encryptGeekId) {
            // 优先检查新型 BOSS 直聘卡片原生封装属性
            const geekEl = card.querySelector('[data-geek], [data-geekid]');
            if (geekEl) {
                encryptGeekId = geekEl.getAttribute('data-geekid') || geekEl.getAttribute('data-geek') || '';
            }

            if (!encryptGeekId) {
                const link = card.querySelector('a[href*="geek"]');
                if (link) {
                    const match = link.href.match(/\/([a-zA-Z0-9_-]+)\.html/);
                    if (match) {
                        encryptGeekId = match[1];
                    } else if (link.href.includes('?')) {
                        try {
                            const urlParams = new URLSearchParams(link.href.split('?')[1]);
                            encryptGeekId = urlParams.get('geekId') || urlParams.get('encryptGeekId') || '';
                        } catch (e) { }
                    }
                }
            }
            if (!encryptGeekId) {
                const btn = card.querySelector('[ka*="greet"], .btn-greet');
                if (btn) {
                    encryptGeekId = btn.getAttribute('data-geekid') || btn.getAttribute('data-encryptid') || '';
                }
            }
            if (!encryptGeekId) {
                encryptGeekId = findCandidateKeyByIdentity(baseInfo) || createDomFallbackKey(baseInfo);
            }
        }

        if (encryptGeekId) {
            seenKeys.add(encryptGeekId);
            card.setAttribute('data-bh-id', encryptGeekId);
        }

        const existing = encryptGeekId ? (geekDataMap.get(encryptGeekId) || {}) : {};
        const info = applyCandidateMatch(mergeCandidateInfo(existing, {
            ...baseInfo,
            encryptGeekId,
        }), config);

        if (encryptGeekId) {
            if (info.isTarget || info.hasApiData) {
                geekDataMap.set(encryptGeekId, info);
            } else {
                geekDataMap.delete(encryptGeekId);
            }
        }

        if (!info.isTarget) {
            return;
        }

        card.classList.add('boss-helper-target');
        if (info.schoolLabel) {
            const labelClass = getSchoolLabelClass(info.schoolLabel);
            card.classList.add(`bh-target-${labelClass}`);
            card.setAttribute('data-school-label', info.schoolLabel);

            const labelSpan = document.createElement('span');
            labelSpan.className = `bh-card-label ${labelClass}`;
            labelSpan.textContent = info.schoolLabel;

            // 尝试插在名字或学校旁边
            if (nameEl && nameEl.parentNode) {
                nameEl.parentNode.appendChild(labelSpan);
            } else {
                const schoolEl = card.querySelector('[class*="school"], [class*="edu"], .info-school, .geek-school');
                if (schoolEl && schoolEl.parentNode) {
                    schoolEl.parentNode.appendChild(labelSpan);
                }
            }
        }

        targetCount++;
    });

    for (const [key, candidate] of geekDataMap.entries()) {
        applyCandidateMatch(candidate, config);
        if (isDomOnlyCandidate(candidate) && (!seenKeys.has(key) || !candidate.isTarget)) {
            geekDataMap.delete(key);
        }
    }

    logger.info(`DOM 筛选: 扫描 ${cards.length} 张卡片，目标院校 ${targetCount} 名`);
    if (notify && onCandidatesUpdated) onCandidatesUpdated(geekDataMap);
    return targetCount;
}

/**
 * 获取目标候选人列表
 */
export function getTargetCandidates() {
    const config = getConfig();
    return Array.from(geekDataMap.values()).filter((candidate) => applyCandidateMatch(candidate, config).isTarget);
}

/**
 * 获取未打招呼的目标候选人
 */
export function getUngreetedTargets() {
    return getTargetCandidates().filter(c => !c.greeted);
}

/**
 * 标记候选人已打招呼
 */
export function markGreeted(key) {
    const info = geekDataMap.get(key);
    if (info) {
        info.greeted = true;
        info.greetedTime = new Date().toLocaleString();
    }
}

// ====== 聊天页高亮 ======

/**
 * 聊天列表左侧卡片高亮（基于缓存匹配）
 */
export function filterChatListByDOM() {
    document.body.classList.add('bh-chat-mode');
    document.body.classList.remove('bh-recommend-mode');
    const cache = loadSchoolCache();
    const cacheKeys = Object.keys(cache);
    logger.info(`[聊天高亮] 开始扫描, 缓存条目数: ${cacheKeys.length}`);
    if (cacheKeys.length > 0) {
        logger.info(`[聊天高亮] 缓存 keys 示例: ${cacheKeys.slice(0, 6).join(', ')}`);
    }

    const cards = document.querySelectorAll('.geek-item-wrap');
    logger.info(`[聊天高亮] 找到 ${cards.length} 张 .geek-item-wrap 卡片`);
    let newTargetCount = 0;
    let existingTargetCount = 0;

    cards.forEach((card, idx) => {
        // 已经高亮过的跳过
        if (card.querySelector('.bh-card-label')) {
            existingTargetCount++;
            return;
        }

        // 从 data-id 提取 uid（格式为 "uid-jobSource"）
        const geekItem = card.querySelector('.geek-item');
        const dataId = geekItem ? geekItem.getAttribute('data-id') : '';
        const uid = dataId ? dataId.split('-')[0] : '';

        // 从 .geek-name 获取名字
        const nameEl = card.querySelector('.geek-name');
        const name = nameEl ? nameEl.textContent.trim() : '';

        // 调试：前5张卡片输出详细信息
        if (idx < 5) {
            logger.info(`[聊天高亮] 卡片${idx}: uid=${uid}, name=${name}, dataId=${dataId}`);
        }

        // 优先用 uid 查缓存，其次用名字
        let cached = uid ? cache[uid] : null;
        if (!cached && name) {
            cached = cache['name_' + name];
        }

        if (idx < 5) {
            logger.info(`[聊天高亮] 卡片${idx}: 缓存命中=${!!cached}, schoolLabel=${cached ? cached.schoolLabel : 'N/A'}`);
        }

        if (cached && cached.schoolLabel) {
            const config = getConfig();
            // 检查该分类是否启用
            if (!config.enabledSchoolLabels.includes(cached.schoolLabel)) {
                logger.info(`[聊天高亮] 卡片${idx}: ${cached.schoolLabel} 未在 enabledSchoolLabels 中启用`);
                return;
            }

            const labelClass = getSchoolLabelClass(cached.schoolLabel);

            // 添加高亮类
            card.classList.add('boss-helper-target', `bh-target-${labelClass}`);
            card.setAttribute('data-school-label', cached.schoolLabel);

            // 注入标签到 .geek-name 旁
            if (nameEl && nameEl.parentNode) {
                const labelSpan = document.createElement('span');
                labelSpan.className = `bh-card-label ${labelClass}`;
                labelSpan.textContent = cached.schoolLabel;
                nameEl.parentNode.insertBefore(labelSpan, nameEl.nextSibling);
            }

            logger.info(`[聊天高亮] ✅ 卡片${idx}: ${name} → ${cached.school} [${cached.schoolLabel}] 已高亮`);
            newTargetCount++;
        }
    });

    const totalTargets = newTargetCount + existingTargetCount;
    logger.info(`[聊天高亮] 扫描完成: ${cards.length} 张卡片，画面中共 ${totalTargets} 名目标院校 (新增高亮 ${newTargetCount} 名)`);
    return totalTargets;
}

/**
 * 聊天窗右侧面板高亮
 * 当 geek/info 接口返回目标院校时，在 conversation-main 中标注
 */
export function highlightConversationPanel(info) {
    if (!info || !info.schoolMatch) return;

    let retries = 0;

    // 使用轮询等待 Vue 重新渲染右侧聊天面板完成
    const tryInject = () => {
        const panel = document.querySelector('.conversation-main');
        if (!panel && retries < 15) {
            retries++;
            setTimeout(tryInject, 100);
            return;
        }

        const headerNameSelectors = [
            '.chat-conversation .title-area .title',
            '.chat-conversation .name',
            '.info-header .geek-name',
            '.conversation-main .title',
            '.conversation-header .name',
            '.conversation-box [class*="name"]'
        ];

        let targetEl = null;
        for (const sel of headerNameSelectors) {
            const el = panel ? panel.querySelector(sel) : document.querySelector(sel);
            // 确保找到的标题元素内容确实包含这个目标的名字，避免把旧人的名字高亮起到了新人的学校
            if (el && el.textContent.includes(info.name)) {
                targetEl = el;
                break;
            }
        }

        if (!targetEl) {
            if (retries < 15) {
                retries++;
                setTimeout(tryInject, 100);
            }
            return;
        }

        // 移除全局或父级内旧的高亮标记（防止重复插入）
        document.querySelectorAll('.bh-chat-school-label').forEach(el => el.remove());

        const labelClass = getSchoolLabelClass(info.schoolMatch.label);
        const labelSpan = document.createElement('span');
        labelSpan.className = `bh-card-label bh-chat-school-label ${labelClass}`;
        labelSpan.textContent = `${info.schoolMatch.label} · ${info.school}`;
        labelSpan.style.marginLeft = '8px';

        targetEl.appendChild(labelSpan);
        logger.info(`聊天窗高亮: ${info.name} → ${info.school} [${info.schoolMatch.label}]`);
    };

    tryInject();

    // 同时刷新左侧列表（可能此用户之前没高亮）
    filterChatListByDOM();
}
