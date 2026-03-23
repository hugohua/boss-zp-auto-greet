/**
 * 控制面板 UI 模块
 * 主界面框架、拖拽、交互绑定
 */

import { getConfig, updateConfig, getDailyCount, getHourlyCount, getSchoolLabelCounts } from '../config.js';
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
      </div>
      <div class="bh-header-btns">
        <button class="bh-btn-icon" id="bh-minimize" title="最小化面板">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>
    </div>
    
    <div class="bh-body" id="bh-body">
      <!-- 运行状态 -->
      <div class="bh-status-banner">
         <div id="bh-run-status" class="bh-status ok">
           <div class="bh-status-dot"></div> <span class="bh-status-text">系统就绪</span>
         </div>
      </div>

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
          <div class="bh-card-title">本时段</div>
          <div class="bh-card-value" id="bh-hourly-count">${getHourlyCount()}</div>
        </div>
      </div>

      <!-- 院校分布 -->
      <div class="bh-dist-group">
        <div class="bh-dist-item c9"><span class="bh-d-label">C9</span><span class="bh-d-val" id="bh-c9-count">0</span></div>
        <div class="bh-dist-item n985"><span class="bh-d-label">985</span><span class="bh-d-val" id="bh-985-count">0</span></div>
        <div class="bh-dist-item n211"><span class="bh-d-label">211</span><span class="bh-d-val" id="bh-211-count">0</span></div>
      </div>

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
        <div class="bh-control-row">
          <span>每小时限额</span>
          <input type="number" class="bh-input-box" id="bh-hourly-limit" value="${config.hourlyLimit}">
        </div>
        
        <div class="bh-switch-group">
          <label class="bh-switch-label">
            <input type="checkbox" id="bh-auto-load" ${config.autoLoadMore ? 'checked' : ''} class="bh-switch-input">
            <span class="bh-switch-ui"></span><span class="bh-switch-text">列表自动翻页提取</span>
          </label>
        </div>
        <div class="bh-switch-group mb-12">
          <label class="bh-switch-label">
            <input type="checkbox" id="bh-behavior-sim" ${config.behaviorSimEnabled ? 'checked' : ''} class="bh-switch-input">
            <span class="bh-switch-ui"></span><span class="bh-switch-text">拟人化风控模拟</span>
          </label>
          <label class="bh-switch-label" style="display:none;">
            <input type="checkbox" id="bh-work-hours" ${config.workHoursEnabled ? 'checked' : ''} class="bh-switch-input">
          </label>
        </div>

        <div class="bh-filter-rules">
          <div class="bh-rule-title">目标院校规则集</div>
          <div class="bh-tags-selector">
            <label class="bh-check-badge"><input type="checkbox" id="bh-label-c9" ${config.enabledSchoolLabels.includes('C9') ? 'checked' : ''}><span>C9</span></label>
            <label class="bh-check-badge"><input type="checkbox" id="bh-label-985" ${config.enabledSchoolLabels.includes('985') ? 'checked' : ''}><span>985</span></label>
            <label class="bh-check-badge"><input type="checkbox" id="bh-label-211" ${config.enabledSchoolLabels.includes('211') ? 'checked' : ''}><span>211</span></label>
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
      <div class="bh-terminal-title">系统日志终端</div>
      <div class="bh-terminal" id="bh-log"></div>
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
  const enabledLabels = [];
  if (document.getElementById('bh-label-c9').checked) enabledLabels.push('C9');
  if (document.getElementById('bh-label-985').checked) enabledLabels.push('985');
  if (document.getElementById('bh-label-211').checked) enabledLabels.push('211');

  updateConfig({
    greetInterval: parseInt(document.getElementById('bh-interval').value) || 10,
    dailyLimit: parseInt(document.getElementById('bh-daily-limit').value) || 80,
    hourlyLimit: parseInt(document.getElementById('bh-hourly-limit').value) || 15,
    autoLoadMore: document.getElementById('bh-auto-load').checked,
    workHoursEnabled: document.getElementById('bh-work-hours').checked,
    behaviorSimEnabled: document.getElementById('bh-behavior-sim').checked,
    enabledSchoolLabels: enabledLabels,
  });
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
                   overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${tmpl}">
        ${tmpl}
      </span>
      <button class="bh-btn bh-btn-sm" style="background:#ff4d4f;color:white;flex-shrink:0;margin:0;"
              data-delete-greeting="${i}">✕</button>
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
    statusEl.innerHTML = '<span class="bh-status-dot"></span> 已熔断';
    resetBtn.style.display = '';
  } else if (isGreetingRunning()) {
    statusEl.className = 'bh-status running';
    statusEl.innerHTML = '<span class="bh-status-dot"></span> 运行中';
    resetBtn.style.display = 'none';
  } else {
    statusEl.className = 'bh-status ok';
    statusEl.innerHTML = '<span class="bh-status-dot"></span> 就绪';
    resetBtn.style.display = 'none';
  }
}

function refreshStats() {
  const targetEl = document.getElementById('bh-target-count');
  const greetedEl = document.getElementById('bh-greeted-count');
  const hourlyEl = document.getElementById('bh-hourly-count');

  const targets = getTargetCandidates();
  if (targetEl) targetEl.textContent = targets.length;
  if (greetedEl) greetedEl.textContent = getDailyCount();
  if (hourlyEl) hourlyEl.textContent = getHourlyCount();

  // 分类统计
  const labelCounts = getSchoolLabelCounts(targets);
  const c9El = document.getElementById('bh-c9-count');
  const n985El = document.getElementById('bh-985-count');
  const n211El = document.getElementById('bh-211-count');
  if (c9El) c9El.textContent = labelCounts.C9;
  if (n985El) n985El.textContent = labelCounts['985'];
  if (n211El) n211El.textContent = labelCounts['211'];

  updateRunStatus();
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
