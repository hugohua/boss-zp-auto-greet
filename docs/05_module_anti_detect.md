# 05. 反检测与风控规避机制 (Anti-Detect)

由于自动打招呼插件极易被 BOSS 直聘的风控系统识别并封号，本项目在 `anti-detect.js` 中投入了大量防御性代码。**任何对 DOM 或者请求发起的修改，都必须遵循本模块建立的规矩**。

## 1. 静默行为模拟 (Behavior Simulation)
真正的用户不可能长时间保持页面静止然后瞬间点击 50 次打招呼按钮。
1. **后台呼吸**：只要页面未隐藏（`!document.hidden`），`performBackgroundBehavior` 就会每 10-20 秒随机执行一次无意义的短距离滚动（占40%概率）或者鼠标晃动（占30%概率）。
2. **操作前戏拟真**：在 `greeting.js` 准备点击由于前：
   * `simulateScrollToElement(el)`：会先随机滚动到该卡片附近，并且会在 `scrollPositions` 数组中记下轨迹。
   * `simulateMouseMoveToElement(el)`：会在点击按钮内部的一个随机 (x, y) 坐标处触发 `mousemove` 事件，模拟鼠标移入。
   * 以上全部伴随随机毫秒级的 `sleep()` 间隔。

## 2. APM 埋点与行为日志清洗 (Log Interceptor)
BOSS 直聘本身使用多套监控系统收集用户在页面的点击轨迹并上报给服务器。使用原生的 `.click()` 触发时，采集到的坐标通常为 0 或负数，这会直接暴露脚本特征。

`installApmInterceptor` 拦截了相关 POST 请求（包括 `/wapi/zpApm/actionLog/` 和 `/wapi/zpCommon/actionLog/` 两条路径），并通过 `cleanApmData` 进行双重 Payload 格式兼容（兼容 `content=` 的批量 JSON 数组格式，以及 `ba=` 的单点事件对象格式），对埋点参数（p1 到 p8）进行深度“整容”：
* **抹除明显特征**：把特定的采集标识码（如 `p2=52001`）强制归零。
* **伪造轨迹与坐标**：如果脚本发现将要上报的点击事件里存在负坐标或没有 (x, y) 坐标，会根据元素自身尺寸生成合理的随机内部坐标，并使用 `generateMouseTrack` 凭空捏造一段符合人类生理抖动特征的鼠标滑动轨迹序列填进去。
* **安全规避时间戳误杀**：在进行坐标修正时，系统严格校验 `p4` 字段的数据特征（只处理带逗号和负号的坐标串），以此完美避开 `zpCommon/actionLog/` 中部分合法业务请求利用 `p4` 传递纯数字时间戳（如 `1774358616700`）的场景。
* **隐藏 UI 痕迹**：在页面点击我们自建的 UI 面板（如 `#boss-helper-panel` 或 `.bh-target-985`）时，BOSS 的埋点会自动上报。代码会将其元素的 XPath/类名 (参数 `p8`) 强行清空，防止官方得知客户端注入了名为 "boss-helper" 或 "bh-" 的内容。

## 3. 安全环境检查与熔断 (Circuit Breaker)
在每一个动作发生前，都会调用 `safetyCheck()` 进行大环境扫描：
* **各类弹窗检测**：检测页面是否弹出了通过Shadow DOM隔离的VIP充值弹窗 (`checkVipLimit`)，或者防爬虫的滑动验证码弹窗 (`checkCaptcha`)。
* **时段检测**：根据用户配置检查是否处于允许的工作时间（如 09:00 - 18:00）。
* **自动熔断**：一旦连续 3 次操作失败或被弹窗打断，全局变量 `circuitBroken` 设为 `true`，**直接死锁整个打招呼循环，不再发起任何请求**，直到用户手工在页面点击“重置熔断”。
