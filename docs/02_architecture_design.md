# 02. 核心架构与数据流 (Architecture Design)

## 1. 整体架构
本脚本采用“事件驱动 + 数据响应式（轻量级）”的模块化架构。通过 `index.js` 串起各自独立的业务模块，每个模块各司其职。核心分为四大层：
1. **配置与存储层** (`config.js`)：基础数据支撑。
2. **拦截与感知层** (`filter.js`, `anti-detect.js`)：通过 DOM 轮询和 XHR 拦截获取页面最新动态。
3. **执行与调度层** (`greeting.js`)：真正触发展示、发送打招呼动作的排队调度中心。
4. **展现层** (`ui/`): 向用户展示运行状态并提供直接干预（停止/修改配置）的入口。

## 2. 模块依赖与初始化链路
入口 `index.js` 定义了严格的初始化顺序（`initialize` 函数）：

```text
页面加载完毕 (DOMContentLoaded)
      ↓
读取持久化配置 (config.js)
      ↓
注入 CSS 与 生成控制面板 UI (ui/styles.js, ui/panel.js)
      ↓
注册所有 Hook API 与防御机制 (anti-detect.js -> installApmInterceptor)
      ↓
注册数据接口拦截器 (filter.js -> installApiInterceptor) 【核心数据源】
      ↓
绑定事件（候选人更新时 -> 刷新 UI 统计面板）
      ↓
启动后台静默行为模拟（保持页面活跃，防风控防掉线）
      ↓
首次执行页面现有候选人的 DOM 筛选提取 (setTimeout -> filterByDOM)
```

## 3. 页面数据获取与过滤的数据流
脚本并不完全依赖模拟人工去一点点看数据，而是通过“双管齐下”的策略收集目标候选人：

### 3.1 拦截 XHR/Fetch 数据（最优解）
通过劫持底层的 API 请求，脚本在数据还没渲染到页面之前就已经拿到完整的 JSON 候选人列表。
* 数据流向：`API 响应` -> `installApiInterceptor 拦截` -> `解析 JSON 提取符合要求的候选人` -> `将候选人加入处理队列` -> `触发 UI 更新`。

### 3.2 轮询 DOM 数据（备选/补充解）
主要针对初次页面加载（此时未触发 API）。
* 数据流向：`遍历 .candidate-list` -> `解析每个卡片的姓名、学校、薪资等` -> `提取匹配者加入队列` -> `等待下一次翻页`。

## 4. 状态与配置管理
项目内的所有全局“开关”和“记忆”都由 `config.js` 掌管。
* 内存变量：`currentConfig` 用于运行时的高频读取。
* 持久化：通过封装的 `gmSet`/`gmGet` (底层调用 `GM_getValue`) 实现夸刷新页面的配置保存（如单日发送上限记录 `DAILY_COUNT_KEY`、招呼记录 `RECORDS_KEY` 等）。
* 其他模块通过 `getConfig()` 获取当前策略，通过 `updateConfig(partial)` 修改并被动落盘。

## 5. 跨模块通信与事件调度
此项目没有引入冗重的 EventBus 或 Redux，而是通过**回调 (Callbacks)** 和**暴露 Setter** 来实现轻量化通信：
* 例如 `filter.js` 暴露了 `setOnCandidatesUpdated(callback)`。当底层的 XHR 拦截发现新目标并过滤完成后，会调用该 callback。
* 在 `index.js` 中将这个 callback 绑定到 `ui/panel.js` 的 `refreshStats()` 上，从而实现：**数据更新 -> 视图刷新**的一致性联动。
