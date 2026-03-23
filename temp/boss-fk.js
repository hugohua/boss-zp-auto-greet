// ==UserScript==
// @name         BOSS直聘自然点击模拟
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  拦截并替换BOSS直聘网站上的第三方工具点击数据，模拟自然点击行为
// @author       YourName
// @author       使用DeedSeed R1模型完成：https://yuanbao.tencent.com/chat/naQivTmsDa/32caabd4-2af8-46f7-ba67-6d492a374bc4
// @match        https://*.zhipin.com/web/*/recommend/*
// @require      https://tinydoc.cloudbu.huawei.com/hugo/xhook.min.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // 存储生成的点击数据
    let generatedData = null;
    let dataExpireTime = 0;
    let behaviorHistory = []; // 用户行为历史记录
    let lastActionTime = 0; // 上次操作时间
    let scrollPositions = []; // 滚动位置记录
    let isSimulating = false; // 是否正在模拟行为

    // 生成自然点击数据函数
    function generateNaturalClickData() {
        const appKey = "MeT5lsyaHisySUCH";
        const userAgent = navigator.userAgent;
        const now = Date.now();

        // 接口2比接口1早17ms
        const timestamp2 = now;
        const timestamp1 = timestamp2 + 17;

        // 真实坐标模板
        const coordinateTemplates = [
            "60,7,1310,1421,61,4,1310,421",
            "47,16,1297,586,47,12,1297,286",
            "36,23,1286,792,36,19,1286,492",
            "40,13,1290,1181,40,10,1290,581"
        ];

        const p4 = coordinateTemplates[Math.floor(Math.random() * coordinateTemplates.length)];
        const [x1, y1, x2, y2, x3, y3, x4, y4] = p4.split(',').map(Number);

        // 主路径
        const mainPath = "HTML>BODY>.container-wrap>#container>.recommend-wrap>.candidate-recommend>.candidate-body>.recommend-list-wrap>#recommend-list>.list-body>.card-list>.card-item .target-candidate>.candidate-card-wrap>.operate-side>.button-chat-wrap .button-chat>.btn-doc>.button-list>.btn .btn-greet";

        // 轨迹数据模板（基于真实行为生成）
        const p6 = {
            l: Math.floor(Math.random() * 500) + 100,
            h: Math.floor(Math.random() * 90000) + 10000,
            g: `${Math.floor(Math.random() * 3000) + 1000},${Math.floor(Math.random() * 800) + 100},${Math.floor(Math.random() * 15000) + 10000}`,
            i: Math.floor(Math.random() * 10) + 1,
            j: Math.floor(Math.random() * 100) + 50,
            z: generateRandomZ(),
            x: generateRandomX(),
            y: generateRandomY(),
            d: generateRandomD(),
            e: generateRandomE(),
            w: "",
            v: "0,0",
            a: "0,763",
            b: "1000,1000,0,0",
            c: "0,0,0,0",
            fg: "1b5848afecf3d565b56b9f45247c78a3"
        };

        return {
            interface1: {
                identity: 1,
                items: [{
                    action: "web-event-click",
                    p: JSON.stringify({ appKey, time: timestamp1 }),
                    p2: 0,
                    p3: 0,
                    p4: p4,
                    p5: "/html/body/div/div/div/div/div/div/div/div/ul/li/div/div/div/span/div/button",
                    p6: p6,
                    p7: 0,
                    p8: `${mainPath}.overdue-tip|${mainPath}`,
                    p9: userAgent
                }],
                clientInfo: {
                    model: "",
                    version: "",
                    os: "",
                    channel: "",
                    ssid: "",
                    bssid: "",
                    imei: "",
                    longitude: "",
                    dzt: "",
                    latitude: "",
                    network: ""
                }
            },
            interface2: {
                identity: 1,
                items: [{
                    action: "web-event-click",
                    p: JSON.stringify({ appKey, time: timestamp2 }),
                    p2: 0,
                    p3: 10004,
                    p4: p4,
                    p5: x3,
                    p6: y3,
                    p7: timestamp2,
                    p8: `${mainPath}.overdue-tip`,
                    p9: userAgent
                }],
                clientInfo: {
                    model: "",
                    version: "",
                    os: "",
                    channel: "",
                    ssid: "",
                    bssid: "",
                    imei: "",
                    longitude: "",
                    dzt: "",
                    latitude: "",
                    network: ""
                }
            }
        };
    }

    // 生成随机z值（基于真实模式）
    function generateRandomZ() {
        const patterns = [
            "8,8,15,7,8,7,8,7,8,10,8,5,7,7,8,7,19,4,8,8,8,6,8,7,8,7,7,8,7,16,6,8,15,8,7,9,6,8,7,8,7,8,15,7,8,8,10,12,294,9,4,8,7,8,7,9,6,8,8,8,15,21,362,6,7,7,9,14,8,11,5,6,8,8,8,7,7,7,7,8,24,6,7,8,7,8,7,7959,10,12,8,7,8,7,10,6,7,7,7,8,7,8,37,8,7,8,7,8,7,8,9,6,8,15,8,7,7,8,8,6,8,7,8,7,8,7,16,7,9,6,8,7,8,7,8,8,7,7,7,9,14,7,9,7,8,8,6,9,6,8,8,7,7,15,10,6,8,6,8,22,8,8,7,7,9,14,7,8,7,8,7,8,8,6,9,6,8,8,15,7,8,8,7,7,8,8,8,7,8,7,8,77,35,26,4,25,5,22,7",
            "9,6,7,8,15,10,7,8,6,7,8,7,7,8,8,6,8,17,8,5,8,7,8,8,7,7,7,9,7,7,7,18,5,9940,1,8,3,9,7,7,15,2,5,8,9,6,7,23,54,6,7,8,7,8,7,8,9,6,15,8,7,8,7,8,10,6,9,5,7,8,8,7,15,13643,6,8,17,1,13,7,8,11,3,9,6,8,7,7,8,7,9,6,16,7,8,8,7,7,8,7,8,7,9,6,8,15,8,6,8,7,10,16,5,7,7,8,8,7,15,7,8,8,7,8,7,8,8,7,8,7,22,8,23,7,7,7,9,9,5,8,8,7,15,8,7,7,8,7,7,8,7,8,8,18,12,8,7,7,15,1,15,15,0,8,6,17,0,15,6,7,8,7,7,8,8,7,8,8,7,9,15,6,15,7,8,7,8,14,8,8,7,16,15,7,9,83,6,14,8"
        ];
        return patterns[Math.floor(Math.random() * patterns.length)];
    }

    // 生成随机x坐标序列
    function generateRandomX() {
        const points = [];
        let current = 1300;
        for (let i = 0; i < 200; i++) {
            // 模拟真实鼠标移动：大部分小幅移动，偶尔大幅移动
            const move = Math.random() > 0.9 ?
                Math.floor(Math.random() * 100) - 50 :
                Math.floor(Math.random() * 10) - 5;

            current += move;
            points.push(current);
        }
        return points.join(",");
    }

    // 生成随机y坐标序列
    function generateRandomY() {
        const points = [];
        let current = 300;
        for (let i = 0; i < 200; i++) {
            // 模拟真实鼠标移动：上下波动
            const move = Math.random() > 0.8 ?
                Math.floor(Math.random() * 50) - 25 :
                Math.floor(Math.random() * 8) - 4;

            current += move;
            points.push(current);
        }
        return points.join(",");
    }

    // 生成随机d值（移动距离）
    function generateRandomD() {
        const values = [];
        for (let i = 0; i < 200; i++) {
            // 大部分小幅移动，偶尔大幅移动
            values.push(Math.random() > 0.9 ?
                Math.floor(Math.random() * 20) - 10 :
                Math.floor(Math.random() * 5) - 2);
        }
        return values.join(",");
    }

    // 生成随机e值（移动事件）
    function generateRandomE() {
        const values = [];
        for (let i = 0; i < 200; i++) {
            // 模拟真实事件：大部分为0或1，偶尔有较大值
            values.push(Math.random() > 0.95 ?
                Math.floor(Math.random() * 10) :
                Math.floor(Math.random() * 2));
        }
        return values.join(",");
    }

    // 检测是否为第三方工具数据
    function isThirdPartyData(requestData) {
        if (!requestData.items || !Array.isArray(requestData.items)) return false;

        for (const item of requestData.items) {
            // 检测异常p2值
            if (item.p2 === 52001) return true;

            // 检测异常坐标（包含负值）
            if (item.p4 && /-\d+/.test(item.p4)) return true;

            // 检测异常轨迹数据
            if (item.p6 && (
                item.p6.x === "" ||
                item.p6.y === "" ||
                item.p6.d === "" ||
                item.p6.e === ""
            )) return true;

            // 检测插件路径
            if (item.p8 && item.p8.includes("#autoGreetStart")) return true;
        }

        return false;
    }

    // 模拟真实用户行为（频率降低版本）
    function simulateUserBehavior() {
        if (isSimulating) return;
        isSimulating = true;

        try {
            // 随机选择1-2个行为执行
            const actions = [
                simulateRandomScroll,
                simulateRandomClicks,
                simulateRandomMouseMove
            ];

            // 随机选择1-2个行为
            const actionCount = Math.floor(Math.random() * 2) + 1;
            const selectedActions = [];

            for (let i = 0; i < actionCount; i++) {
                const randomIndex = Math.floor(Math.random() * actions.length);
                selectedActions.push(actions[randomIndex]);
            }

            // 执行选中的行为
            selectedActions.forEach(action => action());

        } finally {
            isSimulating = false;
        }

        // 随机等待时间（8-12秒）
        const waitTime = Math.floor(Math.random() * 4000) + 8000;
        setTimeout(simulateUserBehavior, waitTime);
    }

    // 模拟随机滚动（频率降低）
    function simulateRandomScroll() {
        if (Math.random() > 0.6) return; // 60%概率不滚动

        const scrollHeight = document.documentElement.scrollHeight;
        const scrollTo = Math.floor(Math.random() * scrollHeight);

        // 平滑滚动
        window.scrollTo({
            top: scrollTo,
            behavior: 'smooth'
        });

        // 记录滚动位置
        scrollPositions.push(scrollTo);
        if (scrollPositions.length > 5) scrollPositions.shift();

        // 记录行为
        behaviorHistory.push({
            type: 'scroll',
            position: scrollTo,
            time: Date.now()
        });
    }

    // 模拟随机点击（频率降低）
    function simulateRandomClicks() {
        if (Math.random() > 0.7) return; // 70%概率不点击

        const clickableElements = document.querySelectorAll('a, button, .btn, [onclick]');
        if (clickableElements.length === 0) return;

        const randomIndex = Math.floor(Math.random() * clickableElements.length);
        const element = clickableElements[randomIndex];

        // 生成点击事件
        const clickEvent = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: element.getBoundingClientRect().left + 10,
            clientY: element.getBoundingClientRect().top + 10
        });

        // 触发点击事件
        element.dispatchEvent(clickEvent);

        // 记录行为
        behaviorHistory.push({
            type: 'click',
            target: element.tagName,
            className: element.className || '',
            time: Date.now()
        });
    }

    // 模拟随机鼠标移动（频率降低）
    function simulateRandomMouseMove() {
        if (Math.random() > 0.5) return; // 50%概率不移动鼠标

        const startX = Math.floor(Math.random() * window.innerWidth);
        const startY = Math.floor(Math.random() * window.innerHeight);
        const endX = Math.floor(Math.random() * window.innerWidth);
        const endY = Math.floor(Math.random() * window.innerHeight);

        // 创建鼠标移动事件
        const moveEvent = new MouseEvent('mousemove', {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: startX,
            clientY: startY
        });

        // 触发鼠标移动
        document.dispatchEvent(moveEvent);

        // 记录行为
        behaviorHistory.push({
            type: 'mousemove',
            from: `(${startX},${startY})`,
            to: `(${endX},${endY})`,
            time: Date.now()
        });
    }

    // 生成行为上下文
    function generateBehaviorContext() {
        if (behaviorHistory.length === 0) return "";

        // 只保留最近5个行为
        if (behaviorHistory.length > 5) {
            behaviorHistory = behaviorHistory.slice(-5);
        }

        return behaviorHistory.map(behavior => {
            return `${behavior.type}:${behavior.target || ''}@${behavior.time}`;
        }).join("|");
    }


    // 拦截请求
    xhook.before(function (request) {
        if (!request.url.includes('https://apm-fe.zhipin.com/wapi/zpApm/actionLog/fe/ie/common.json')) return;
        if (request.method !== 'POST') return;

        try {
            // 解析URL编码的请求体
            const params = new URLSearchParams(request.body);
            const content = params.get('content');
            if (!content) return;

            // 解码并解析JSON
            const decodedContent = decodeURIComponent(content);
            const requestData = JSON.parse(decodedContent);

            if (isThirdPartyData(requestData)) {
                console.log('检测到第三方工具点击数据，准备替换...');

                // 清除过期数据
                if (generatedData && Date.now() > dataExpireTime) {
                    generatedData = null;
                }

                // 生成新数据（如果不存在或已过期）
                if (!generatedData) {
                    generatedData = generateNaturalClickData();
                    dataExpireTime = Date.now() + 100; // 100ms有效期
                    console.log('生成新的自然点击数据');
                }

                // 根据请求类型替换数据
                const isInterface1 = requestData.items.some(item => item.p3 === 0);
                const newData = isInterface1 ? generatedData.interface1 : generatedData.interface2;

                // 添加行为上下文
                const behaviorContext = generateBehaviorContext();
                if (behaviorContext) {
                    newData.clientInfo.behaviorContext = behaviorContext;
                }

                // 添加滚动位置
                if (scrollPositions.length > 0) {
                    newData.clientInfo.scrollPositions = scrollPositions.join(",");
                }

                // 添加操作间隔
                if (lastActionTime > 0) {
                    const interval = Date.now() - lastActionTime;
                    newData.clientInfo.actionInterval = interval;
                    lastActionTime = Date.now();
                } else {
                    lastActionTime = Date.now();
                }

                // 将新数据转换为字符串，并进行URL编码
                const newContent = encodeURIComponent(JSON.stringify(newData));
                request.body = `content=${newContent}`;

                console.log('已替换为自然点击数据');
            }
        } catch (e) {
            console.error("请求处理错误:", e);
        }
    });

    // 初始化用户行为模拟
    window.addEventListener('load', function () {
        // 等待页面完全加载
        setTimeout(() => {
            // 开始模拟用户行为
            simulateUserBehavior();

            // 记录初始滚动位置
            scrollPositions.push(window.scrollY);

            console.log('BOSS直聘反爬检测绕过脚本已加载');
        }, 5000); // 5秒后开始模拟
    });
})();