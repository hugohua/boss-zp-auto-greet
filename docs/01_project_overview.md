# 01. 项目概览与规范 (Project Overview)

## 1. 项目简介
BOSS直聘自动送简历/打招呼油猴脚本 (**boss-zhipin-auto-greet** v2.0.0)。
这是一个基于纯原生 JavaScript 开发，使用 Rollup 进行模块化打包的浏览器用户脚本 (UserScript)。主要用于在 BOSS 直聘的推荐候选人列表页面，自动化执行条件筛选、简历匹配和自动发送打招呼信息的任务。

当前仓库只保留 userscript 单链路，不包含独立的 Chrome 插件后台页、弹窗页或内容脚本实现。

## 2. 目录结构
```text
boss-zp-auto-greet/
├── package.json       # 项目依赖与构建脚本
├── rollup.config.mjs  # Rollup 构建配置
├── src/               # 源代码目录（核心逻辑）
│   ├── index.js             # 主入口模块
│   ├── config.js            # 配置与状态持久化管理
│   ├── utils.js             # 通用工具函数库
│   ├── filter.js            # 候选人条件筛选模块
│   ├── greeting.js          # 打招呼执行与模板排队模块
│   ├── anti-detect.js       # 风控规避与行为模拟模块
│   └── ui/                  # 界面视图模块
│       ├── panel.js         # 主控制台视图
│       ├── styles.js        # 样式定义与注入
│       ├── records.js       # 日志渲染模块
│       └── notification.js  # 浮窗消息提示
└── dist/              # 构建后的发布目录
    └── boss-zhipin.user.js  # 最终生成的单文件油猴脚本
```

## 3. 技术栈与开发规范
- **开发语言**：ES6+ JavaScript (无 TypeScript，保持轻量)。
- **模块化方案**：使用 ES Modules 组织代码，利用 Rollup 打包为一个符合 Tampermonkey 规范的大体量 IIFE 脚本。
- **UI 构建**：纯 DOM 操作，基于原生 `document.createElement` 等 API 构建控制面板。通过独立的 `styles.js` 统一管理 CSS，避免污染宿主（BOSS直聘）页面的样式。
- **状态持久化**：优先使用 `GM_setValue` / `GM_getValue` 保存配置和发送记录，当环境不支持时降级回退到 `localStorage` (`config.js`)。
- **运行形态**：仅通过 Tampermonkey 加载 `dist/boss-zhipin.user.js`，不存在第二套浏览器扩展通信链路。

## 4. 开发与构建流程
项目依赖 Node.js 环境。

### 4.1 安装依赖
```bash
npm install
```

### 4.2 开发模式（热更新）
```bash
npm run dev
```
此命令将启动 Rollup 监听模式，当 `src` 下的代码改动时，会自动重构输出至 `dist/boss-zhipin.user.js`。在 Tampermonkey 中，可通过 `@require file:///.../dist/boss-zhipin.user.js` 的方式引入本地文件实现快速热调试。

### 4.3 生产构建
```bash
npm run build
```
输出最终发布的整合脚本。

## 5. 核心工作链
启动脚本后，`index.js` 作为总指挥，依次执行：
1. **加载配置** (`config.js`)
2. **注入 UI 样式与面板** (`ui/styles.js`, `ui/panel.js`)
3. **前置部署风控拦截器** (`anti-detect.js`)，接管请求拦截。
4. **启动 DOM/接口双重监听**：包括等待页面候选人列表渲染完成（`filterByDOM`）以及拦截 BOSS 直聘的底部分页 XHR 接口（`filter.js`）。
5. **执行任务循环**：条件验证 -> 延迟模拟 -> 触发打招呼 (`greeting.js`) -> 更新统计面板。
