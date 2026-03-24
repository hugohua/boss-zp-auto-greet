/**
 * 候选人筛选模块
 * 通过 API 拦截获取候选人数据 + DOM 回退解析
 */

import { logger, queryAllFallback } from './utils.js';
import { getConfig, matchSchool, getRecords } from './config.js';

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

    // 注意：anti-detect.js 也会覆写 open/send，需要确保初始化顺序
    // 这里监听的是 response 而非 request，不会冲突

    const origXhrOpen = XMLHttpRequest.prototype.open;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this._filterUrl = url;
        return origXhrOpen.call(this, method, url, ...rest);
    };

    // 拦截 load 事件来读取响应
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (body) {
        if (this._filterUrl && isRecommendApi(this._filterUrl)) {
            this.addEventListener('load', function () {
                try {
                    const data = JSON.parse(this.responseText);
                    if (data.code === 0 && data.zpData) {
                        const list = data.zpData.geekList || data.zpData.resultList || data.zpData.list || [];
                        parseApiCandidates(list);
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
function parseApiCandidates(list) {
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

    // 使用 queryAllFallback 策略（与老版本一致）：逐个选择器尝试，第一个命中即返回
    const cardSelectors = [
        '.recommend-card-wrap',
        '.card-item',
        '.candidate-card',
        '.card-list > li',
        '[class*="geek-card"]',
    ];

    let cards = [];
    for (const sel of cardSelectors) {
        try {
            const els = document.querySelectorAll(sel);
            if (els.length > 0) {
                cards = Array.from(els);
                logger.info(`[DOM诊断] 选择器 "${sel}" 命中 ${cards.length} 张卡片`);
                break;
            }
        } catch (e) { /* 忽略 */ }
    }

    // 诊断日志
    logger.info(`[DOM诊断] querySelectorAll 命中 ${cards.length} 张卡片`);

    let targetCount = 0;

    cards.forEach((card, idx) => {
        let schoolText = '';
        let matchStrategy = '';

        // ====== 策略1：精确定位 edu-exps 中的学校名 span ======
        const eduContentSpans = card.querySelectorAll('.edu-exps .join-text-wrap.content > span:first-child');
        if (eduContentSpans.length > 0) {
            schoolText = eduContentSpans[0].textContent.trim();
            matchStrategy = '策略1-edu-span';
        }

        // ====== 策略2：通过专属 class 查找 ======
        if (!schoolText) {
            const schoolSelectors = [
                '[class*="school"]',
                '.info-school',
                '.geek-school',
            ];
            for (const sel of schoolSelectors) {
                const el = card.querySelector(sel);
                if (el) {
                    schoolText = el.textContent.trim();
                    matchStrategy = '策略2-' + sel;
                    break;
                }
            }
        }

        // ====== 策略3：从全卡片文本中直接匹配目标院校关键词 ======
        if (!schoolText) {
            const fullText = card.textContent;
            for (const s of config.targetSchools) {
                if (fullText.includes(s.name)) {
                    schoolText = s.name;
                    matchStrategy = '策略3-fullText';
                    break;
                }
            }
        }

        // 前 3 张卡片打出详细诊断
        if (idx < 3) {
            const nameEl = card.querySelector('[class*="name"]:not([class*="company"])');
            const nameText = nameEl ? nameEl.textContent.trim() : '?';
            logger.info(`[DOM诊断] 卡片${idx}: ${nameText} | school="${schoolText}" | via=${matchStrategy || '未匹配'}`);
        }

        const schoolMatch = matchSchool(schoolText, config);
        const isTarget = !!schoolMatch;

        if (isTarget) {
            card.classList.add('boss-helper-target');
            if (schoolMatch) {
                let labelClass = 'ncustom';
                if (schoolMatch.label === 'C9') labelClass = 'C9';
                else if (schoolMatch.label === '985') labelClass = 'n985';
                else if (schoolMatch.label === '211') labelClass = 'n211';

                card.classList.add(`bh-target-${labelClass}`);
                card.setAttribute('data-school-label', schoolMatch.label);
            }

            // 避免重复添加标签
            if (!card.querySelector('.bh-card-label') && schoolMatch) {
                const labelSpan = document.createElement('span');
                let labelClass = 'ncustom';
                if (schoolMatch.label === 'C9') labelClass = 'C9';
                else if (schoolMatch.label === '985') labelClass = 'n985';
                else if (schoolMatch.label === '211') labelClass = 'n211';

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
            const marker = card.querySelector('.bh-target-indicator');
            if (marker) marker.remove();
        }
    });

    if (cards.length > 0) {
        logger.info(`DOM 筛选: 扫描 ${cards.length} 张卡片，目标院校 ${targetCount} 名`);
    }
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
let chatListObserver = null;

/**
 * 监听聊天列表并注入历史标签
 */
export function observeChatList() {
    const records = getRecords();
    logger.info(`[ChatList] 初始化，读取到本地发件记录总数: ${records.length}`);
    if (records.length === 0) return;

    // 建立姓名到学校标签的映射表，提高查找速度
    const nameToLabel = new Map();
    for (const r of records) {
        if (r.schoolLabel && !nameToLabel.has(r.name)) {
            nameToLabel.set(r.name, {
                label: r.schoolLabel,
                school: r.school
            });
        }
    }
    logger.info(`[ChatList] 构建了有效的高校白名单映射表，包含 ${nameToLabel.size} 个人`);

    // 执行一次全量检查
    function highlightChatItems() {
        const chatItems = document.querySelectorAll('.geek-item-wrap .geek-name, .user-list .name, .chat-user .name');
        if (chatItems.length > 0) {
            // logger.info(`[ChatList] 当前 DOM 中找到 ${chatItems.length} 个候选人名字框`);
        }

        let count = 0;
        chatItems.forEach(nameEl => {
            const name = nameEl.textContent.trim();
            const hit = nameToLabel.get(name);
            if (hit) {
                // 兼容不同层级的容器
                const wrap = nameEl.closest('.geek-item-wrap') || nameEl.closest('.user-list-item') || nameEl.parentNode;
                if (wrap && !wrap.querySelector('.bh-card-label')) {
                    const labelSpan = document.createElement('span');
                    let labelClass = 'ncustom';
                    if (hit.label === 'C9') labelClass = 'C9';
                    else if (hit.label === '985') labelClass = 'n985';
                    else if (hit.label === '211') labelClass = 'n211';

                    labelSpan.className = `bh-card-label ${labelClass}`;
                    labelSpan.textContent = hit.label;
                    labelSpan.title = hit.school;

                    // 对话列表的空间很窄，缩小一点并靠右
                    labelSpan.style.display = 'inline-block';
                    labelSpan.style.transform = 'scale(0.85)';
                    labelSpan.style.transformOrigin = 'left center';
                    labelSpan.style.marginLeft = '4px';
                    labelSpan.style.verticalAlign = 'middle';

                    nameEl.parentNode.insertBefore(labelSpan, nameEl.nextSibling);

                    // 额外寻找卡片主体级别，施加背景色/边框高亮和折叠角标
                    const cardBox = nameEl.closest('.geek-item') || nameEl.closest('.user-list-item') || wrap;
                    if (cardBox) {
                        cardBox.classList.add('bh-highlight-target');
                        if (!cardBox.querySelector('.bh-target-indicator')) {
                            const indicator = document.createElement('div');
                            indicator.className = 'bh-target-indicator ' + labelClass;
                            indicator.textContent = hit.label;
                            cardBox.appendChild(indicator);
                        }
                    }

                    count++;
                }
            }
        });
        if (count > 0) {
            logger.info(`[ChatList] 成功为 ${count} 个历史牛人打上了学历高亮徽章！`);
        }
    }

    highlightChatItems();

    // 如果之前绑定过，就不要重复绑定了
    if (chatListObserver) return;

    // 监听 DOM 变化（聊天列表可能动态加载或滚动）
    chatListObserver = new MutationObserver((mutations) => {
        let shouldCheck = false;
        for (const m of mutations) {
            if (m.addedNodes.length > 0 || m.type === 'characterData') {
                shouldCheck = true;
                break;
            }
        }
        if (shouldCheck) {
            // 使用微小节流防止卡顿
            if (chatListObserver._timer) clearTimeout(chatListObserver._timer);
            chatListObserver._timer = setTimeout(highlightChatItems, 300);
        }
    });

    chatListObserver.observe(document.body, { childList: true, subtree: true, characterData: true });

    // 终极兜底方案：每两秒主动巡逻一次，彻底击碎 SPA 框架的虚拟 DOM 延迟渲染造成的事件丢失问题
    setInterval(() => {
        if (location.pathname.includes('/chat') || location.pathname.includes('/friend')) {
            highlightChatItems();
        }
    }, 2000);

    logger.info('[ChatList] 聊天列表离线高亮全局 DOM 监听器（双擎版）已挂载启动');
}
