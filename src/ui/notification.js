/**
 * 通知提示模块
 */

let notificationTimer = null;

/**
 * 显示通知
 * @param {string} message - 消息内容
 * @param {'success'|'error'|'info'|'warn'} type - 通知类型
 * @param {number} duration - 显示时长（毫秒）
 */
export function showNotification(message, type = 'info', duration = 3000) {
    // 清除已有通知
    const existing = document.querySelector('.bh-notification');
    if (existing) existing.remove();
    if (notificationTimer) clearTimeout(notificationTimer);

    const el = document.createElement('div');
    el.className = `bh-notification ${type}`;
    el.textContent = message;
    document.body.appendChild(el);

    // 触发进入动画
    requestAnimationFrame(() => {
        el.classList.add('show');
    });

    notificationTimer = setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 400);
    }, duration);
}
