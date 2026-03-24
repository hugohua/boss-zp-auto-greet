# 05. 反检测与风控规避机制 (Anti-Detect)

由于自动打招呼插件极易被 BOSS 直聘的风控系统识别并封号，本项目在 `anti-detect.js` 中投入了大量防御性代码。**任何对 DOM 或者请求发起的修改，都必须遵循本模块建立的规矩**。

## 1. 静默行为模拟 (Behavior Simulation)
真正的用户不可能长时间保持页面静止然后瞬间点击 50 次打招呼按钮。
1. **后台呼吸**：只要页面未隐藏（`!document.hidden`），`performBackgroundBehavior` 就会每 10-20 秒随机执行一次无意义的短距离滚动（占40%概率）或者鼠标晃动（占30%概率）。
2. **操作前戏拟真**：在 `greeting.js` 准备点击由于前：
   * `simulateScrollToElement(el)`：会先随机滚动到该卡片附近，并且会在 `scrollPositions` 数组中记下轨迹。
   * `simulateMouseMoveToElement(el)`：会在点击按钮内部的一个随机 (x, y) 坐标处触发 `mousemove` 事件，模拟鼠标移入。
   * 以上全部伴随随机毫秒级的 `sleep()` 间隔。

## 2. APM 埋点数据清洗 (APM Interceptor)
BOSS 直聘本身使用 APM 系统收集用户在页面的点击轨迹并上报给服务器（`/wapi/zpApm/actionLog/`）。使用原生的 `.click()` 触发时，采集到的坐标通常为 0，这会直接暴露脚本特征。

`installApmInterceptor` 拦截了这些 POST 请求，解析 FormData 并对埋点参数（p1 到 p8）进行深度“整容”：
* **抹除明显特征**：把特定的采集标识码（如 `p2=52001`）归零。
* **伪造轨迹**：如果脚本发现将要上报的点击事件里没有 (x, y) 坐标，`cleanApmData` 会使用 `generateMouseTrack` 凭空捏造一段符合人类生理抖动特征的鼠标滑动轨迹序列填进去。
* **隐藏痕迹**：在页面点击我们自建的 UI 面板（如 `#boss-helper-panel`）时，BOSS 的埋点也会记录。代码会将其元素的 XPath/类名 (参数 `p8`) 强行清空，防止官方得知客户端装了叫 "boss-helper" 的东西。

## 3. 安全环境检查与熔断 (Circuit Breaker)
在每一个动作发生前，都会调用 `safetyCheck()` 进行大环境扫描：
* **各类弹窗检测**：检测页面是否弹出了通过Shadow DOM隔离的VIP充值弹窗 (`checkVipLimit`)，或者防爬虫的滑动验证码弹窗 (`checkCaptcha`)。
* **时段检测**：根据用户配置检查是否处于允许的工作时间（如 09:00 - 18:00）。
* **自动熔断**：一旦连续 3 次操作失败或被弹窗打断，全局变量 `circuitBroken` 设为 `true`，**直接死锁整个打招呼循环，不再发起任何请求**，直到用户手工在页面点击“重置熔断”。
