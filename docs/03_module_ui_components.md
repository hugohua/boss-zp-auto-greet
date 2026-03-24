# 03. UI 与前端交互模块 (UI Components)

为了让油猴脚本在 BOSS 直聘页面中有一个可视化的操作台面板，本项目在 `src/ui/` 目录下构建了一套纯原生（Vanilla JS）的前端 UI 方案。

## 1. 核心设计原则
* **零依赖**：没有引入 React/Vue 等框架，全部使用原生 `document.createElement` 配合模板字符串。
* **样式隔离**：所有的 CSS 类名均带有 `bh-` 前缀（如 `bh-btn`, `bh-card`），防止被宿主页面的样式污染，也避免破坏原网页排版。

## 2. 模块分工
* **`ui/panel.js`**: 控制台的核心视图构建与事件绑定中心。
* **`ui/styles.js`**: 包含了一大串 CSS 字符串，负责在初始化时插入 `document.head`。
* **`ui/records.js`**: 弹出的历史打招呼日志查看模态框 (`Modal`)。
* **`ui/notification.js`**: 右上角的临时悬浮提示通知（Toast）。

## 3. 面板结构解析 (`panel.js`)
面板分为几个核心区块：
1. **状态大盘 (`bh-status-banner` + `bh-dashboard`)**：展示系统就绪/运行中/已熔断状态，以及今日触达量、本时段触达量等 KPI 数据。
2. **操作区 (`bh-action-group`)**：提供“重新扫描”、“启动自动分发”、“停止运行” 三大按钮。状态受 `isGreetingRunning()` 控制。
3. **设置折叠区 (`bh-settings-body`)**：双向绑定 `config.js`。修改操作间隔、最高限额、是否开启风控等输入框，会实时通过 `updateConfig()` 同步写入持久化存储。
4. **话术库 (`bh-greetings-body`)**：渲染 `greetingTemplates`。支持增加、删除，且支持“一键复制当前话术”功能。
5. **日志终端 (`bh-terminal`)**：暴露给开发者的黑盒。订阅 `utils.js` 中的 `onLogChange`，将运行时的动作和异常打印出来，且附有复制日志按钮方便提 Bug。

## 4. UI 数据响应式
这里的“响应式”非常简陋但有效。当底层逻辑（如新发现了几个 C9 学生）发生变化时：
1. 底层调用 `filter.js` -> 触发回调 `onCandidatesUpdated`。
2. `index.js` 收到通知，立刻调用 `panel.js` 的 **`refreshStats()`**。
3. `refreshStats` 函数会去强刷 DOM 上的 `.bh-card-value` 文本。

> ⚠️ 注意：如果后续需要添加新的指标展示，只需在 `panel.js` 的 `refreshStats` 函数中增加对应的 DOM 查询赋值逻辑即可。
