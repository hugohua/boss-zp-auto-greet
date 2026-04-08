# 07. 调试与排错指南 (Development & Debugging)

本指南为了帮助在后续开发、维护和提需求给 LLM 时，能有一套标准的动作流和排错路径。

## 1. 热更新与开发流
### 方案 A（推荐，一键自动化）
1. 在本地克隆代码后，执行 `npm run tm:dev`。
2. 该命令会自动生成 `dist/tampermonkey-dev-loader.user.js`，并启动 Rollup watch。
3. 在 Tampermonkey 的“实用工具”中导入 `tampermonkey-dev-loader.user.js`（只需一次）。
4. 之后你只需要改代码并刷新 BOSS 页面，不需要再手动复制脚本。

### 方案 B（手动桥接）
1. 执行 `npm run dev`。Rollup 会监视 `src/` 下所有文件的变化。
2. 在 Tampermonkey 中新建一个本地脚本，引向你机器上的 `dist` 文件：
   ```javascript
   // ==UserScript==
   // @name         BOSS本地开发直连
   // @namespace    ...
   // @require      file:///D:/github/boss/dist/boss-zhipin.user.js
   // ==/UserScript==
   ```
3. 随后在 IDE (如 VSCode) 中编写代码，保存后刷新 BOSS 直聘页面即可看到最新效果。

> ⚠️ 注意：需在 Chrome 扩展管理界面为 Tampermonkey 勾选“允许扩展程序访问文件网址(Allow access to file URLs)”。

补充说明：当前项目只有 userscript 这一条运行链路，没有独立的 Chrome 插件内容脚本或后台页。

## 2. 常见故障点：前端 DOM 结构变化
由于自动化脚本含有大量的 DOM 查询代码，BOSS 官方一旦调整了网页的 CSS 类名（由于前端混淆等原因），脚本将部分瘫痪。

**排查与恢复口诀**：
1. **找不到打招呼按钮了？** 
   * 检查 `greeting.js` 的 `findGreetButton` 中的选择器数组。
   * 右键检查浏览器的打招呼按钮，提取其最显著、非随机长尾的类名或属性（如 `ka="...greet..."`），添加到 `btnSelectors` 中。
2. **打招呼不能发送弹出的文本框了？**
   * 检查 `greeting.js` 中的 `trySendGreetingMessage` 函数里的 `inputSelectors`。更新匹配文本框的定位器。
3. **DOM 抓取失效导致漏人？**
   * 关注 `filter.js` 中的 `filterByDOM` 里的 `cardSelectors` 和 `schoolSelectors` 数组并按需补全。

## 3. 面向 LLM 的提词策略汇总
当您想要把本代码库喂给 LLM 并令其生成新功能时，请遵照以下规则附带上下文：

* **改界面或新增统计指标** -> 发送 `03_module_ui_components.md` + `src/ui/panel.js`
* **新增筛选条件（如过滤掉外包公司）** -> 发送 `04_module_core_business.md` + `src/filter.js`
* **需要持久化保存新的用户设定项** -> 发送 `src/config.js` 和 `02_architecture_design.md`，告诉它只要增加 `DEFAULTS` 的键即可自动完成响应式。
* **增加更复杂的模拟点击（如点进详情页再退出来）** -> 发送 `05_module_anti_detect.md`，**严正警告其必须使用** `sleep`, `randomInt`, 和专门用来抹除特征的底层方法，禁止调用纯原生的 `.click()` 以身试法。

通过遵循这样的标准，LLM 提供的 PR 将极低概率出错，且天然保持项目原生的代码整洁度与防封号安全性。

## 4. 发布到内网并开启自动更新
如果希望同事安装一次后能收到脚本更新提示，可在项目根目录创建 `.env`（该文件默认不会提交 Git），填写：

```dotenv
TM_UPDATE_URL=https://your-intranet/userscript/boss-zhipin.meta.js
TM_DOWNLOAD_URL=https://your-intranet/userscript/boss-zhipin.user.js
```

然后执行 `npm run build`。Rollup 会在构建输出的 userscript 元数据中自动注入 `@updateURL` 与 `@downloadURL`。

建议：
1. `TM_UPDATE_URL` 返回轻量 meta 文件（通常只含脚本头部元信息）；
2. `TM_DOWNLOAD_URL` 指向完整 `.user.js` 文件；
3. 发版时只需递增 `package.json` 的 `version`（例如 `npm version patch`）；构建时会自动把该版本写入 userscript 的 `@version`。

推荐发布命令：`npm version patch && npm run build`。

## 5. 同步构建产物到 YApi 高级 Mock
若 YApi 已私有化并开启了 `plugin/advmock/case/save` 接口，可使用：

```bash
npm run build
npm run sync
```

`scripts/sync.mjs` 会读取 `.env` 中的 `YAPI_*` 配置，将 `dist/boss-zhipin.user.js` 作为 `res_body` 同步到指定 Mock Case，并显式写入 `res_body_type=raw`，避免 `@name` 等内容被 Mock 模板引擎替换。

调试时可执行：

```bash
npm run sync -- --dry-run
```

该模式只打印请求载荷，不会真正发起写入。

