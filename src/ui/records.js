/**
 * 记录查看/导出模块
 */

import { getRecords, clearRecords } from '../config.js';
import { showNotification } from './notification.js';

/**
 * 显示打招呼记录弹窗
 */
export function showRecordsModal() {
  const records = getRecords();

  if (records.length === 0) {
    showNotification('还没有打招呼记录', 'info');
    return;
  }

  // 创建模态框
  const overlay = document.createElement('div');
  overlay.className = 'bh-modal-overlay';

  const labelStyle = (l) => {
    if (l === 'C9') return 'background:#fef3f2;color:#dc2626';
    if (l === '985') return 'background:#fef9ee;color:#d97706';
    if (l === '211') return 'background:#f0f9ff;color:#0369a1';
    return 'background:#f5f3ff;color:#6d28d9';
  };
  const rows = records.slice().reverse().map(r => `
    <tr>
      <td>${r.name || '-'}</td>
      <td>${r.school || '-'}</td>
      <td><span style="padding:2px 6px;border-radius:4px;font-size:11px;${labelStyle(r.schoolLabel)}">${r.schoolLabel || '-'}</span></td>
      <td>${r.title || '-'}</td>
      <td>${r.greetingTime || '-'}</td>
    </tr>
  `).join('');

  overlay.innerHTML = `
    <div class="bh-modal">
      <div class="bh-modal-header">
        <h3>打招呼记录 (${records.length} 条)</h3>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="bh-btn bh-outline" style="padding:4px 12px" id="bh-export-btn">导出 CSV</button>
          <button class="bh-btn bh-danger" style="padding:4px 12px" id="bh-clear-records-btn">清空记录</button>
          <button class="bh-modal-close" id="bh-close-modal">×</button>
        </div>
      </div>
      <div class="bh-modal-body">
        <table class="bh-table">
          <thead>
            <tr>
              <th>姓名</th>
              <th>院校</th>
              <th>分类</th>
              <th>职位</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // 事件
  overlay.querySelector('#bh-close-modal').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  overlay.querySelector('#bh-export-btn').addEventListener('click', () => exportRecords());
  overlay.querySelector('#bh-clear-records-btn').addEventListener('click', () => {
    if (confirm('确定要清空所有记录吗？')) {
      clearRecords();
      overlay.remove();
      showNotification('记录已清空', 'success');
    }
  });
}

/**
 * 导出记录为 CSV
 */
export function exportRecords() {
  const records = getRecords();
  if (records.length === 0) {
    showNotification('没有可导出的记录', 'info');
    return;
  }

  const csvContent = [
    ['姓名', '院校', '分类', '职位', '经验', '招呼语', '时间'],
    ...records.map(r => [
      r.name || '',
      r.school || '',
      r.schoolLabel || '',
      r.title || '',
      r.experience || '',
      (r.greeting || '').replace(/,/g, '，'),
      r.greetingTime || '',
    ]),
  ].map(row => row.join(',')).join('\n');

  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `boss_招呼记录_${new Date().toISOString().slice(0, 10)}.csv`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);

  showNotification('记录已导出为 CSV 文件', 'success');
}
