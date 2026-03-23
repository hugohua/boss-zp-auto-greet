/**
 * 注入脚本 — MAIN World
 * 在网页真实环境中运行，负责：
 * 1. APM 埋点数据清洗（拦截 XMLHttpRequest）
 * 2. API 响应拦截（捕获候选人列表数据）
 *
 * 通过 window.postMessage 与 ISOLATED world 的 content.js 通信
 */

(function () {
    'use strict';

    // ====== APM 拦截器 ======

    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this._bhUrl = url;
        this._bhMethod = method;
        return originalOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (body) {
        // 拦截 APM 埋点请求
        if (this._bhUrl && this._bhUrl.includes('/wapi/zpApm/actionLog/') && this._bhMethod === 'POST') {
            try {
                const cleaned = cleanApmData(body);
                if (cleaned !== body) {
                    return originalSend.call(this, cleaned);
                }
            } catch (e) { }
        }

        // 拦截候选人列表 API 响应
        if (this._bhUrl && (
            this._bhUrl.includes('/zpgeek/recommend/geek/list') ||
            this._bhUrl.includes('zpjob/rec/geek/list')
        )) {
            this.addEventListener('load', function () {
                try {
                    const data = JSON.parse(this.responseText);
                    if (data.zpData && data.zpData.geekList) {
                        window.postMessage({
                            source: 'boss-helper-injected',
                            type: 'GEEK_LIST',
                            payload: data.zpData.geekList,
                        }, '*');
                    }
                } catch (e) { }
            });
        }

        return originalSend.call(this, body);
    };

    // ====== Fetch 拦截 ======

    const originalFetch = window.fetch;
    window.fetch = function (input, init) {
        const url = typeof input === 'string' ? input : input?.url || '';

        return originalFetch.apply(this, arguments).then(response => {
            // 拦截候选人列表接口
            if (url.includes('/zpgeek/recommend/geek/list') || url.includes('zpjob/rec/geek/list')) {
                const cloned = response.clone();
                cloned.json().then(data => {
                    if (data.zpData && data.zpData.geekList) {
                        window.postMessage({
                            source: 'boss-helper-injected',
                            type: 'GEEK_LIST',
                            payload: data.zpData.geekList,
                        }, '*');
                    }
                }).catch(() => { });
            }
            return response;
        });
    };

    // ====== APM 数据清洗 ======

    function cleanApmData(body) {
        if (!body || typeof body !== 'string') return body;

        try {
            const params = new URLSearchParams(body);
            const content = params.get('content');
            if (!content) return body;

            const decoded = decodeURIComponent(content);
            const data = JSON.parse(decoded);

            if (!data.items || !Array.isArray(data.items)) return body;

            let modified = false;

            for (const item of data.items) {
                // 清除自动化工具特征标记 (p2=52001)
                if (item.p2 === 52001) {
                    item.p2 = 0;
                    modified = true;
                }

                // 修正负坐标
                if (item.p4 && typeof item.p4 === 'string' && /-\d+/.test(item.p4)) {
                    const coords = item.p4.split(',').map(Number);
                    item.p4 = coords.map(c => Math.abs(c) || randomInt(30, 70)).join(',');
                    modified = true;
                }

                // 补充空轨迹数据
                if (item.p6 && typeof item.p6 === 'object') {
                    if (!item.p6.x || item.p6.x === '') {
                        item.p6.x = generateMouseTrack(200, 1300);
                        modified = true;
                    }
                    if (!item.p6.y || item.p6.y === '') {
                        item.p6.y = generateMouseTrack(200, 300);
                        modified = true;
                    }
                    if (!item.p6.d || item.p6.d === '') {
                        item.p6.d = generateSmallValues(200);
                        modified = true;
                    }
                    if (!item.p6.e || item.p6.e === '') {
                        item.p6.e = generateSmallValues(200);
                        modified = true;
                    }
                }

                // 补充 click() 触发的坐标暴露 (p3=10004 时)
                if (item.p3 === 10004) {
                    if (item.p5 === 0) { item.p5 = randomInt(20, 80); modified = true; }
                    if (item.p6 === 0) { item.p6 = randomInt(10, 30); modified = true; }
                }

                // 移除脚本浮层 XPath 泄露（防止我们自己之前注入的残留被上报）
                if (item.p8 && (item.p8.includes('#boss-helper') || item.p8.includes('#bh-') || item.p8.includes('.bh-'))) {
                    item.p8 = '';
                    modified = true;
                }
            }

            if (!modified) return body;

            const newContent = encodeURIComponent(JSON.stringify(data));
            return `content=${newContent}`;
        } catch (e) {
            return body;
        }
    }

    // ====== 辅助函数 ======

    function randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function generateMouseTrack(length, startValue) {
        const points = [];
        let current = startValue;
        for (let i = 0; i < length; i++) {
            current += (Math.random() > 0.9) ? randomInt(-50, 50) : randomInt(-5, 5);
            points.push(current);
        }
        return points.join(',');
    }

    function generateSmallValues(length) {
        const values = [];
        for (let i = 0; i < length; i++) {
            values.push((Math.random() > 0.9) ? randomInt(-10, 10) : randomInt(-2, 2));
        }
        return values.join(',');
    }

    console.log('[BossHelper] MAIN world injected — APM interceptor active');
})();
