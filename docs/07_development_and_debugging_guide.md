# 07. 调试与排错指南 (Development & Debugging)

本指南为了帮助在后续开发、维护和提需求给 LLM 时，能有一套标准的动作流和排错路径。

## 1. 热更新与开发流
1. 在本地克隆代码后，执行 `npm run dev`。Rollup 会监视 `src/` 下所有文件的变化。
2. 在 Tampermonkey 中新建一个本地脚本，引向你机器上的 `dist` 文件：
   ```javascript
   // ==UserScript==
   // @name         BOSS本地开发直连
   // @namespace    ...
   // @require      file:///D:/github/boss/dist/boss-zhipin.user.js
   // ==/UserScript==
   ```
   > ⚠️ 注意：需在 Chrome 扩展管理界面为 Tampermonkey 勾选“允许扩展程序访问文件网址(Allow access to file URLs)”。
3. 随后在 IDE (如 VSCode) 中编写代码，保存后刷新 BOSS 直聘页面即可看到最新效果。

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
