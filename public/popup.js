/**
 * Popup 控制面板 JS
 * 通过 chrome.runtime.sendMessage 与 Background / Content 三方通信
 */

// ====== 初始化 ======

document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    await refreshStats();
    await refreshLogs();
    await checkTabStatus();
    bindEvents();

    // 周期刷新
    setInterval(async () => {
        await refreshStats();
        await refreshLogs();
    }, 3000);
});

// ====== Tab 状态检测 ======

async function checkTabStatus() {
    const hint = document.getElementById('bh-tab-hint');
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url && tab.url.includes('zhipin.com')) {
            hint.textContent = '已连接目标页面';
            hint.style.color = '#00b42a';
        } else {
            hint.textContent = '未检测到目标页面';
            hint.style.color = '#6b7785';
        }
    } catch (e) {
        hint.textContent = '检测失败';
    }
}

// ====== 数据刷新 ======

async function refreshStats() {
    const data = await sendToBg({ type: 'GET_STATS' });
    if (!data) return;

    setText('bh-target-count', data.targetCount || 0);
    setText('bh-greeted-count', data.dailyCount || 0);
    setText('bh-hourly-count', data.hourlyCount || 0);
    setText('bh-c9-count', data.c9 || 0);
    setText('bh-985-count', data['985'] || 0);
    setText('bh-211-count', data['211'] || 0);

    // 运行状态
    const statusEl = document.getElementById('bh-run-status');
    const resetBtn = document.getElementById('bh-reset-circuit');
    if (data.circuitBroken) {
        statusEl.className = 'bh-status error';
        statusEl.querySelector('.bh-status-text').textContent = '已熔断';
        resetBtn.style.display = '';
    } else if (data.running) {
        statusEl.className = 'bh-status running';
        statusEl.querySelector('.bh-status-text').textContent = '运行中';
        resetBtn.style.display = 'none';
        document.getElementById('bh-start-btn').style.display = 'none';
        document.getElementById('bh-stop-btn').style.display = '';
    } else {
        statusEl.className = 'bh-status ok';
        statusEl.querySelector('.bh-status-text').textContent = '就绪';
        resetBtn.style.display = 'none';
        document.getElementById('bh-start-btn').style.display = '';
        document.getElementById('bh-stop-btn').style.display = 'none';
    }
}

async function refreshLogs() {
    const data = await sendToBg({ type: 'GET_LOGS' });
    if (!data || !data.logs) return;

    const logEl = document.getElementById('bh-log');
    logEl.innerHTML = data.logs.map(entry =>
        `<div class="bh-log-entry ${entry.level}">` +
        `<span class="time">${entry.time}</span>` +
        `<span class="msg">${entry.message}</span>` +
        `</div>`
    ).join('');
    logEl.scrollTop = logEl.scrollHeight;
}

// ====== 设置加载与保存 ======

async function loadSettings() {
    const data = await sendToBg({ type: 'GET_CONFIG' });
    if (!data) return;

    setVal('bh-interval', data.greetInterval);
    setVal('bh-daily-limit', data.dailyLimit);
    setVal('bh-hourly-limit', data.hourlyLimit);
    setChecked('bh-auto-load', data.autoLoadMore);
    setChecked('bh-behavior-sim', data.behaviorSimEnabled);

    const labels = data.enabledSchoolLabels || [];
    setChecked('bh-label-c9', labels.includes('C9'));
    setChecked('bh-label-985', labels.includes('985'));
    setChecked('bh-label-211', labels.includes('211'));

    // 渲染招呼语列表
    renderGreetingList(data.greetingTemplates || []);
}

function renderGreetingList(templates) {
    const container = document.getElementById('bh-greeting-list');
    container.innerHTML = templates.map((tmpl, i) => `
    <div style="display:flex;align-items:center;gap:6px;">
      <span style="flex:1;font-size:11px;color:#666;background:#f5f6f8;padding:5px 8px;border-radius:6px;
                   overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${tmpl}">
        ${tmpl}
      </span>
      <button class="bh-btn" style="background:#f53f3f;color:white;padding:3px 8px;flex-shrink:0;font-size:11px;"
              data-delete-idx="${i}">✕</button>
    </div>
  `).join('');

    container.querySelectorAll('[data-delete-idx]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const idx = parseInt(btn.getAttribute('data-delete-idx'));
            await sendToBg({ type: 'DELETE_GREETING', index: idx });
            await loadSettings();
        });
    });
}

// ====== 事件绑定 ======

function bindEvents() {
    // 重新扫描
    document.getElementById('bh-filter-btn').addEventListener('click', async () => {
        await sendToContent({ type: 'FILTER_DOM' });
        setTimeout(refreshStats, 1000);
    });

    // 开始
    document.getElementById('bh-start-btn').addEventListener('click', async () => {
        await sendToContent({ type: 'START_GREETING' });
        setTimeout(refreshStats, 500);
    });

    // 停止
    document.getElementById('bh-stop-btn').addEventListener('click', async () => {
        await sendToContent({ type: 'STOP_GREETING' });
        setTimeout(refreshStats, 500);
    });

    // 保存设置
    document.getElementById('bh-save-settings').addEventListener('click', async () => {
        const enabledLabels = [];
        if (document.getElementById('bh-label-c9').checked) enabledLabels.push('C9');
        if (document.getElementById('bh-label-985').checked) enabledLabels.push('985');
        if (document.getElementById('bh-label-211').checked) enabledLabels.push('211');

        await sendToBg({
            type: 'UPDATE_CONFIG',
            config: {
                greetInterval: parseInt(document.getElementById('bh-interval').value) || 10,
                dailyLimit: parseInt(document.getElementById('bh-daily-limit').value) || 80,
                hourlyLimit: parseInt(document.getElementById('bh-hourly-limit').value) || 15,
                autoLoadMore: document.getElementById('bh-auto-load').checked,
                behaviorSimEnabled: document.getElementById('bh-behavior-sim').checked,
                enabledSchoolLabels: enabledLabels,
            }
        });
    });

    // 添加招呼语
    document.getElementById('bh-add-greeting').addEventListener('click', async () => {
        const input = document.getElementById('bh-new-greeting');
        const text = input.value.trim();
        if (!text) return;
        await sendToBg({ type: 'ADD_GREETING', text });
        input.value = '';
        await loadSettings();
    });

    // 历史记录
    document.getElementById('bh-records-btn').addEventListener('click', async () => {
        const data = await sendToBg({ type: 'GET_RECORDS' });
        if (data && data.records) {
            alert(`共 ${data.records.length} 条记录\n\n` +
                data.records.slice(-10).map(r => `${r.name} (${r.school}) ${r.greetingTime}`).join('\n'));
        }
    });

    // 重置熔断
    document.getElementById('bh-reset-circuit').addEventListener('click', async () => {
        await sendToContent({ type: 'RESET_CIRCUIT' });
        setTimeout(refreshStats, 500);
    });
}

// ====== 通信辅助 ======

async function sendToBg(msg) {
    try {
        return await chrome.runtime.sendMessage(msg);
    } catch (e) {
        console.warn('sendToBg error:', e);
        return null;
    }
}

async function sendToContent(msg) {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.id) {
            return await chrome.tabs.sendMessage(tab.id, msg);
        }
    } catch (e) {
        console.warn('sendToContent error:', e);
    }
    return null;
}

// ====== DOM 辅助 ======

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}
function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
}
function setChecked(id, val) {
    const el = document.getElementById(id);
    if (el) el.checked = !!val;
}
