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
let recommendApiLoadSeq = 0; // 推荐列表接口成功解析计数

// ====== 学校缓存 ======
const SCHOOL_CACHE_KEY = 'boss_helper_school_cache';
const DOM_FALLBACK_PREFIX = 'dom_fallback_';
const SCHOOL_CACHE_MAX_UID_ENTRIES = 3000;
const CHAT_PREFETCH_CONCURRENCY = 2;
const CHAT_PREFETCH_COOLDOWN_MS = 60 * 1000;

const chatRuntimeMetaMap = new Map(); // uid -> runtime meta
const chatPrefetchInFlight = new Set();
const chatPrefetchAttemptAt = new Map();
const chatPrefetchQueue = [];
let chatPrefetchActiveCount = 0;

function loadSchoolCache() {
    const cache = readStorage(SCHOOL_CACHE_KEY, {});
    return isPlainObject(cache) ? cache : {};
}

function saveSchoolCache(cache) {
    writeStorage(SCHOOL_CACHE_KEY, pruneSchoolCache(cache));
}

function addToSchoolCache(uid, name, school, schoolLabel, extra = {}) {
    const cache = loadSchoolCache();
    const entry = {
        name,
        school,
        schoolLabel,
        experience: extra.experience || '',
        graduateYear: extra.graduateYear || '',
        freshGraduate: extra.freshGraduate ?? '',
        is27FreshGraduate: !!extra.is27FreshGraduate,
        ts: Date.now(),
    };
    cache[String(uid)] = entry;
    // 同时用名字做 key，便于 DOM 匹配
    if (name) cache['name_' + name] = { uid, ...entry };
    saveSchoolCache(cache);
}

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSchoolCacheEntry(entry) {
    if (!isPlainObject(entry)) return null;

    const normalizedTs = Number(entry.ts);
    return {
        ...entry,
        ts: Number.isFinite(normalizedTs) ? normalizedTs : 0,
    };
}

function pruneSchoolCache(cache, maxUidEntries = SCHOOL_CACHE_MAX_UID_ENTRIES) {
    if (!isPlainObject(cache)) return {};

    const uidEntries = Object.entries(cache)
        .filter(([key]) => !String(key).startsWith('name_'))
        .map(([uid, entry]) => [String(uid), normalizeSchoolCacheEntry(entry)])
        .filter(([, entry]) => !!entry)
        .sort(([, left], [, right]) => (right.ts || 0) - (left.ts || 0))
        .slice(0, maxUidEntries);

    const nextCache = {};
    const latestByName = new Map();

    uidEntries.forEach(([uid, entry]) => {
        nextCache[uid] = entry;

        if (!entry.name) return;
        const nameKey = `name_${entry.name}`;
        const current = latestByName.get(nameKey);
        if (!current || (entry.ts || 0) >= (current.entry.ts || 0)) {
            latestByName.set(nameKey, { uid, entry });
        }
    });

    latestByName.forEach(({ uid, entry }, nameKey) => {
        nextCache[nameKey] = { uid, ...entry };
    });

    return nextCache;
}

function getVueRuntimeHandles(card) {
    const handles = [];
    const seen = new Set();
    let node = card;
    let depth = 0;

    while (node && depth < 5) {
        Object.getOwnPropertyNames(node).forEach((key) => {
            if (!/^(__vue|__vnode|_vnode)/.test(key)) return;
            const value = node[key];
            if (!isPlainObject(value) || seen.has(value)) return;
            seen.add(value);
            handles.push(value);
        });
        node = node.parentNode;
        depth++;
    }

    return handles;
}

function buildChatMetaFromRuntimeObject(source, targetUid) {
    if (!isPlainObject(source)) return null;

    const candidates = [
        source,
        source.geek,
        source.item,
        source.friend,
        source.dataSource,
        source.personInfo,
        source.props,
        source.$props,
        source._props,
        source.ctx,
        source.proxy,
        source.setupState,
        source.$data,
        source.transmit,
        source.geekCard,
    ].filter(isPlainObject);

    for (const candidate of candidates) {
        const geekCard = isPlainObject(candidate.geekCard) ? candidate.geekCard : null;
        const dataSource = isPlainObject(candidate.dataSource) ? candidate.dataSource : null;
        const personInfo = isPlainObject(candidate.personInfo) ? candidate.personInfo : null;
        const transmit = isPlainObject(candidate.transmit) ? candidate.transmit : null;

        const uid = pickValue(
            candidate.uid,
            candidate.userId,
            dataSource?.uid,
            dataSource?.userId,
            candidate.user?.uid,
            geekCard?.uid,
            geekCard?.userId,
            personInfo?.uid,
        );
        const securityId = pickValue(
            candidate.securityId,
            geekCard?.securityId,
            dataSource?.securityId,
            personInfo?.securityId,
            transmit?.securityId,
        );

        if (String(uid) !== String(targetUid) || !securityId) continue;

        return {
            uid: String(uid),
            securityId,
            geekSource: pickValue(
                candidate.geekSource,
                geekCard?.geekSource,
                dataSource?.geekSource,
                personInfo?.geekSource,
                0,
            ),
            expectId: pickValue(
                candidate.expectId,
                geekCard?.expectId,
                dataSource?.expectId,
                personInfo?.expectId,
            ),
            encryptGeekId: pickValue(
                candidate.encryptGeekId,
                geekCard?.encryptUserId,
                geekCard?.encryptGeekId,
                dataSource?.encryptGeekId,
                personInfo?.encryptGeekId,
            ),
            encryptJobId: pickValue(
                candidate.encryptJobId,
                geekCard?.encryptJobId,
                dataSource?.encryptJobId,
                personInfo?.encryptJobId,
            ),
            name: pickValue(
                candidate.name,
                candidate.user?.name,
                geekCard?.name,
                dataSource?.name,
                personInfo?.name,
            ),
        };
    }

    return null;
}

function searchChatMetaInRuntime(root, targetUid, visited = new Set(), depth = 0) {
    if (!isPlainObject(root) || visited.has(root) || depth > 5) return null;
    visited.add(root);

    const direct = buildChatMetaFromRuntimeObject(root, targetUid);
    if (direct) return direct;

    const nextNodes = [];
    const priorityKeys = [
        'geek',
        'item',
        'friend',
        'dataSource',
        'personInfo',
        'props',
        '$props',
        '_props',
        'ctx',
        'proxy',
        'setupState',
        '$data',
        'transmit',
        'geekCard',
        'list',
        'friendList',
        'items',
        'records',
        'children',
        'subTree',
        'component',
        'parent',
    ];

    priorityKeys.forEach((key) => {
        const value = root[key];
        if (Array.isArray(value)) {
            nextNodes.push(...value.slice(0, 60));
        } else if (isPlainObject(value)) {
            nextNodes.push(value);
        }
    });

    if (Array.isArray(root)) {
        nextNodes.push(...root.slice(0, 60));
    } else if (depth < 2) {
        Object.values(root).slice(0, 25).forEach((value) => {
            if (Array.isArray(value)) {
                nextNodes.push(...value.slice(0, 40));
            } else if (isPlainObject(value)) {
                nextNodes.push(value);
            }
        });
    }

    for (const next of nextNodes) {
        const result = searchChatMetaInRuntime(next, targetUid, visited, depth + 1);
        if (result) return result;
    }

    return null;
}

function extractChatCardRuntimeMeta(card, uid) {
    if (!uid) return null;

    const cached = chatRuntimeMetaMap.get(String(uid));
    if (cached?.securityId) return cached;

    const handles = getVueRuntimeHandles(card);
    for (const handle of handles) {
        const meta = searchChatMetaInRuntime(handle, uid);
        if (meta?.securityId) {
            chatRuntimeMetaMap.set(String(uid), meta);
            return meta;
        }
    }

    return null;
}

function pumpChatGeekInfoPrefetchQueue() {
    while (chatPrefetchActiveCount < CHAT_PREFETCH_CONCURRENCY && chatPrefetchQueue.length) {
        const meta = chatPrefetchQueue.shift();
        if (!meta?.uid || !meta.securityId) continue;
        if (chatPrefetchInFlight.has(meta.uid)) continue;

        chatPrefetchActiveCount++;
        chatPrefetchInFlight.add(meta.uid);
        chatPrefetchAttemptAt.set(meta.uid, Date.now());

        fetch(`/wapi/zpjob/chat/geek/info?${new URLSearchParams({
            uid: meta.uid,
            geekSource: String(meta.geekSource ?? 0),
            securityId: meta.securityId,
        }).toString()}`, {
            credentials: 'include',
            headers: {
                accept: 'application/json, text/plain, */*',
                'x-requested-with': 'XMLHttpRequest',
            },
        })
            .then((response) => response.ok ? response.json() : null)
            .then((data) => {
                if (data?.code === 0 && data.zpData) {
                    parseChatGeekInfo(data.zpData, { prefetch: true });
                }
            })
            .catch((error) => {
                logger.warn(`[聊天预取] uid=${meta.uid} 详情补拉失败: ${error?.message || error}`);
            })
            .finally(() => {
                chatPrefetchActiveCount = Math.max(0, chatPrefetchActiveCount - 1);
                chatPrefetchInFlight.delete(meta.uid);
                pumpChatGeekInfoPrefetchQueue();
            });
    }
}

function scheduleChatGeekInfoPrefetch(card, uid) {
    const uidKey = String(uid || '');
    if (!uidKey) return;

    const cache = loadSchoolCache();
    if (cache[uidKey]?.schoolLabel) return;
    if (chatPrefetchInFlight.has(uidKey)) return;

    const lastAttemptAt = chatPrefetchAttemptAt.get(uidKey) || 0;
    if (Date.now() - lastAttemptAt < CHAT_PREFETCH_COOLDOWN_MS) return;

    const meta = extractChatCardRuntimeMeta(card, uidKey);
    if (!meta?.securityId) return;

    chatRuntimeMetaMap.set(uidKey, meta);
    chatPrefetchQueue.push(meta);
    pumpChatGeekInfoPrefetchQueue();
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

export function getRecommendApiLoadSeq() {
    return recommendApiLoadSeq;
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

function normalizeCompactText(text) {
    return String(text || '').replace(/\s+/g, '');
}

function collectTextFragments(...values) {
    const parts = [];
    for (const value of values) {
        if (Array.isArray(value)) {
            parts.push(...value);
        } else {
            parts.push(value);
        }
    }

    return parts
        .filter((value) => value !== undefined && value !== null && value !== '')
        .map((value) => String(value))
        .join(' ');
}

function toFullYear(value) {
    const year = Number(value);
    if (!Number.isFinite(year)) return '';
    if (year >= 2000 && year <= 2099) return year;
    if (year >= 0 && year <= 99) return 2000 + year;
    return '';
}

function extractGraduateYearFromDateValue(value) {
    if (value === undefined || value === null || value === '') return '';

    const matches = String(value).match(/20\d{2}/g);
    return matches && matches.length ? Number(matches[matches.length - 1]) : '';
}

function extractGraduateYearFromEducationEntries(...collections) {
    for (const collection of collections) {
        const entries = Array.isArray(collection) ? collection : [collection];
        for (const edu of entries) {
            if (!edu || typeof edu !== 'object') continue;

            const year = extractGraduateYearFromDateValue(
                pickValue(
                    edu.endDate,
                    edu.graduateDate,
                    edu.graduationDate,
                    edu.eduEndDate,
                    edu.endYear,
                    edu.timeDesc,
                ),
            );

            if (year) return year;
        }
    }

    return '';
}

function extractGraduateYearFromText(text) {
    if (!text || typeof text !== 'string') return '';

    const normalized = normalizeCompactText(text);
    const patterns = [
        /(\d{2,4})年应届(?:生)?/,
        /(\d{2,4})届(?:应届(?:生)?|毕业(?:生)?)?/,
        /(?:应届(?:生)?|校招).{0,4}?(\d{2,4})(?:年|届)/,
        /(?:预计|将于|于)?(\d{4})年(?:毕业|结业)/,
    ];

    for (const pattern of patterns) {
        const match = normalized.match(pattern);
        if (!match) continue;

        const year = toFullYear(match[1]);
        if (year) return year;
    }

    return '';
}

function extractExperienceFromText(text) {
    if (!text || typeof text !== 'string') return '';

    const normalized = normalizeCompactText(text);
    const patterns = [
        /(\d{2,4}年应届生)/,
        /(\d{2,4}届应届(?:生)?)/,
        /(\d+(?:年|个月))(?:工作经验|经验)?/,
        /(社招)/,
    ];

    for (const pattern of patterns) {
        const match = normalized.match(pattern);
        if (match) return match[1];
    }

    return '';
}

function is27FreshGraduateCandidate(candidate) {
    if (!candidate) return false;

    const text = collectTextFragments(candidate.experience, candidate.profileText);
    const textYear = extractGraduateYearFromText(text);
    if (textYear === 2027) {
        return /(应届|校招|毕业)/.test(normalizeCompactText(text));
    }

    if (candidate.freshGraduate === 0) {
        return false;
    }

    return candidate.graduateYear === 2027;
}

function normalizeApiCandidate(geek) {
    const card = geek.geekCard || {};
    const topEdu = Array.isArray(geek.showEdus) ? geek.showEdus[0] : null;
    const cardEdu = card.geekEdu || (Array.isArray(card.geekEdus) ? card.geekEdus[0] : null) || card.geekHighestDegreeEdu || null;
    const experience = pickValue(geek.workYears, geek.experience, card.geekWorkYear);
    const graduateYear = extractGraduateYearFromEducationEntries(
        topEdu,
        cardEdu,
        geek.showEdus,
        geek.geekEdus,
        card.geekEdus,
        card.geekHighestDegreeEdu,
    ) || extractGraduateYearFromText(experience);

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
        experience,
        age: pickValue(geek.age, card.ageDesc, card.ageLight?.content),
        city: pickValue(geek.cityName, geek.city, card.expectLocationName, card.viewExpect?.locationName),
        lid: pickValue(geek.lid, card.lid),
        securityId: pickValue(geek.securityId, card.securityId),
        expectId: pickValue(geek.expectId, card.expectId),
        freshGraduate: pickValue(geek.freshGraduate, card.freshGraduate),
        graduateYear,
        profileText: collectTextFragments(
            experience,
            card.middleContent?.content,
            card.geekDesc?.content,
            geek.geekDesc?.content,
            geek.applyStatusDesc,
            card.applyStatusDesc,
        ),
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
        freshGraduate: pickValue(incoming.freshGraduate, existing.freshGraduate),
        graduateYear: pickValue(incoming.graduateYear, existing.graduateYear),
        profileText: pickValue(incoming.profileText, existing.profileText),
        source: hasApiData ? 'api' : pickValue(incoming.source, existing.source),
        hasApiData,
        hasDomData,
        greeted: existing.greeted,
        greetedTime: existing.greetedTime,
    };
}

function applyCandidateMatch(candidate, config = getConfig()) {
    const schoolMatch = matchSchool(candidate.school, config);
    const is27FreshGraduate = is27FreshGraduateCandidate(candidate);
    const matchesRecruitMode = isRecruitModeMatch(is27FreshGraduate, config);
    candidate.is27FreshGraduate = is27FreshGraduate;
    candidate.isTarget = !!schoolMatch && matchesRecruitMode;
    candidate.schoolLabel = schoolMatch ? schoolMatch.label : '';
    return candidate;
}

function isRecruitModeMatch(is27FreshGraduate, config = getConfig()) {
    return config.freshGraduateMode ? !!is27FreshGraduate : !is27FreshGraduate;
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

function clearAllRecommendHighlights() {
    const selectors = [
        '.boss-helper-target',
        '[data-school-label]',
        '.candidate-card-wrap',
        '.recommend-card-wrap',
        '.card-item',
        '.candidate-card',
        '.card-list > li',
        '[class*="geek-card"]',
    ];
    const visited = new Set();

    selectors.forEach((selector) => {
        try {
            document.querySelectorAll(selector).forEach((element) => {
                if (visited.has(element)) return;
                visited.add(element);
                clearRecommendCardHighlight(element);
            });
        } catch (e) {
            // 忽略无效选择器
        }
    });
}

function clearChatCardHighlight(card) {
    card.classList.remove('boss-helper-target', 'bh-chat-mode-mismatch');
    Array.from(card.classList)
        .filter((className) => className.startsWith('bh-target-'))
        .forEach((className) => card.classList.remove(className));
    card.removeAttribute('data-school-label');
    card.removeAttribute('data-bh-chat-mode');
    card.querySelectorAll('.bh-card-label').forEach((label) => label.remove());
}

function getChatCardLabel(card) {
    return card.querySelector('.bh-card-label[data-bh-chat-label="1"]');
}

function hasChatCardHighlight(card) {
    return card.classList.contains('boss-helper-target') ||
        card.hasAttribute('data-school-label') ||
        !!getChatCardLabel(card);
}

function syncChatCardHighlight(card, nameEl, schoolLabel, options = {}) {
    const { modeMismatch = false } = options;
    const labelClass = getSchoolLabelClass(schoolLabel);
    const targetClass = `bh-target-${labelClass}`;

    card.classList.add('boss-helper-target');
    card.classList.toggle('bh-chat-mode-mismatch', modeMismatch);
    Array.from(card.classList)
        .filter((className) => className.startsWith('bh-target-') && className !== targetClass)
        .forEach((className) => card.classList.remove(className));
    card.classList.add(targetClass);

    if (card.getAttribute('data-school-label') !== schoolLabel) {
        card.setAttribute('data-school-label', schoolLabel);
    }
    const nextChatMode = modeMismatch ? 'mismatch' : 'match';
    if (card.getAttribute('data-bh-chat-mode') !== nextChatMode) {
        card.setAttribute('data-bh-chat-mode', nextChatMode);
    }

    const existingLabel = getChatCardLabel(card);
    if (!nameEl || !nameEl.parentNode) {
        if (existingLabel) existingLabel.remove();
        return;
    }

    const desiredClassName = `bh-card-label bh-chat-inline-label ${labelClass}${modeMismatch ? ' is-mode-mismatch' : ''}`;
    const desiredTitle = modeMismatch
        ? `${schoolLabel}：目标院校，但与当前招聘模式不匹配`
        : `${schoolLabel}：目标院校`;
    const parent = nameEl.parentNode;
    const insertRef = nameEl.nextSibling;
    const label = existingLabel || document.createElement('span');

    if (!existingLabel) {
        label.setAttribute('data-bh-chat-label', '1');
        label.textContent = schoolLabel;
        label.className = desiredClassName;
        label.title = desiredTitle;
        parent.insertBefore(label, insertRef);
        return;
    }

    if (label.getAttribute('data-bh-chat-label') !== '1') {
        label.setAttribute('data-bh-chat-label', '1');
    }
    if (label.className !== desiredClassName) {
        label.className = desiredClassName;
    }
    if (label.textContent !== schoolLabel) {
        label.textContent = schoolLabel;
    }
    if (label.title !== desiredTitle) {
        label.title = desiredTitle;
    }
    if (label.parentNode !== parent || label.previousElementSibling !== nameEl) {
        parent.insertBefore(label, insertRef);
    }
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
        if (info.schoolLabel && info.uid) {
            addToSchoolCache(info.uid, info.name, info.school, info.schoolLabel, {
                experience: info.experience,
                graduateYear: info.graduateYear,
                freshGraduate: info.freshGraduate,
                is27FreshGraduate: info.is27FreshGraduate,
            });
        }
    }

    recommendApiLoadSeq += 1;
    logger.info(`API 解析: 获取 ${list.length} 名候选人，目标院校 ${targetCount} 名`);
    if (onCandidatesUpdated) onCandidatesUpdated(geekDataMap);
}

/**
 * 解析聊天页 geek/info 接口响应，提取学校数据并缓存
 */
function parseChatGeekInfo(zpData, options = {}) {
    const { prefetch = false } = options;
    const data = zpData.data;
    if (!data || !data.uid) return;

    const config = getConfig();
    const eduExpList = Array.isArray(data.eduExpList) ? data.eduExpList : [];
    const topEdu = eduExpList[0] || null;
    const experience = pickValue(
        data.year,
        data.workYears,
        data.experience,
        data.geekWorkYear,
        data.positionStatus,
    );
    const school = pickValue(
        data.school,
        data.eduSchool,
        data.geekEdu?.school,
        topEdu?.school,
        Array.isArray(data.showEdus) ? data.showEdus[0]?.school : '',
        Array.isArray(data.geekEdus) ? data.geekEdus[0]?.school : '',
    );
    const graduateYear = extractGraduateYearFromEducationEntries(
        data.geekEdu,
        data.showEdus,
        data.geekEdus,
        data.eduList,
        data.eduExpList,
    ) || extractGraduateYearFromText(collectTextFragments(experience, data.positionStatus));
    const info = {
        uid: data.uid,
        name: data.name || data.geekName || '',
        school,
        degree: pickValue(
            data.edu,
            data.degree,
            data.geekEdu?.degree,
            topEdu?.degree,
        ),
        major: pickValue(
            data.major,
            data.geekEdu?.major,
            topEdu?.major,
        ),
        experience,
        freshGraduate: pickValue(data.freshGraduate),
        graduateYear,
        positionStatus: pickValue(data.positionStatus),
        profileText: collectTextFragments(
            experience,
            school,
            data.positionStatus,
            data.major,
            data.edu,
            data.applyStatusDes,
            data.applyStatusDesc,
            data.applyStatusDes2,
            eduExpList.map((edu) => collectTextFragments(edu.timeDesc, edu.school, edu.major, edu.degree)),
            data.geekDesc?.content,
        ),
    };
    const schoolMatch = matchSchool(school, config);
    info.schoolMatch = schoolMatch;
    info.is27FreshGraduate = is27FreshGraduateCandidate(info);
    info.prefetch = prefetch;

    if (schoolMatch) {
        addToSchoolCache(info.uid, info.name, school, schoolMatch.label, {
            experience: info.experience,
            graduateYear: info.graduateYear,
            freshGraduate: info.freshGraduate,
            is27FreshGraduate: info.is27FreshGraduate,
        });
        if (!prefetch) {
            logger.info(`聊天 geek/info: ${info.name || info.uid} → ${school} [${schoolMatch.label}]`);
        }
    }

    // 触发右侧面板高亮和左侧列表刷新
    if (onChatGeekInfoUpdated) {
        onChatGeekInfoUpdated(info);
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
    clearAllRecommendHighlights();
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
        const fullText = (card.innerText || card.textContent || '').trim();

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
            experience: extractExperienceFromText(fullText),
            graduateYear: extractGraduateYearFromText(fullText),
            freshGraduate: /应届|校招/.test(normalizeCompactText(fullText)) ? 1 : '',
            profileText: fullText,
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
    const config = getConfig();
    const cache = loadSchoolCache();
    const cacheKeys = Object.keys(cache);
    const cards = document.querySelectorAll('.geek-item-wrap');
    let targetCount = 0;
    let cacheHitCount = 0;
    let disabledCount = 0;
    let modeMismatchCount = 0;
    let matchedCount = 0;

    cards.forEach((card) => {
        // 从 data-id 提取 uid（格式为 "uid-jobSource"）
        const geekItem = card.querySelector('.geek-item');
        const dataId = geekItem ? geekItem.getAttribute('data-id') : '';
        const uid = dataId ? dataId.split('-')[0] : '';

        // 从 .geek-name 获取名字
        const nameEl = card.querySelector('.geek-name');
        const name = nameEl ? nameEl.textContent.trim() : '';

        // 优先用 uid 查缓存，其次用名字
        let cached = uid ? cache[uid] : null;
        if (!cached && name) {
            cached = cache['name_' + name];
        }

        if (!cached || !cached.schoolLabel) {
            scheduleChatGeekInfoPrefetch(card, uid);
            if (hasChatCardHighlight(card)) {
                clearChatCardHighlight(card);
            }
            return;
        }

        cacheHitCount++;

        // 检查该分类是否启用
        if (!config.enabledSchoolLabels.includes(cached.schoolLabel)) {
            disabledCount++;
            if (hasChatCardHighlight(card)) {
                clearChatCardHighlight(card);
            }
            return;
        }

        if (!isRecruitModeMatch(cached.is27FreshGraduate, config)) {
            modeMismatchCount++;
            if (hasChatCardHighlight(card)) {
                clearChatCardHighlight(card);
            }
            return;
        }

        matchedCount++;
        syncChatCardHighlight(card, nameEl, cached.schoolLabel);
        targetCount++;
    });

    logger.info(`[聊天高亮] 扫描完成: ${cards.length} 张卡片，缓存命中 ${cacheHitCount} 张，目标院校 ${targetCount} 张，匹配模式 ${matchedCount} 张，招聘模式不匹配 ${modeMismatchCount} 张，标签关闭 ${disabledCount} 张，缓存条目 ${cacheKeys.length}`);
    return targetCount;
}

/**
 * 聊天窗右侧面板高亮
 * 当 geek/info 接口返回目标院校时，在 conversation-main 中标注
 */
export function highlightConversationPanel(info) {
    document.querySelectorAll('.bh-chat-school-label, .bh-chat-target-summary').forEach(el => el.remove());
    if (!info || !info.schoolMatch) return;

    const config = getConfig();
    if (!isRecruitModeMatch(info.is27FreshGraduate, config)) {
        filterChatListByDOM();
        return;
    }

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
            '.base-info-item.name-contet .base-name',
            '.base-info-item.name-contet .name-container',
            '.base-info-item.name-contet .name-box',
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

        document.querySelectorAll('.bh-chat-school-label, .bh-chat-target-summary').forEach(el => el.remove());
        const labelClass = getSchoolLabelClass(info.schoolMatch.label);
        const labelSpan = document.createElement('span');
        labelSpan.className = `bh-card-label bh-chat-school-label ${labelClass}`;
        labelSpan.textContent = info.schoolMatch.label;

        const labelAnchor = targetEl.classList?.contains('name-box')
            ? (targetEl.closest('.name-container') || targetEl)
            : targetEl;
        if (labelAnchor.parentNode) {
            labelAnchor.parentNode.insertBefore(labelSpan, labelAnchor.nextSibling);
        } else {
            targetEl.appendChild(labelSpan);
        }

        const summaryContainer = panel.querySelector('.position-content') ||
            panel.querySelector('.base-info-single-main .content') ||
            panel.querySelector('.base-info-single-main');

        if (summaryContainer) {
            const summaryRow = document.createElement('div');
            summaryRow.className = `bh-chat-target-summary ${labelClass}`;

            const summaryHead = document.createElement('div');
            summaryHead.className = 'bh-chat-target-summary-head';

            const summaryTitle = document.createElement('span');
            summaryTitle.className = 'bh-chat-target-summary-title';
            summaryTitle.textContent = '目标院校：';

            const summaryBadge = document.createElement('span');
            summaryBadge.className = `bh-card-label bh-chat-target-summary-badge ${labelClass}`;
            summaryBadge.textContent = info.schoolMatch.label;

            const summaryValue = document.createElement('span');
            summaryValue.className = 'bh-chat-target-summary-value';
            summaryValue.textContent = info.school;

            summaryHead.appendChild(summaryTitle);
            summaryHead.appendChild(summaryBadge);
            summaryHead.appendChild(summaryValue);

            const metaParts = [
                info.major,
                info.degree,
                info.experience || (info.graduateYear ? `${String(info.graduateYear).slice(-2)}届` : ''),
                info.positionStatus,
            ].filter(Boolean);

            const summaryMeta = document.createElement('div');
            summaryMeta.className = 'bh-chat-target-summary-meta';
            summaryMeta.textContent = metaParts.join(' · ');

            summaryRow.appendChild(summaryHead);
            if (summaryMeta.textContent) {
                summaryRow.appendChild(summaryMeta);
            }
            summaryContainer.appendChild(summaryRow);
        }

        logger.info(`聊天窗高亮: ${info.name} → ${info.school} [${info.schoolMatch.label}]`);
    };

    tryInject();

    // 同时刷新左侧列表（可能此用户之前没高亮）
    filterChatListByDOM();
}
