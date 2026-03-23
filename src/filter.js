/**
 * 候选人筛选模块
 * 通过 API 拦截获取候选人数据 + DOM 回退解析
 */

import { logger, queryAllFallback } from './utils.js';
import { getConfig, matchSchool } from './config.js';

// ====== 状态 ======
const geekDataMap = new Map(); // geekId -> candidateInfo
let apiInterceptInstalled = false;
let onCandidatesUpdated = null; // 回调

// ====== 公开 API ======

export function setOnCandidatesUpdated(cb) {
    onCandidatesUpdated = cb;
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
        return origSend.call(this, body);
    };

    logger.info('候选人 API 拦截器已安装');
}

function isRecommendApi(url) {
    return url.includes('/wapi/zpgeek/recommend/') ||
        url.includes('/wapi/zpboss/recommend/') ||
        url.includes('/wapi/zpgeek/search/');
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
        const info = {
            geekId: geek.geekId || geek.encryptGeekId || '',
            name: geek.geekName || geek.name || '未知',
            school: geek.eduSchool || geek.school || '',
            degree: geek.eduDegree || geek.degree || '',
            title: geek.expectPositionName || geek.title || '',
            experience: geek.workYears || geek.experience || '',
            age: geek.age || '',
            city: geek.cityName || geek.city || '',
            encryptGeekId: geek.encryptGeekId || '',
            lid: geek.lid || '',
            securityId: geek.securityId || '',
            expectId: geek.expectId || '',
        };

        // 判断是否为目标院校
        const schoolMatch = matchSchool(info.school, config);
        info.isTarget = !!schoolMatch;
        info.schoolLabel = schoolMatch ? schoolMatch.label : '';
        if (info.isTarget) targetCount++;

        if (info.geekId || info.encryptGeekId) {
            const key = info.encryptGeekId || info.geekId;
            geekDataMap.set(key, info);
        }
    }

    logger.info(`API 解析: 获取 ${list.length} 名候选人，目标院校 ${targetCount} 名`);
    if (onCandidatesUpdated) onCandidatesUpdated(geekDataMap);
}

/**
 * DOM 回退筛选（当 API 拦截未生效时使用）
 */
export function filterByDOM() {
    const config = getConfig();
    const cardSelectors = [
        '.recommend-card-wrap',
        '.card-item',
        '.candidate-card',
        '.card-list > li',
        '[class*="geek-card"]',
    ];

    const cards = queryAllFallback(cardSelectors);
    let targetCount = 0;

    cards.forEach(card => {
        // 尝试多种选择器获取学校信息
        const schoolSelectors = [
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

        const schoolMatch = matchSchool(schoolText, config);
        const isTarget = !!schoolMatch;

        if (isTarget) {
            card.classList.add('boss-helper-target');
            if (schoolMatch) {
                const labelClass = schoolMatch.label === '985' ? 'n985' : schoolMatch.label === '211' ? 'n211' : schoolMatch.label;
                card.classList.add(`bh-target-${labelClass}`);
                card.setAttribute('data-school-label', schoolMatch.label);
            }

            // 避免重复添加标签
            if (!card.querySelector('.bh-card-label') && schoolMatch) {
                const labelSpan = document.createElement('span');
                const labelClass = schoolMatch.label === '985' ? 'n985' : schoolMatch.label === '211' ? 'n211' : schoolMatch.label;
                labelSpan.className = `bh-card-label ${labelClass}`;
                labelSpan.textContent = schoolMatch.label;

                // 尝试插在名字或学校旁边
                const nameEl = card.querySelector('[class*="name"]:not([class*="company"])');
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

            // 提取基本信息
            const nameEl = card.querySelector('[class*="name"]:not([class*="company"])');
            const titleEl = card.querySelector('[class*="title"], [class*="position"]');

            const name = nameEl ? nameEl.textContent.trim() : '未知';
            const title = titleEl ? titleEl.textContent.trim() : '';

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
                    // 终极回退：生成临时唯一ID确保能入库并被统计
                    encryptGeekId = `dom_tmp_${name}_${Math.random().toString(36).substr(2, 6)}`;
                }

                // 将提取或生成的 ID 缓存在 DOM 上，避免同一张片重复生成不同的随机 ID
                card.setAttribute('data-bh-id', encryptGeekId);
            }

            if (encryptGeekId && !geekDataMap.has(encryptGeekId)) {
                geekDataMap.set(encryptGeekId, {
                    geekId: '',
                    encryptGeekId,
                    name,
                    school: schoolText,
                    schoolLabel: schoolMatch ? schoolMatch.label : '',
                    title,
                    isTarget: true,
                    source: 'dom',
                });
            }
        } else {
            card.classList.remove('boss-helper-target');
        }
    });

    logger.info(`DOM 筛选: 扫描 ${cards.length} 张卡片，目标院校 ${targetCount} 名`);
    if (onCandidatesUpdated) onCandidatesUpdated(geekDataMap);
    return targetCount;
}

/**
 * 获取目标候选人列表
 */
export function getTargetCandidates() {
    return Array.from(geekDataMap.values()).filter(c => c.isTarget);
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
