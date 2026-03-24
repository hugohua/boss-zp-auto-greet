# 06. 工具函数库参考 (API & Utils)

`src/utils.js` 提供了无副作用的纯函数以及部分不依赖特定业务上下文的通用对象。后续开发时请尽量复用这些函数，避免重复造轮子。

## 1. 异步等待
**`sleep(ms)`**
基于 Promise 的延迟函数。在 `async/await` 链条中最常用的工具。
```javascript
import { sleep } from './utils.js';
await sleep(1500); // 停顿 1.5 秒
```

## 2. 随机化工具（辅助反侦察）
**`randomInterval(base, variance)`**
生成带波动的随机时间间隔。
* `base`: 基础毫秒数。
* `variance`: 波动范围（默认 0.3 即 ±30%）。
* 用法：`await sleep(randomInterval(1000, 0.4))` -> 等待 600ms~1400ms 中的随机值。

**`randomInt(min, max)`**
生成闭区间 `[min, max]` 的随机整数。

**`chance(probability)`**
输入一个 `0~1` 的小数，返回一个 Boolean（例如 `chance(0.15)` 有 15% 几率返回 `true`）。

**`randomPick(arr)`**
从数组中随机抽取一个元素。

## 3. DOM 容错查询
**`queryFallback(selectors, parent = document)`**
为了抵抗 BOSS 前端页面频繁改版，传入一个可能有效的 CSS 选择器数组。如果第一个找不到或者语法报错，就尝试第二个，只要找到就立刻返回 `Element`。(若全都不行则返回 null)。
```javascript
const btn = queryFallback(['.btn-greet', '.start-chat-btn', 'button[ka*="greet"]'], cardElement);
```

**`queryAllFallback(selectors, parent = document)`**
与 `queryFallback` 原理相同，但返回所有匹配到的 DOM 元素数组。

**`scrollToElement(el, offset)`**
基于原生 `scrollIntoView` 的改良版，可平滑滚动页面，并将目标元素置于视口中，同时预留 `offset` 像素的安全头部空间，防止被顶导遮挡。

## 4. 全局日志输出器
包含一个导出的 `logger` 对象。
```javascript
import { logger } from './utils.js';

logger.info('这是一条普通日志');
logger.warn('限流警告');
logger.error('出现报错:', e.message);
```
所有日志不仅会印在浏览器 Console 且带有醒目的 `[BOSS助手]` 前缀，还会同时被写入到 `panel.js` 的终端 UI 面板中，方便小白用户截屏反馈。
