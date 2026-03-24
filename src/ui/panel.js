/**
 * 控制面板 UI 模块
 * 主界面框架、拖拽、交互绑定
 */

import { getConfig, updateConfig, getDailyCount, getSchoolLabelCounts, parseSchoolsText, serializeSchoolsText } from '../config.js';
import { logger, setLogChangeCallback, getTodayKey } from '../utils.js';
import { isCircuitBroken, resetCircuitBreaker } from '../anti-detect.js';
import { getTargetCandidates, filterByDOM } from '../filter.js';
import { startAutoGreeting, stopAutoGreeting, isGreetingRunning, setOnStatusChange } from '../greeting.js';
import { showNotification } from './notification.js';
import { showRecordsModal } from './records.js';

// ====== 面板 HTML ======

function buildPanelHTML(config) {
  return `
    <div class="bh-header" id="bh-drag-handle">
      <div class="bh-brand">
        <svg viewBox="0 0 24 24" fill="none" class="bh-logo" stroke="currentColor" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
        <span>BossHelper</span>
        <div id="bh-run-status" class="bh-status ok">
          <div class="bh-status-dot"></div> <span class="bh-status-text">就绪</span>
        </div>
      </div>
      <div class="bh-header-btns">
        <button class="bh-btn-icon" id="bh-minimize" title="最小化面板">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>
    </div>
    
    <div class="bh-body" id="bh-body">

      <!-- 数据看板 -->
      <div class="bh-dashboard">
        <div class="bh-card">
          <div class="bh-card-title">筛选目标</div>
          <div class="bh-card-value" id="bh-target-count">0</div>
        </div>
        <div class="bh-card highlight">
          <div class="bh-card-title">今日触达</div>
          <div class="bh-card-value" id="bh-greeted-count">${getDailyCount()}</div>
        </div>
        <div class="bh-card">
          <div class="bh-card-title">运行上限</div>
          <div class="bh-card-value" id="bh-daily-limit-display">${config.dailyLimit}</div>
        </div>
      </div>

      <!-- 院校分布（动态渲染） -->
      <div class="bh-dist-group" id="bh-dist-group"></div>

      <!-- 操作区 -->
      <div class="bh-action-group">
        <button class="bh-btn bh-secondary" id="bh-filter-btn">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>重新扫描
        </button>
        <button class="bh-btn bh-primary" id="bh-start-btn">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px"><polygon points="5 3 19 12 5 21 5 3"/></svg>启动自动分发
        </button>
        <button class="bh-btn bh-danger" id="bh-stop-btn" style="display:none">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px"><rect x="6" y="6" width="12" height="12"/></svg>停止运行
        </button>
      </div>

      <div class="bh-separator"></div>

      <!-- 设置面 -->
      <div class="bh-accordion" id="bh-settings-toggle">
        <span>控制面板与规则</span>
        <svg class="bh-arrow" id="bh-settings-arrow" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="bh-collapse" id="bh-settings-body">
        <div class="bh-control-row">
          <span>操作间隔 (s)</span>
          <input type="number" class="bh-input-box" id="bh-interval" value="${config.greetInterval}">
        </div>
        <div class="bh-control-row">
          <span>单日最大触达</span>
          <input type="number" class="bh-input-box" id="bh-daily-limit" value="${config.dailyLimit}">
        </div>
        
        <div class="bh-switch-group">
          <label class="bh-switch-label">
            <input type="checkbox" id="bh-auto-load" ${config.autoLoadMore ? 'checked' : ''} class="bh-switch-input">
            <span class="bh-switch-ui"></span><span class="bh-switch-text">列表自动翻页提取</span>
          </label>
        </div>
        <div class="bh-switch-group mb-12" style="display:flex; flex-direction:column; gap:8px;">
          <label class="bh-switch-label">
            <input type="checkbox" id="bh-behavior-sim" ${config.behaviorSimEnabled ? 'checked' : ''} class="bh-switch-input">
            <span class="bh-switch-ui"></span><span class="bh-switch-text">拟人化风控模拟</span>
          </label>
          <label class="bh-switch-label">
            <input type="checkbox" id="bh-run-in-bg" ${config.runInBackground ? 'checked' : ''} class="bh-switch-input">
            <span class="bh-switch-ui"></span><span class="bh-switch-text">后台持续运行 (可能增加曝光风险)</span>
          </label>
          <label class="bh-switch-label" style="display:none;">
            <input type="checkbox" id="bh-work-hours" ${config.workHoursEnabled ? 'checked' : ''} class="bh-switch-input">
          </label>
        </div>

        <div class="bh-filter-rules">
          <div class="bh-rule-title">目标院校规则集</div>
          <div class="bh-tags-selector" id="bh-tags-selector"></div>
          <div style="margin-top:10px;">
            <textarea class="bh-textarea bh-school-textarea" id="bh-school-input" rows="6" placeholder="每行一所学校，格式：学校名 类别&#10;例如：清华大学 C9">${serializeSchoolsText(config.targetSchools)}</textarea>
            <div class="bh-hint">每行一所学校，类别用空格或逗号分隔，无类别默认"其他"</div>
          </div>
        </div>
        <button class="bh-btn bh-outline bh-w-full" style="margin-top:12px" id="bh-save-settings">保存配置</button>
      </div>

      <div class="bh-separator"></div>

      <!-- 话术库 -->
      <div class="bh-accordion" id="bh-greetings-toggle">
        <span>自动交流话术库</span>
        <svg class="bh-arrow" id="bh-greetings-arrow" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="bh-collapse" id="bh-greetings-body">
        <div id="bh-greeting-list" class="bh-greeting-list"></div>
        <div class="bh-add-greeting-area" style="margin-top:10px;">
          <textarea class="bh-textarea" id="bh-new-greeting" rows="2" placeholder="添加通用沟通模板..."></textarea>
          <button class="bh-btn bh-outline bh-w-full" style="margin-top:8px" id="bh-add-greeting">添加新模板</button>
        </div>
      </div>

      <div class="bh-separator"></div>

      <!-- 底部系统区 -->
      <div class="bh-footer-nav">
        <a href="javascript:void(0)" class="bh-link" id="bh-records-btn">历史分发记录</a>
        <a href="javascript:void(0)" class="bh-link bh-link-danger" id="bh-reset-circuit" style="display:none">强制重置风控熔断</a>
      </div>

      <!-- 监控终端 -->
      <div class="bh-terminal-title" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">系统日志终端</span>
        <button class="bh-btn-sm-ghost" id="bh-copy-log" style="color:#64748b;padding:0;font-size:11px;opacity:0.8;">复制日志</button>
      </div>
      <div class="bh-terminal" id="bh-log" style="margin-top:0;"></div>
    </div>
  `;
}

// ====== 创建面板 ======

export function createPanel() {
  if (document.getElementById('boss-helper-panel')) return;

  const config = getConfig();

  // 主面板
  const panel = document.createElement('div');
  panel.id = 'boss-helper-panel';
  panel.innerHTML = buildPanelHTML(config);
  document.body.appendChild(panel);

  // 恢复按钮
  const restoreBtn = document.createElement('button');
  restoreBtn.id = 'boss-helper-restore';
  restoreBtn.textContent = '🎯';
  restoreBtn.title = '打开 BOSS 招呼助手';
  document.body.appendChild(restoreBtn);

  // 绑定事件
  bindEvents(panel, restoreBtn);
  renderGreetingList();
  renderLabelBadges();
  setupLogUpdater();
  setupStatusUpdater();

  // 启动周期性统计刷新
  setInterval(refreshStats, 5000);
}

// ====== 事件绑定 ======

function bindEvents(panel, restoreBtn) {
  // 拖拽
  setupDrag(panel);

  // 最小化
  document.getElementById('bh-minimize').addEventListener('click', () => {
    panel.classList.add('minimized');
    restoreBtn.style.display = 'flex';
  });

  restoreBtn.addEventListener('click', () => {
    panel.classList.remove('minimized');
    restoreBtn.style.display = 'none';
  });

  // 筛选
  document.getElementById('bh-filter-btn').addEventListener('click', () => {
    const count = filterByDOM();
    refreshStats();
    showNotification(`筛选完成，发现 ${count} 名目标候选人`, 'success');
  });

  // 开始/停止
  document.getElementById('bh-start-btn').addEventListener('click', () => {
    startAutoGreeting();
  });

  document.getElementById('bh-stop-btn').addEventListener('click', () => {
    stopAutoGreeting();
  });

  // 运行状态回调
  setOnStatusChange(({ running }) => {
    document.getElementById('bh-start-btn').style.display = running ? 'none' : '';
    document.getElementById('bh-stop-btn').style.display = running ? '' : 'none';
    updateRunStatus();
  });

  // 设置折叠
  setupCollapse('bh-settings-toggle', 'bh-settings-body', 'bh-settings-arrow');
  setupCollapse('bh-greetings-toggle', 'bh-greetings-body', 'bh-greetings-arrow');

  // 保存设置
  document.getElementById('bh-save-settings').addEventListener('click', saveSettings);

  // 招呼语
  document.getElementById('bh-add-greeting').addEventListener('click', addGreeting);

  // 记录
  document.getElementById('bh-records-btn').addEventListener('click', showRecordsModal);

  // 重置熔断
  document.getElementById('bh-reset-circuit').addEventListener('click', () => {
    resetCircuitBreaker();
    updateRunStatus();
    showNotification('熔断已重置', 'success');
  });

  // 复制日志
  const copyLogBtn = document.getElementById('bh-copy-log');
  if (copyLogBtn) {
    copyLogBtn.addEventListener('click', () => {
      const logEl = document.getElementById('bh-log');
      if (logEl) {
        const text = Array.from(logEl.querySelectorAll('.bh-log-entry')).map(el => {
          return `[${el.querySelector('.time').textContent}] ${el.querySelector('.msg').textContent}`;
        }).join('\n');
        if (text) {
          navigator.clipboard.writeText(text).then(() => showNotification('系统日志已复制到剪贴板', 'success'));
        } else {
          showNotification('极简日志大盘为空', 'info');
        }
      }
    });
  }
}

// ====== 拖拽 ======

function setupDrag(panel) {
  const handle = document.getElementById('bh-drag-handle');
  let isDragging = false;
  let startX, startY, startRight, startTop;

  handle.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startRight = parseInt(panel.style.right || '20');
    startTop = parseInt(panel.style.top || '80');
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = startX - e.clientX;
    const dy = e.clientY - startY;
    panel.style.right = `${startRight + dx}px`;
    panel.style.top = `${startTop + dy}px`;
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });
}

// ====== 折叠 ======

function setupCollapse(toggleId, bodyId, arrowId) {
  document.getElementById(toggleId).addEventListener('click', () => {
    const body = document.getElementById(bodyId);
    const arrow = document.getElementById(arrowId);
    body.classList.toggle('open');
    arrow.textContent = body.classList.contains('open') ? '▴' : '▾';
  });
}

// ====== 设置保存 ======

function saveSettings() {
  // 解析 textarea 中的学校列表
  const schoolInput = document.getElementById('bh-school-input');
  const schoolText = schoolInput ? schoolInput.value : '';
  const parsedSchools = parseSchoolsText(schoolText);

  // 收集启用的标签
  const enabledLabels = [];
  const existingLabelsInDom = new Set();
  document.querySelectorAll('#bh-tags-selector .bh-check-badge input').forEach(cb => {
    const label = cb.getAttribute('data-label');
    existingLabelsInDom.add(label);
    if (cb.checked) {
      enabledLabels.push(label);
    }
  });

  // 对于文本框中新解析出、且还未渲染在 DOM 中的标签，默认认为是全选开启的
  const allParsedLabels = [...new Set(parsedSchools.map(s => s.label))];
  for (const label of allParsedLabels) {
    if (!existingLabelsInDom.has(label)) {
      enabledLabels.push(label);
    }
  }

  updateConfig({
    greetInterval: parseInt(document.getElementById('bh-interval').value) || 10,
    dailyLimit: parseInt(document.getElementById('bh-daily-limit').value) || 80,
    autoLoadMore: document.getElementById('bh-auto-load').checked,
    workHoursEnabled: document.getElementById('bh-work-hours').checked,
    behaviorSimEnabled: document.getElementById('bh-behavior-sim').checked,
    runInBackground: document.getElementById('bh-run-in-bg').checked,
    targetSchools: parsedSchools,
    enabledSchoolLabels: enabledLabels,
  });

  // 刷新标签选择器和统计
  renderLabelBadges();
  refreshStats();
  showNotification('设置已保存', 'success');
}

// ====== 招呼语管理 ======

function renderGreetingList() {
  const config = getConfig();
  const container = document.getElementById('bh-greeting-list');
  if (!container) return;

  container.innerHTML = config.greetingTemplates.map((tmpl, i) => `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
      <span style="flex:1;font-size:12px;color:#666;background:#f8f9ff;padding:6px 10px;border-radius:8px;
                   overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;transition:background 0.2s;" 
            title="点击复制: ${tmpl}" data-copy-greeting="${i}">
        ${tmpl}
      </span>
      <button class="bh-btn-sm-ghost" style="color:#f87171;flex-shrink:0;font-size:14px;padding:2px 6px;"
              title="删除" data-delete-greeting="${i}">✕</button>
    </div>
  `).join('');

  // 删除事件
  container.querySelectorAll('[data-delete-greeting]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-delete-greeting'));
      const templates = [...config.greetingTemplates];
      templates.splice(idx, 1);
      updateConfig({ greetingTemplates: templates });
      renderGreetingList();
      showNotification('已删除招呼语', 'info');
    });
  });

  // 复制事件
  container.querySelectorAll('[data-copy-greeting]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-copy-greeting'));
      const text = config.greetingTemplates[idx];
      navigator.clipboard.writeText(text).then(() => {
        showNotification('已成功复制该话术到剪贴板', 'success');
      });
    });
  });
}

function addGreeting() {
  const input = document.getElementById('bh-new-greeting');
  const text = input.value.trim();
  if (!text) return;

  const config = getConfig();
  updateConfig({ greetingTemplates: [...config.greetingTemplates, text] });
  input.value = '';
  renderGreetingList();
  showNotification('已添加招呼语', 'success');
}

// ====== 状态更新 ======

function updateRunStatus() {
  const statusEl = document.getElementById('bh-run-status');
  const resetBtn = document.getElementById('bh-reset-circuit');
  if (!statusEl) return;

  if (isCircuitBroken()) {
    statusEl.className = 'bh-status error';
    statusEl.innerHTML = '<div class="bh-status-dot"></div> <span class="bh-status-text">已熔断</span>';
    resetBtn.style.display = '';
  } else if (isGreetingRunning()) {
    statusEl.className = 'bh-status running';
    statusEl.innerHTML = '<div class="bh-status-dot"></div> <span class="bh-status-text">运行中</span>';
    resetBtn.style.display = 'none';
  } else {
    statusEl.className = 'bh-status ok';
    statusEl.innerHTML = '<div class="bh-status-dot"></div> <span class="bh-status-text">就绪</span>';
    resetBtn.style.display = 'none';
  }
}

function refreshStats() {
  const targetEl = document.getElementById('bh-target-count');
  const greetedEl = document.getElementById('bh-greeted-count');
  const limitEl = document.getElementById('bh-daily-limit-display');

  const targets = getTargetCandidates();
  if (targetEl) targetEl.textContent = targets.length;
  if (greetedEl) greetedEl.textContent = getDailyCount();
  if (limitEl) limitEl.textContent = getConfig().dailyLimit;

  // 动态分类统计
  const labelCounts = getSchoolLabelCounts(targets);
  const distGroup = document.getElementById('bh-dist-group');
  if (distGroup) {
    const config = getConfig();
    const allLabels = config.enabledSchoolLabels || [];
    distGroup.innerHTML = allLabels.map(label => {
      const cssClass = getLabelCssClass(label);
      const count = labelCounts[label] || 0;
      return `<div class="bh-dist-item ${cssClass}"><span class="bh-d-label">${label}</span><span class="bh-d-val">${count}</span></div>`;
    }).join('');
  }

  updateRunStatus();
}

/**
 * 获取标签对应的 CSS class
 */
function getLabelCssClass(label) {
  const map = { 'C9': 'c9', '985': 'n985', '211': 'n211' };
  return map[label] || 'custom';
}

/**
 * 渲染标签选择器 badge
 */
function renderLabelBadges() {
  const config = getConfig();
  const container = document.getElementById('bh-tags-selector');
  if (!container) return;

  // 从 targetSchools 中提取所有唯一标签
  const allLabels = [...new Set(config.targetSchools.map(s => s.label))];
  const enabledLabels = config.enabledSchoolLabels || [];

  container.innerHTML = allLabels.map(label => {
    // 根据 config.enabledSchoolLabels 决定是否勾选
    // 如果是用户刚在文本框输入的全新标签，在 saveSettings 时已自动加入了 enabledLabels 中
    const checked = enabledLabels.includes(label) ? 'checked' : '';
    return `<label class="bh-check-badge"><input type="checkbox" data-label="${label}" ${checked}><span>${label}</span></label>`;
  }).join('');
}

function setupStatusUpdater() {
  // 监听 filter 模块的候选人更新
  // 由 index.js 连接
}

// ====== 日志面板 ======

function setupLogUpdater() {
  setLogChangeCallback((history) => {
    const logEl = document.getElementById('bh-log');
    if (!logEl) return;

    const recent = history.slice(-30);
    logEl.innerHTML = recent.map(entry =>
      `<div class="bh-log-entry ${entry.level}">` +
      `<span class="time">${entry.time}</span> ` +
      `<span class="msg">${entry.message}</span>` +
      `</div>`
    ).join('');

    logEl.scrollTop = logEl.scrollHeight;
  });
}

export { refreshStats };
