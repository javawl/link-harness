# Agent Note：浏览器能力 seam — 一个会话、一个动词集

状态：已实现

[English](2026-08-25-browser-capability-seam.md) | 中文

## 问题

外链发布工作流需要通过真实浏览器驱动已登录、重 JavaScript 的站点，并依赖持久 profile——cookie 会话与人工解决过的挑战必须跨 harness 运行存活。harness 目前没有浏览器表面，而 `ctx.web` 不是合适的挂载点：它自己的 Agent Note 已把「提供方支持的页面交互」排除在 `fetch` 之外，且有状态的浏览器进程（一个会话、一个活动页、串行操作）与请求/响应式抓取是完全不同的运行形态。若不做 seam，第一个消费方就要在工具里内联处理启动、会话生命周期、串行化、取消与错误词汇。

两个契约问题必须先行决定：模型如何寻址一个有状态表面（每个操作一个工具会产生十个各自漂移的 schema），以及谁拥有会话（工具调用是短命的，profile 不能是）。
- 状态：已实现（active）
- 包：`packages/browser/browser`（Service Definition）、`packages/browser/browser-playwright`（Service Provider）、`packages/browser/tool-browser`（Consumer）
- 子系统参考：[docs/subsystems/browser.zh.md](../../../../docs/subsystems/browser.zh.md)

## 决策

浏览器自动化是独立的能力 seam，而不是对 `ctx.web` 的加宽。web 的 Agent Note 早已把「提供方支持的页面交互」列为独立表面（`web_extract` 兄弟能力，而非 fetch 的一个分支）；驱动一个已登录、重 JavaScript 的站点则更进一步——它需要的是有状态的浏览器进程，而非请求/响应。本 seam 完全沿用 web 三件套的形态：执行期选择的提供方注册表、继承 `HarnessError` 的服务错误分类、面向模型的名称与 schema 只存在于 Consumer。

与 web 不同的两个契约选择定义了这个 seam：

1. **一条命令分发，而不是每个操作一个方法。** 浏览器是单一有状态表面：每个操作都落在同一会话的活动页上，且必须观察到前一操作的稳定状态。因此 Service Definition 只暴露一个 `act(command)`，参数是闭合的 `BrowserCommand` 联合（`navigate`/`snapshot`/`click`/`fill`/`select`/`press`/`upload`/`screenshot`/`waitFor`/`closePage`），返回闭合的 `BrowserResult` 联合（`page`/`acked`/`screenshot`）。Consumer 把同一集合镜像为单个 `browser` 工具的 `action` 字段——一个共享浏览器上的十个页面驱动动词，而不是十个 schema 会各自漂移的工具。

2. **由 Service Definition 持有的单一共享惰性会话。** 会话在第一条命令时打开，存活到 `closeSession()` 或上下文销毁；命令在 Service Definition 内部经 promise 链串行化。这正是持久浏览器 profile 得以跨工具调用、跨运行存活的基础：Playwright 提供方在可配置的 `userDataDir` 上启动 `chromium.launchPersistentContext`，默认有头并使用真实 Chrome 渠道。该 profile 里的 cookie 登录态与人工解决过的 CAPTCHA，是消费本 seam 的外链发布工作流的运行基础。

## 失败纪律

提供方泄漏裸失败（非 `BrowserError`）即失去会话：Service Definition 丢弃它，下一条命令重新启动浏览器而不是复用未知状态。启动失败包装为 `BROWSER_LAUNCH_FAILED`；命令失败包装为 `BROWSER_ACTION_FAILED`；取消在分发前检查（`BROWSER_ABORTED`）。会话打开之后提供方注销不影响该会话——选择只发生在打开时，SD 测试明确固定了这一语义。

## 遗留工作

- 命名标签页寻址（命令始终驱动最近打开的页）；并行会话。
- 整页截图；文本捕获之外的 DOM 级结构化快照（`page` 结果只携带 url/title/text）。
- 观察面（页面生命周期事件）——有意缺席，与 web seam 放弃观察面的立场一致。
- 真实浏览器 e2e 通道：当前测试通过 mock 的 `playwright-core` 覆盖提供方；无钥匙的真 Chrome 冒烟（未安装 Chrome 时自跳过）与外链工作流的快照测试一并列于后续。

## 后果

- `BrowserCommand` 与 `BrowserResult` 是 `dsh-browser` 持有的闭合联合；提供方与消费方 `switch` 到穷尽，新增 kind 或 outcome 是跨三包的编译期强制变更。
- Service Definition 持有唯一的共享惰性会话并串行化每条命令；消费方无法打开并行会话，提供方泄漏裸失败即失去会话（下一条命令重新启动而不是复用未知状态）。
- Playwright 提供方的持久上下文让浏览器状态（登录、已解决的挑战）跨运行持久；这一持久性从此成为其他能力可以依赖的运行属性。
- 面向模型的动词只存在于 `dsh-tool-browser`，更换提供方不会改变模型驱动页面的方式。

## 考虑过的替代方案

- **给 `ctx.web` 加一个 `browser` fetch 分支** —— 否决：`web` 的请求/响应词汇无法诚实承载有状态会话，且 web seam note 已把提供方页面交互推迟到兄弟能力。
- **服务上每个操作一个方法** —— 否决：为单一有状态表面复制十份并行的选择/串行化/错误所有权；闭合联合上的单一分发保持唯一所有权，并把新 kind 编译进每个消费方。
- **每个操作一个面向模型的工具** —— 否决，改为带 `action` 字段的单一 `browser` 工具：浏览器是一套页面驱动动词，单一 schema 避免逐工具的目录抖动。
- **每次工具调用一个会话** —— 否决：逐调用启动摧毁工作流依赖的持久 profile 属性，并成倍增加启动成本。
