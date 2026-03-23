// ==UserScript==
// @name         BOSS直聘目标候选人筛选工具
// @namespace    http://tampermonkey.net/
// @version      1.8
// @description  筛选目标院校候选人并支持自动打招呼
// @author       使用DeedSeed R1模型完成：https://yuanbao.tencent.com/bot/app/share/chat/o0Wjo64WcqGY
// @match        https://*.zhipin.com/web/*/recommend/*
// @require      https://tinydoc.cloudbu.huawei.com/hugo/xhook.min.js
// @require      https://tinymock.cloudbu.huawei.com/mock/772/od-target-school?file=3
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    // ====== 配置项 ======
    const FULL_TARGET_SCHOOLS = window.targetSchool || ['清华大学', '北京大学', '浙江大学'];
    const DEGREE_FILTER = ['本科', '硕士', '博士'];
    const KEYWORDS = [
        "机器学习", "Python", "Java", "后端",
        "计算机科学与技术", "软件工程", "深度学习",
        "算法", "前端"
    ];

    // ====== 全局状态 ======
    let geekDataMap = new Map(); // 存储候选人的识别信息
    let showTargetOnly = false; // 是否只显示目标人选
    let autoGreetingInterval = null; // 自动打招呼定时器
    let autoGreetingDelay = 5000; // 默认5秒间隔
    let panelMinimized = false; // 控制面板是否最小化
    let observerInitialized = false; // 观察器是否已初始化
    let autoScrollEnabled = false; // 是否启用自动滚动加载
    let currentJobId = null; // 当前岗位ID
    let scrollInterval = null; // 自动滚动定时器
    let requireFreshGraduate = true; // 是否要求26年应届生（默认开启）
    let greetingRecords = new Map(); // 打招呼记录（使用Map存储，key为候选人ID）
    let recordPanelVisible = false; // 记录面板是否可见
    let targetSchools = FULL_TARGET_SCHOOLS.slice(0, 60); // 当前使用的目标院校列表（默认前60所）
    let vipLimitReached = false; // VIP限制是否达到

    // ====== 样式注入 ======
    GM_addStyle(`
        /* 目标候选人样式 */
        .target-candidate {
            border: 2px solid #ff6b6b;
            border-radius: 8px;
            background-color: rgba(255, 245, 245, 0.8);
            box-shadow: 0 4px 8px rgba(255, 107, 107, 0.2);
            margin-bottom: 15px !important;
            transform: translateY(-1px);
            transition: all 0.3s ease;
        }

        .target-candidate:hover {
            transform: translateY(-4px);
            box-shadow: 0 6px 12px rgba(255, 107, 107, 0.3);
        }

        .target-indicator {
            position: absolute;
            top: 10px;
            left: -8px;
            background-color: #ff6b6b;
            color: white;
            font-weight: bold;
            padding: 4px 10px;
            border-radius: 0 10px 10px 0;
            z-index: 2;
            font-size: 12px;
            box-shadow: 2px 2px 5px rgba(0,0,0,0.2);
        }

        .target-indicator::after {
            content: "";
            position: absolute;
            left: 0;
            top: 100%;
            border-right: 8px solid #ff4444;
            border-bottom: 8px solid transparent;
        }

        .hide-candidate {
            display: none !important;
        }

        /* 控制面板样式 */
        .controls-container {
            position: fixed;
            top: 100px;
            right: 20px;
            background: white;
            padding: 0;
            border-radius: 10px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.15);
            z-index: 9999;
            width: 280px;
            border: 1px solid #f0f0f0;
            font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
            transition: height 0.3s ease;
            overflow: hidden;
        }

        .panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 15px;
            background: #f8f8f8;
            border-bottom: 1px solid #eee;
            cursor: move;
        }

        .controls-title {
            margin: 0;
            font-size: 16px;
            font-weight: bold;
            color: #333;
        }

        .minimize-btn {
            background: none;
            border: none;
            font-size: 16px;
            cursor: pointer;
            padding: 5px;
            color: #666;
        }

        .panel-content {
            padding: 15px;
        }

        .controls-group {
            margin-bottom: 15px;
        }

        .control-label {
            display: block;
            margin-bottom: 6px;
            font-weight: bold;
            color: #555;
            font-size: 13px;
        }

        .toggle-container {
            display: flex;
            align-items: center;
        }

        .toggle-switch {
            position: relative;
            display: inline-block;
            width: 40px;
            height: 22px;
        }

        .toggle-switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }

        .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #ccc;
            transition: .4s;
            border-radius: 34px;
        }

        .slider:before {
            position: absolute;
            content: "";
            height: 16px;
            width: 16px;
            left: 4px;
            bottom: 3px;
            background-color: white;
            transition: .4s;
            border-radius: 50%;
        }

        input:checked + .slider {
            background-color: #2196F3;
        }

        input:checked + .slider:before {
            transform: translateX(18px);
        }

        .input-row {
            display: flex;
            align-items: center;
        }

        .input-row input {
            flex: 1;
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 13px;
        }

        .button {
            padding: 8px 15px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            margin-top: 5px;
            font-size: 13px;
            transition: all 0.2s;
        }

        .button-primary {
            background-color: #2196F3;
            color: white;
        }

        .button-primary:hover {
            background-color: #0b7dda;
        }

        .button-danger {
            background-color: #ff5555;
            color: white;
        }

        .button-danger:hover {
            background-color: #ff0000;
        }

        .button-info {
            background-color: #17a2b8;
            color: white;
            position: relative;
        }

        .button-info:hover {
            background-color: #138496;
        }

        .record-count {
            position: absolute;
            top: -8px;
            right: -8px;
            background-color: #ff6b6b;
            color: white;
            font-size: 11px;
            font-weight: bold;
            min-width: 20px;
            height: 20px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0 5px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        }

        .stat-info {
            font-size: 13px;
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px dashed #eee;
            line-height: 1.6;
            color: #666;
        }

        .stat-info span {
            font-weight: bold;
            color: #ff6b6b;
        }

        .vip-limit {
            background-color: #fff8e1;
            border-left: 4px solid #ffc107;
            padding: 10px;
            margin-top: 10px;
            border-radius: 4px;
            font-size: 13px;
            display: flex;
            align-items: center;
        }

        .vip-limit-icon {
            color: #ffc107;
            font-size: 18px;
            margin-right: 8px;
        }

        /* 最小化状态样式 */
        .minimized .panel-content {
            display: none;
        }

        .minimized {
            height: 42px;
        }

        /* 打招呼记录面板样式 */
        .record-panel {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 5px 20px rgba(0,0,0,0.2);
            z-index: 10000;
            width: 500px;
            max-height: 80vh;
            overflow: auto;
            display: none;
        }

        .record-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 1px solid #eee;
        }

        .record-title {
            margin: 0;
            font-size: 18px;
            font-weight: bold;
            color: #333;
        }

        .close-record {
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: #999;
        }

        .record-list {
            list-style: none;
            padding: 0;
            margin: 0;
        }

        .record-item {
            padding: 10px;
            border-bottom: 1px solid #f0f0f0;
            display: flex;
            justify-content: space-between;
        }

        .record-item:last-child {
            border-bottom: none;
        }

        .record-name {
            font-weight: bold;
            color: #333;
        }

        .record-school {
            color: #666;
            font-size: 13px;
        }

        .record-time {
            color: #999;
            font-size: 12px;
        }

        .record-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            z-index: 9999;
            display: none;
        }
    `);

    // ====== 控制面板 ======
    function createControlPanel() {
        // 确保只创建一次控制面板
        if (document.querySelector('.controls-container')) {
            return;
        }

        const container = document.createElement('div');
        container.className = 'controls-container';
        container.innerHTML = `
            <div class="panel-header">
                <h3 class="controls-title">目标候选人筛选</h3>
                <button id="minimizeBtn" class="minimize-btn">▼</button>
            </div>
            <div class="panel-content">
                <div class="controls-group">
                    <label class="control-label">显示目标人选：</label>
                    <div class="toggle-container">
                        <label class="toggle-switch">
                            <input type="checkbox" id="showTargetToggle">
                            <span class="slider"></span>
                        </label>
                        <span style="margin-left: 10px;" id="targetStatus">已禁用</span>
                    </div>
                </div>

                <div class="controls-group">
                    <label class="control-label">26年应届生：</label>
                    <div class="toggle-container">
                        <label class="toggle-switch">
                            <input type="checkbox" id="freshGraduateToggle" checked>
                            <span class="slider"></span>
                        </label>
                        <span style="margin-left: 10px;" id="freshGraduateStatus">已启用</span>
                    </div>
                </div>

                <div class="controls-group">
                    <label class="control-label">自动打招呼：</label>
                    <div class="input-row">
                        <input type="number" id="autoGreetDelay" min="2" max="60" value="5">
                        <span style="margin:0 10px">秒</span>
                    </div>
                    <button id="autoGreetStart" class="button button-primary">开始打招呼</button>
                    <button id="autoGreetStop" class="button button-danger" style="display:none">停止</button>
                </div>

                <div class="controls-group">
                    <label class="control-label">自动滚动加载：</label>
                    <div class="toggle-container">
                        <label class="toggle-switch">
                            <input type="checkbox" id="autoScrollToggle">
                            <span class="slider"></span>
                        </label>
                        <span style="margin-left: 10px;" id="scrollStatus">已禁用</span>
                    </div>
                </div>

                <button id="showRecordBtn" class="button button-info">
                    查看打招呼记录
                    <span class="record-count">0</span>
                </button>

                <div class="stat-info">
                    当前目标院校：${targetSchools.slice(0, 3).join(', ')}${targetSchools.length > 3 ? '等' + targetSchools.length + '所' : ''}<br>
                    目标专业关键词：${KEYWORDS.slice(0, 3).join(', ')}${KEYWORDS.length > 3 ? '等' + KEYWORDS.length + '个' : ''}
                </div>
                
                <div id="vipLimitAlert" class="vip-limit" style="display:none">
                    <span class="vip-limit-icon">⚠️</span>
                    <span>已达到VIP限制，自动打招呼已停止</span>
                </div>
            </div>
        `;

        document.body.appendChild(container);

        // 添加事件监听
        document.getElementById('showTargetToggle').addEventListener('change', toggleTargetOnly);
        document.getElementById('autoGreetStart').addEventListener('click', startAutoGreeting);
        document.getElementById('autoGreetStop').addEventListener('click', stopAutoGreeting);
        document.getElementById('minimizeBtn').addEventListener('click', togglePanelMinimize);
        document.getElementById('autoScrollToggle').addEventListener('change', toggleAutoScroll);
        document.getElementById('freshGraduateToggle').addEventListener('change', toggleFreshGraduate);
        document.getElementById('showRecordBtn').addEventListener('click', showGreetingRecords);

        // 添加拖拽功能
        addDragFunctionality(container);

        // 创建打招呼记录面板
        createRecordPanel();

        // 更新记录计数
        updateRecordCount();
    }

    // ====== 创建打招呼记录面板 ======
    function createRecordPanel() {
        const overlay = document.createElement('div');
        overlay.className = 'record-overlay';
        overlay.id = 'recordOverlay';

        const panel = document.createElement('div');
        panel.className = 'record-panel';
        panel.id = 'recordPanel';
        panel.innerHTML = `
            <div class="record-header">
                <h3 class="record-title">打招呼记录</h3>
                <button class="close-record">×</button>
            </div>
            <ul class="record-list" id="recordList"></ul>
        `;

        document.body.appendChild(overlay);
        document.body.appendChild(panel);

        // 添加关闭事件
        document.querySelector('.close-record').addEventListener('click', hideGreetingRecords);
        overlay.addEventListener('click', hideGreetingRecords);
    }

    // ====== 显示打招呼记录 ======
    function showGreetingRecords() {
        document.getElementById('recordPanel').style.display = 'block';
        document.getElementById('recordOverlay').style.display = 'block';
        updateRecordPanel();
        recordPanelVisible = true;
    }

    // ====== 隐藏打招呼记录 ======
    function hideGreetingRecords() {
        document.getElementById('recordPanel').style.display = 'none';
        document.getElementById('recordOverlay').style.display = 'none';
        recordPanelVisible = false;
    }

    // ====== 更新打招呼记录面板 ======
    function updateRecordPanel() {
        const list = document.getElementById('recordList');
        list.innerHTML = '';

        if (greetingRecords.size === 0) {
            list.innerHTML = '<li style="text-align:center;color:#999;padding:20px;">暂无打招呼记录</li>';
            return;
        }

        // 按时间倒序排序
        const sortedRecords = Array.from(greetingRecords.values()).sort((a, b) => {
            return new Date(b.time) - new Date(a.time);
        });

        sortedRecords.forEach(record => {
            const li = document.createElement('li');
            li.className = 'record-item';
            li.innerHTML = `
                <div>
                    <div class="record-name">${record.name}</div>
                    <div class="record-school">${record.school} · ${record.degree}</div>
                </div>
                <div class="record-time">${record.time}</div>
            `;
            list.appendChild(li);
        });
    }

    // ====== 添加打招呼记录 ======
    function addGreetingRecord(candidateInfo) {
        const id = candidateInfo.id;
        const currentTime = new Date().toLocaleTimeString();

        if (greetingRecords.has(id)) {
            // 更新已有记录的时间
            const record = greetingRecords.get(id);
            record.time = currentTime;
        } else {
            // 添加新记录
            const record = {
                id,
                name: candidateInfo.name,
                school: candidateInfo.school,
                degree: candidateInfo.degree,
                time: currentTime
            };

            greetingRecords.set(id, record);

            // 限制记录数量
            if (greetingRecords.size > 100) {
                // 删除最早的一条记录
                const oldestId = Array.from(greetingRecords.keys())[0];
                greetingRecords.delete(oldestId);
            }
        }

        // 更新记录计数
        updateRecordCount();

        // 如果记录面板可见，则实时更新
        if (recordPanelVisible) {
            updateRecordPanel();
        }
    }

    // ====== 更新记录计数 ======
    function updateRecordCount() {
        const countElement = document.querySelector('#showRecordBtn .record-count');
        if (countElement) {
            countElement.textContent = greetingRecords.size;
        }
    }

    // ====== 控制面板最小化 ======
    function togglePanelMinimize() {
        const container = document.querySelector('.controls-container');
        const minimizeBtn = document.getElementById('minimizeBtn');

        panelMinimized = !panelMinimized;
        container.classList.toggle('minimized', panelMinimized);
        minimizeBtn.textContent = panelMinimized ? '▲' : '▼';
    }

    // ====== 控制面板拖拽功能 ======
    function addDragFunctionality(panel) {
        const header = panel.querySelector('.panel-header');
        let isDragging = false;
        let offsetX, offsetY;

        header.addEventListener('mousedown', function (e) {
            isDragging = true;
            offsetX = e.clientX - panel.getBoundingClientRect().left;
            offsetY = e.clientY - panel.getBoundingClientRect().top;
            panel.style.cursor = 'grabbing';
        });

        document.addEventListener('mousemove', function (e) {
            if (isDragging) {
                const x = e.clientX - offsetX;
                const y = e.clientY - offsetY;

                // 限制在可视区域内
                const maxX = window.innerWidth - panel.offsetWidth;
                const maxY = window.innerHeight - panel.offsetHeight;

                panel.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
                panel.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
            }
        });

        document.addEventListener('mouseup', function () {
            isDragging = false;
            panel.style.cursor = '';
        });
    }

    // ====== 筛选功能 ======
    function shouldHighlightCandidate(candidate) {
        // 检查学校是否为目标院校
        const education = candidate.geekCard.geekEdu;
        if (!education || !education.school || !targetSchools.includes(education.school)) {
            return false;
        }

        // 检查学历是否符合要求
        if (!DEGREE_FILTER.includes(candidate.geekCard.geekDegree)) {
            return false;
        }

        // 检查是否要求26年应届生
        if (requireFreshGraduate) {
            if (candidate.geekCard.geekWorkYear !== '26年应届生') {
                return false;
            }
        }

        // 检查关键词匹配
        const candidateText = [
            candidate.geekCard.geekName,
            candidate.geekCard.geekWorkYear,
            candidate.geekCard.geekDegree,
            candidate.geekCard.geekDesc?.content || '',
            candidate.geekCard.middleContent?.content || '',
            candidate.geekCard.expectPositionName || '',
            candidate.geekCard.expectPositionNameLv2 || '',
            ...candidate.showEdus.map(e => `${e.school} ${e.major} ${e.degreeName}`).join(' '),
            ...candidate.showWorks.map(w => `${w.company} ${w.positionName}`).join(' '),
            ...(candidate.geekCard.matches || [])
        ].join(' ').toLowerCase();

        return KEYWORDS.some(keyword =>
            candidateText.includes(keyword.toLowerCase())
        );
    }

    // ====== 页面标记功能 ======
    function markTargetCandidates() {
        const cards = document.querySelectorAll('.card-list > li, .card-item');

        cards.forEach(card => {
            const geekId = card.querySelector('[data-geek], [data-geekid]')?.getAttribute('data-geekid') ||
                card.querySelector('[data-geek], [data-geekid]')?.getAttribute('data-geek');

            if (!geekId) return;

            const candidateInfo = geekDataMap.get(geekId);

            if (candidateInfo && candidateInfo.isTarget) {
                if (!card.classList.contains('target-candidate')) {
                    card.classList.add('target-candidate');

                    // 添加标记
                    const marker = document.createElement('div');
                    marker.className = 'target-indicator';
                    marker.textContent = '目标人选';
                    card.style.position = 'relative';
                    card.appendChild(marker);
                }
            } else {
                card.classList.remove('target-candidate');
                const marker = card.querySelector('.target-indicator');
                if (marker) marker.remove();
            }

            // 处理筛选开关
            if (showTargetOnly) {
                if (candidateInfo && candidateInfo.isTarget) {
                    card.classList.remove('hide-candidate');
                } else {
                    card.classList.add('hide-candidate');
                }
            } else {
                card.classList.remove('hide-candidate');
            }
        });

        updateStatusUI();
    }

    function updateStatusUI() {
        const targetCards = document.querySelectorAll('.target-candidate');
        const statusText = document.getElementById('targetStatus');
        const scrollStatus = document.getElementById('scrollStatus');
        const freshGraduateStatus = document.getElementById('freshGraduateStatus');
        const vipAlert = document.getElementById('vipLimitAlert');

        if (statusText) {
            statusText.textContent = showTargetOnly ? `已显示 ${targetCards.length} 人` : `已标记 ${targetCards.length} 人`;
        }

        if (scrollStatus) {
            scrollStatus.textContent = autoScrollEnabled ? '已启用' : '已禁用';
        }

        if (freshGraduateStatus) {
            freshGraduateStatus.textContent = requireFreshGraduate ? '已启用' : '已禁用';
        }

        if (vipAlert) {
            vipAlert.style.display = vipLimitReached ? 'flex' : 'none';
        }

        // 更新目标院校显示
        const statInfo = document.querySelector('.stat-info');
        if (statInfo) {
            statInfo.innerHTML = `
                当前目标院校：${targetSchools.slice(0, 3).join(', ')}${targetSchools.length > 3 ? '等' + targetSchools.length + '所' : ''}<br>
                目标专业关键词：${KEYWORDS.slice(0, 3).join(', ')}${KEYWORDS.length > 3 ? '等' + KEYWORDS.length + '个' : ''}
            `;
        }
    }

    function toggleTargetOnly(e) {
        showTargetOnly = e.target.checked;
        markTargetCandidates();
    }

    function toggleFreshGraduate(e) {
        requireFreshGraduate = e.target.checked;

        // 根据26年应届生开关更新目标院校列表
        if (requireFreshGraduate) {
            // 使用前60所学校
            targetSchools = FULL_TARGET_SCHOOLS.slice(0, 60);
        } else {
            // 使用全部学校
            targetSchools = FULL_TARGET_SCHOOLS;
        }

        // 重新筛选候选人
        geekDataMap.forEach((info, id) => {
            const candidate = info.rawData;
            info.isTarget = shouldHighlightCandidate(candidate);
        });

        markTargetCandidates();
    }

    // ====== VIP限制检测 ======
    function checkVipLimit() {
        // 查找VIP限制弹窗
        const vipPopup = document.querySelector('.dialog-wrap[data-type="boss-dialog"]');

        if (vipPopup) {
            // 检查弹窗内容是否包含VIP限制关键词
            const popupText = vipPopup.textContent || '';
            if (popupText.includes('升级VIP高级版') || popupText.includes('VIP限制')) {
                return true;
            }
        }

        return false;
    }

    // ====== 自动打招呼功能 ======
    function startAutoGreeting() {
        const delayInput = document.getElementById('autoGreetDelay');
        const delaySeconds = parseInt(delayInput.value) || 5;
        autoGreetingDelay = Math.max(2000, delaySeconds * 1000);

        // 重置VIP限制状态
        vipLimitReached = false;
        updateStatusUI();

        stopAutoGreeting();

        autoGreetingInterval = setInterval(() => {
            // 检查VIP限制
            if (vipLimitReached) {
                stopAutoGreeting();
                return;
            }

            const targetButtons = document.querySelectorAll('.target-candidate .btn-greet:not(.greeted)');

            if (targetButtons.length > 0) {
                const randomIndex = Math.floor(Math.random() * targetButtons.length);
                const button = targetButtons[randomIndex];

                if (button) {
                    button.click();
                    button.classList.add('greeted');

                    // 获取候选人信息
                    const card = button.closest('.card-item, .card-list > li');
                    const geekId = card.querySelector('[data-geek], [data-geekid]')?.getAttribute('data-geekid') ||
                        card.querySelector('[data-geek], [data-geekid]')?.getAttribute('data-geek');

                    if (geekId) {
                        const candidateInfo = geekDataMap.get(geekId);
                        if (candidateInfo) {
                            addGreetingRecord(candidateInfo);
                        }
                    }

                    console.log(`已向目标人选发送打招呼消息 ${new Date().toLocaleTimeString()}`);

                    // 0.5秒后检查VIP限制
                    setTimeout(() => {
                        if (checkVipLimit()) {
                            vipLimitReached = true;
                            stopAutoGreeting();
                            updateStatusUI();
                            alert('已达到VIP限制，自动打招呼已停止');
                        }
                    }, 500);
                }
            } else {
                stopAutoGreeting();
                if (autoScrollEnabled) {
                    scrollToLoadMore();
                } else {
                    alert('所有目标人选已经打完招呼');
                }
            }
        }, autoGreetingDelay);

        // 更新UI
        document.getElementById('autoGreetStart').style.display = 'none';
        document.getElementById('autoGreetStop').style.display = 'inline-block';
    }

    function stopAutoGreeting() {
        if (autoGreetingInterval) {
            clearInterval(autoGreetingInterval);
            autoGreetingInterval = null;
        }

        document.getElementById('autoGreetStart').style.display = 'inline-block';
        document.getElementById('autoGreetStop').style.display = 'none';
    }

    // ====== 自动滚动加载功能 ======
    function toggleAutoScroll(e) {
        autoScrollEnabled = e.target.checked;
        updateStatusUI();

        if (autoScrollEnabled) {
            // 如果自动打招呼未启用，则启用它
            if (!autoGreetingInterval) {
                startAutoGreeting();
            }
        }
    }

    function scrollToLoadMore() {
        // 检查是否还有更多数据
        const noMoreElement = document.querySelector('.finished-wrap');
        if (noMoreElement && noMoreElement.textContent.includes('没有更多了')) {
            stopAutoGreeting();
            alert('所有目标人选已经打完招呼，且没有更多数据可加载');
            return;
        }

        // 滚动到底部
        window.scrollTo(0, document.body.scrollHeight);

        // 等待页面加载新数据
        setTimeout(() => {
            // 重新开始自动打招呼
            startAutoGreeting();
        }, 3000);
    }

    // ====== 岗位切换检测 ======
    function detectJobChange() {
        const jobSelector = document.querySelector('.job-selecter-wrap');
        if (!jobSelector) return;

        jobSelector.addEventListener('click', function () {
            // 重置自动打招呼状态
            stopAutoGreeting();

            // 重置自动滚动状态
            autoScrollEnabled = false;
            document.getElementById('autoScrollToggle').checked = false;

            // 清空候选人数据
            geekDataMap.clear();

            // 重置岗位ID
            currentJobId = null;

            // 重置VIP限制状态
            vipLimitReached = false;
            updateStatusUI();

            // 更新UI
            updateStatusUI();
        });
    }

    // ====== API拦截 ======
    function setupAPIHook() {
        // 确保只初始化一次
        if (window.bossHookInitialized) return;
        window.bossHookInitialized = true;

        xhook.after(function (request, response) {
            if (request.url.includes('zpjob/rec/geek/list')) {
                try {
                    const data = JSON.parse(response.text);

                    if (data.zpData && data.zpData.geekList) {
                        // 获取当前岗位ID
                        const jobId = data.zpData.encryptJobId || data.zpData.jobId;

                        // 如果岗位发生变化，重置数据
                        if (currentJobId && currentJobId !== jobId) {
                            geekDataMap.clear();
                        }
                        currentJobId = jobId;

                        data.zpData.geekList.forEach(candidate => {
                            const id = candidate.encryptGeekId;

                            if (!geekDataMap.has(id)) {
                                // 执行筛选逻辑
                                const isTarget = shouldHighlightCandidate(candidate);

                                geekDataMap.set(id, {
                                    id,
                                    name: candidate.geekCard?.geekName || '未知',
                                    school: candidate.geekCard?.geekEdu?.school || '未知院校',
                                    degree: candidate.geekCard?.geekDegree || '未知',
                                    isTarget,
                                    rawData: candidate // 保存原始数据用于重新筛选
                                });
                            }
                        });

                        // 延迟执行以确保DOM更新完成
                        setTimeout(markTargetCandidates, 800);
                    }
                } catch (e) {
                    console.error('解析候选人数据失败:', e);
                }
            }
        });
    }

    // ====== 设置观察器 ======
    function setupObserver() {
        // 确保只初始化一次观察器
        if (observerInitialized) return;
        observerInitialized = true;

        const observer = new MutationObserver(function (mutations) {
            mutations.some(mutation => {
                // 检查是否有.card-list节点变动
                if (mutation.target.classList && mutation.target.classList.contains('card-list')) {
                    markTargetCandidates();
                    return true;
                }

                // 检查是否有.card-item节点添加
                if (mutation.addedNodes) {
                    for (let node of mutation.addedNodes) {
                        if (node.classList && node.classList.contains('card-item')) {
                            markTargetCandidates();
                            return true;
                        }
                    }
                }

                return false;
            });
        });

        observer.observe(document, {
            childList: true,
            subtree: true
        });
    }

    // ====== 主函数 ======
    function init() {
        // 创建控制面板（确保只创建一次）
        createControlPanel();

        // 设置API拦截
        setupAPIHook();

        // 设置观察器
        setupObserver();

        // 检测岗位切换
        detectJobChange();

        // 初始执行一次
        setTimeout(markTargetCandidates, 1000);
    }

    // ====== 页面加载处理 ======
    function handlePageLoad() {
        // 检查是否已经初始化
        if (window.bossScriptInitialized) return;
        window.bossScriptInitialized = true;

        // 执行初始化
        init();

        // 添加SPA路由变化监听
        window.addEventListener('popstate', init);
        window.addEventListener('pushstate', init);
    }

    // 页面加载后执行
    if (document.readyState === 'complete') {
        handlePageLoad();
    } else {
        window.addEventListener('load', handlePageLoad);
    }
})();