# 04. 核心业务逻辑：筛选与打招呼 (Core Business)

本模块是由 `filter.js` 和 `greeting.js` 构成的核心双引擎。分别负责“找人”和“打招呼”。

## 1. 候选人筛选引擎 (`filter.js`)
筛选引擎采用了增强型的数据猎取方案，提供 API拦截 和 DOM解析 两种能力。

### 1.1 API 解析优先级最高 (`installApiInterceptor`)
* **原理**：修改原生 `XMLHttpRequest.prototype.open` 和 `send`。只关注包含了 `/wapi/zpgeek/recommend/` 或 `/search/` 的接口响应。
* **数据映射**：将拿到干净 JSON 数据（包含 `geekId`, `school`, `degree` 等真实字段）映射保存到内存态的 `geekDataMap` 中。
* **目标判定**：依据 `config.js` 中的 `targetSchools` 列表比对院校，打上 `isTarget` 标记。

### 1.2 DOM 回退解析 (`filterByDOM`)
这是在 API 没有触发（如初次进网页）或者 API 结构巨变时的兜底方案。
* **找节点**：使用各种可能的类名 (如 `.recommend-card-wrap`, `.card-item`) 抓取卡片 DOM。
* **信息清洗**：通过复杂的正则匹配，剔除如 "2019 2023" 等年份信息，只保留精准的学校和学历名称 (`博士|硕士|本科...`)。
* **DOM 标记反哺**：为高潜候选人所在的卡片 DOM 添加高亮 CSS 类（如 `boss-helper-target`, `bh-target-985` 等），并在界面上直接挂载如 `<span>985</span>` 的角标元素。
* **ID 寻址**：通过 DOM 提取唯一的 `geekId`/`encryptGeekId` 并进行 Map 缓存去重，确保同一个人无论通过 API 还是 DOM 获取，只被处理一次。

## 2. 自动打招呼调度中心 (`greeting.js`)
此模块是一个**挂在后台持续运转的异步轮询循环**。

### 2.1 主循环机制 (`greetingLoop`)
调用 `startAutoGreeting()` 时启动 `while (!shouldStop)` 循环：
1. **安检与配额**：首先调用 `safetyCheck()` 和 `isLimitReached()` 确认大盘和账号配额是否正常。
2. **取件**：通过 `getUngreetedTargets()` 从 Map 里拿到目标候选人队列。
3. **随机跳过**：利用 `chance(config.skipProbability)` 概率跳过匹配到的目标，模拟“看着不顺眼就不打招呼”的真人错觉。
4. **拟真动作链执行**：滚动到该卡片 -> 延迟 -> 鼠标移动到打招呼按钮 -> 延迟 -> 执行点击。
5. **睡眠间隔**：完成一次打招呼后，调用 `sleep` (基于 `config.greetInterval` 进行随机波动)。
6. **疲劳管理**：触发 `consecutiveLimit` （例如连续操作15次）后，会增加一次长时间的 `restTime` (休息 1~3 分钟)。

### 2.2 打招呼的下沉执行 (`performGreeting` & `trySendGreetingMessage`)
* **按钮定位**：针对复杂的 DOM，兜底遍历多种特征类名 (`.start-chat-btn`, `button[ka*="greet"]` 等) 定位操作按钮。
* **对话框检测**：点击打招呼后，BOSS 可能会直接发送系统默认招呼，也可能弹出一个输入框。脚本会持续寻找 `textarea` 元素，如果找得到，就会渲染带有占位符的自定义模板（如将 `{name}` 替换为候选人名字），填入文本框并发送。
* **日志落盘**：无论成功还是失败，均会通知 `config.js` 记录操作数据（供 UI 端展示）。
