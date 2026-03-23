/**
 * Content script running in the isolated world.
 * Receives candidate data from the injected script, scans DOM cards,
 * handles popup commands, and drives the greeting loop.
 */

let geekDataMap = new Map();
let isRunning = false;
let shouldStop = false;
let consecutiveCount = 0;
let consecutiveFailures = 0;
let circuitBroken = false;
let config = null;

const TARGET_CARD_SELECTORS = [
    '.recommend-card-wrap',
    '.card-item',
    '.candidate-card',
    '.card-list > li',
    '[class*="recommend-card"]',
    '[class*="geek-card"]',
];
const TARGET_CARD_CLASSES = ['boss-helper-target', 'bh-target-c9', 'bh-target-985', 'bh-target-211'];
const SCHOOL_SELECTORS = [
    '[class*="school"]',
    '[class*="edu"]',
    '.info-school',
    '.geek-school',
];

async function initialize() {
    config = await getConfigFromBg();
    addLog('info', '内容脚本已加载');

    window.addEventListener('message', (event) => {
        if (event.data && event.data.source === 'boss-helper-injected' && event.data.type === 'GEEK_LIST') {
            processGeekList(event.data.payload);
        }
    });

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        handlePopupMessage(msg).then(sendResponse);
        return true;
    });

    setTimeout(() => {
        filterByDOM();
        syncStats();
    }, 3000);

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            setTimeout(() => {
                filterByDOM();
                syncStats();
            }, 1000);
        }
    });

    setInterval(() => {
        filterByDOM();
        syncStats();
    }, 5000);

    addLog('info', 'BOSS直聘智能招呼助手 v3.0 已启动');
}

async function handlePopupMessage(msg) {
    switch (msg.type) {
        case 'FILTER_DOM': {
            config = await getConfigFromBg();
            const count = filterByDOM();
            syncStats();
            addLog('info', `重新扫描完成，发现 ${count} 名目标候选人`);
            return { count };
        }
        case 'START_GREETING':
            startAutoGreeting();
            return { ok: true };
        case 'STOP_GREETING':
            stopAutoGreeting();
            return { ok: true };
        case 'RESET_CIRCUIT':
            circuitBroken = false;
            consecutiveFailures = 0;
            addLog('info', '熔断已重置');
            syncStats();
            return { ok: true };
        default:
            return { error: 'unknown' };
    }
}

function processGeekList(geekList) {
    if (!config) return;

    const enabledLabels = config.enabledSchoolLabels || ['C9', '985', '211'];

    for (const candidate of geekList) {
        const id = candidate.encryptGeekId;
        if (!id) continue;

        const edu = candidate.geekCard?.geekEdu;
        const schoolName = edu?.school || '';
        const matched = matchSchool(schoolName, config.targetSchools, enabledLabels);
        const current = geekDataMap.get(id);

        geekDataMap.set(id, {
            ...current,
            encryptGeekId: id,
            name: candidate.geekCard?.geekName || current?.name || '未知',
            school: schoolName,
            schoolLabel: matched ? matched.label : '',
            title: candidate.geekCard?.geekTitle || current?.title || '',
            degree: candidate.geekCard?.geekDegree || current?.degree || '',
            isTarget: !!matched,
            greeted: current?.greeted || false,
            source: current?.source || 'api',
        });
    }

    setTimeout(() => {
        markCards();
        syncStats();
    }, 800);
}

function matchSchool(schoolText, targetSchools, enabledLabels) {
    if (!schoolText || !Array.isArray(targetSchools)) return null;
    for (const s of targetSchools) {
        if (enabledLabels.includes(s.label) && schoolText.includes(s.name)) {
            return s;
        }
    }
    return null;
}

function filterByDOM() {
    if (!config) return 0;

    const cards = queryAllFallback(TARGET_CARD_SELECTORS);
    const seenDomIds = new Set();
    let count = 0;

    cards.forEach((card) => {
        clearCardTargetState(card);

        const nameEl = card.querySelector('[class*="name"], .geek-name');
        const name = nameEl ? nameEl.textContent.trim() : '';
        const encryptGeekId = getOrCreateCardId(card, name);
        seenDomIds.add(encryptGeekId);

        const schoolText = extractSchoolText(card);
        const enabledLabels = config.enabledSchoolLabels || ['C9', '985', '211'];
        const matched = matchSchool(schoolText, config.targetSchools, enabledLabels);
        const current = geekDataMap.get(encryptGeekId);

        geekDataMap.set(encryptGeekId, {
            ...current,
            encryptGeekId,
            name: name || current?.name || '',
            school: schoolText,
            schoolLabel: matched ? matched.label : '',
            title: current?.title || '',
            isTarget: !!matched,
            greeted: current?.greeted || false,
            source: 'dom',
        });

        if (!matched) return;

        count++;
        card.classList.add('boss-helper-target');
        card.classList.add(`bh-target-${matched.label.toLowerCase()}`);
        card.setAttribute('data-school-label', matched.label);
    });

    for (const [id, info] of geekDataMap.entries()) {
        if (info.source === 'dom' && !seenDomIds.has(id)) {
            info.isTarget = false;
            info.schoolLabel = '';
        }
    }

    addLog('info', `DOM扫描完成：扫描 ${cards.length} 张卡片，命中 ${count} 名目标候选人`);
    return count;
}

function markCards() {
    const cards = queryAllFallback(TARGET_CARD_SELECTORS);

    cards.forEach((card) => {
        clearCardTargetState(card);

        const bhId = card.getAttribute('data-bh-id');
        if (!bhId) return;

        const info = geekDataMap.get(bhId);
        if (!info || !info.isTarget) return;

        card.classList.add('boss-helper-target');
        card.classList.add(`bh-target-${info.schoolLabel.toLowerCase()}`);
        card.setAttribute('data-school-label', info.schoolLabel);
    });
}

function clearCardTargetState(card) {
    card.classList.remove(...TARGET_CARD_CLASSES);
    card.removeAttribute('data-school-label');
}

function extractSchoolText(card) {
    for (const selector of SCHOOL_SELECTORS) {
        const el = card.querySelector(selector);
        if (el) {
            const text = el.textContent.trim();
            if (text) return text;
        }
    }

    const fullText = card.textContent || '';
    for (const school of config?.targetSchools || []) {
        if (fullText.includes(school.name)) {
            return school.name;
        }
    }

    return '';
}

function getOrCreateCardId(card, name) {
    let encryptGeekId = card.getAttribute('data-bh-id');
    if (encryptGeekId) return encryptGeekId;

    const geekEl = card.querySelector('[data-geek], [data-geekid]');
    if (geekEl) {
        encryptGeekId = geekEl.getAttribute('data-geekid') || geekEl.getAttribute('data-geek') || '';
    }

    if (!encryptGeekId) {
        const link = card.querySelector('a[href*="geek"]');
        if (link) {
            const match = link.href.match(/\/([a-zA-Z0-9_-]+)\.html/);
            if (match) encryptGeekId = match[1];
        }
    }

    if (!encryptGeekId) {
        encryptGeekId = `dom_tmp_${name || 'unknown'}_${Math.random().toString(36).slice(2, 8)}`;
    }

    card.setAttribute('data-bh-id', encryptGeekId);
    return encryptGeekId;
}

function queryAllFallback(selectors) {
    const seen = new Set();
    const result = [];

    selectors.forEach((selector) => {
        document.querySelectorAll(selector).forEach((node) => {
            if (!seen.has(node)) {
                seen.add(node);
                result.push(node);
            }
        });
    });

    return result;
}

async function startAutoGreeting() {
    if (isRunning) return;
    isRunning = true;
    shouldStop = false;
    consecutiveCount = 0;
    addLog('info', '开始自动打招呼');
    syncStats();

    await greetingLoop();

    isRunning = false;
    addLog('info', '自动打招呼已停止');
    syncStats();
}

function stopAutoGreeting() {
    shouldStop = true;
    addLog('info', '用户请求停止');
}

async function greetingLoop() {
    config = await getConfigFromBg();

    while (!shouldStop) {
        if (circuitBroken) {
            addLog('warn', '熔断状态');
            break;
        }
        if (document.hidden) {
            addLog('info', '页面后台，暂停');
            await sleep(3000);
            continue;
        }

        const stats = await chrome.runtime.sendMessage({ type: 'GET_STATS' });
        if (stats.dailyCount >= config.dailyLimit) {
            addLog('warn', '已达今日上限');
            break;
        }
        if ((stats.hourlyCount || 0) >= config.hourlyLimit) {
            addLog('warn', '已达本小时上限');
            break;
        }

        const targets = getUngreetedTargets();
        if (targets.length === 0) {
            addLog('info', '当前无目标候选人');
            if (config.autoLoadMore) {
                window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                await sleep(3000);
                filterByDOM();
                const newTargets = getUngreetedTargets();
                if (newTargets.length === 0) {
                    addLog('info', '无更多目标，停止');
                    break;
                }
                continue;
            }
            break;
        }

        if (Math.random() < (config.skipProbability || 0.15)) {
            addLog('info', '随机跳过（模拟挑选）');
            await sleep(randomInt(1000, 3000));
            continue;
        }

        const target = targets[0];
        const card = findCardElement(target);
        if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await sleep(randomInt(500, 1500));

            const btn = findGreetButton(card);
            if (btn) {
                btn.click();
                await sleep(randomInt(800, 1500));

                target.greeted = true;
                consecutiveFailures = 0;
                consecutiveCount++;

                await chrome.runtime.sendMessage({ type: 'INCREMENT_COUNT' });
                await chrome.runtime.sendMessage({
                    type: 'ADD_RECORD',
                    record: {
                        name: target.name,
                        school: target.school,
                        schoolLabel: target.schoolLabel || '',
                        title: target.title || '',
                    }
                });

                addLog('info', `已向 ${target.name}(${target.school}) 发送招呼`);
            } else {
                addLog('warn', `未找到 ${target.name} 的打招呼按钮`);
                target.greeted = true;
                consecutiveFailures++;
                if (consecutiveFailures >= 3) {
                    circuitBroken = true;
                    addLog('error', '连续失败，触发熔断');
                    break;
                }
            }
        } else {
            addLog('warn', `未找到 ${target.name} 的卡片`);
            target.greeted = true;
        }

        syncStats();

        if (consecutiveCount >= config.consecutiveLimit) {
            const restTime = randomInt(config.restMinSeconds * 1000, config.restMaxSeconds * 1000);
            addLog('info', `连续 ${consecutiveCount} 次，休息 ${Math.round(restTime / 1000)}s`);
            consecutiveCount = 0;
            await sleep(restTime);
            if (shouldStop) break;
            continue;
        }

        const interval = config.greetInterval * 1000 * (0.7 + Math.random() * 0.6);
        addLog('info', `等待 ${(interval / 1000).toFixed(1)}s`);
        await sleep(interval);
    }
}

function getUngreetedTargets() {
    return Array.from(geekDataMap.values()).filter((t) => t.isTarget && !t.greeted);
}

function findCardElement(target) {
    if (target.encryptGeekId) {
        const cardById = document.querySelector(`[data-bh-id="${target.encryptGeekId}"]`);
        if (cardById) return cardById;
        const link = document.querySelector(`a[href*="${target.encryptGeekId}"]`);
        if (link) return link.closest('[class*="card"], li');
    }
    const allCards = document.querySelectorAll('[class*="card-item"], [class*="recommend-card"], .card-list > li');
    for (const card of allCards) {
        if (card.textContent.includes(target.name)) return card;
    }
    return null;
}

function findGreetButton(card) {
    const selectors = ['.start-chat-btn', '.btn-greet', '.button-chat', '[class*="greet"]', '[class*="chat-btn"]', 'button[ka*="greet"]'];
    for (const sel of selectors) {
        const btn = card.querySelector(sel);
        if (btn && !btn.disabled && btn.offsetParent !== null) return btn;
    }
    return null;
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getConfigFromBg() {
    try {
        return await chrome.runtime.sendMessage({ type: 'GET_CONFIG' });
    } catch (e) {
        return config || {};
    }
}

function addLog(level, message) {
    const time = new Date().toLocaleTimeString();
    chrome.runtime.sendMessage({
        type: 'ADD_LOG',
        entry: { level, message, time },
    }).catch(() => { });
}

function syncStats() {
    const targets = Array.from(geekDataMap.values()).filter((t) => t.isTarget);
    const c9 = targets.filter((t) => t.schoolLabel === 'C9').length;
    const n985 = targets.filter((t) => t.schoolLabel === '985').length;
    const n211 = targets.filter((t) => t.schoolLabel === '211').length;

    chrome.runtime.sendMessage({
        type: 'UPDATE_RUNTIME',
        state: {
            running: isRunning,
            circuitBroken,
            targetCount: targets.length,
            c9, '985': n985, '211': n211,
        },
    }).catch(() => { });
}

initialize();
