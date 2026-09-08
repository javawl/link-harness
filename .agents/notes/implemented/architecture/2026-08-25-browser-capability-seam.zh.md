# Agent Note：浏览器能力 seam — 持久状态、一个动词集

状态：已实现

[English](2026-08-25-browser-capability-seam.md) | 中文

## 问题

外链发布工作流需要通过真实浏览器驱动已登录、重 JavaScript 的站点，并依赖持久 profile——cookie 会话与人工解决过的挑战必须跨 harness 运行存活。harness 目前没有浏览器表面，而 `ctx.web` 不是合适的挂载点：它自己的 Agent Note 已把「提供方支持的页面交互」排除在 `fetch` 之外，且有状态的浏览器进程（一个会话、一个活动页、串行操作）与请求/响应式抓取是完全不同的运行形态。若不做 seam，第一个消费方就要在工具里内联处理启动、会话生命周期、串行化、取消与错误词汇。

两个契约问题必须先行决定：模型如何寻址一个有状态表面（每个操作一个工具会产生十个各自漂移的 schema），以及谁拥有会话（工具调用是短命的，profile 不能是）。
- 状态：已实现（active）
- 包：`packages/browser/browser`（Service Definition）、`packages/browser/browser-playwright`（Service Provider）、`packages/browser/tool-browser`（Consumer）
- 子系统参考：[docs/subsystems/browser.zh.md](../../../../docs/subsystems/browser.zh.md)

## 决策

命名浏览器选择与独立会话生命周期由[隔离发布决策](../feature/2026-09-07-isolated-browser-publication.zh.md)负责；本说明保留能力划分与单 profile 顺序的理由。

浏览器自动化是独立的能力 seam，而不是对 `ctx.web` 的加宽。web 的 Agent Note 早已把「提供方支持的页面交互」列为独立表面（`web_extract` 兄弟能力，而非 fetch 的一个分支）；驱动一个已登录、重 JavaScript 的站点则更进一步——它需要的是有状态的浏览器进程，而非请求/响应。本 seam 完全沿用 web 三件套的形态：执行期选择的提供方注册表、继承 `HarnessError` 的服务错误分类、面向模型的名称与 schema 只存在于 Consumer。

与 web 不同的两个契约选择定义了这个 seam：

1. **一条命令分发，而不是每个操作一个方法。** 浏览器是单一有状态表面：每个操作都落在同一会话的活动页上，且必须观察到前一操作的稳定状态。因此 Service Definition 只暴露一个 `act(command)`，参数是闭合的 `BrowserCommand` 联合（`navigate`/`snapshot`/`click`/`fill`/`select`/`press`/`upload`/`screenshot`/`waitFor`/`closePage`），返回闭合的 `BrowserResult` 联合（`page`/`acked`/`screenshot`）。Consumer 把同一集合镜像为单个 `browser` 工具的 `action` 字段——一个共享浏览器上的十个页面驱动动词，而不是十个 schema 会各自漂移的工具。

2. **由 Service Definition 持有惰性会话。** 每个已注册浏览器在第一条命令时打开，保留至显式关闭或释放。[隔离发布决策](../feature/2026-09-07-isolated-browser-publication.zh.md)负责命名会话路由，提供方负责同页命令顺序。持久 profile 让登录状态跨调用保留，无需每次操作都启动浏览器。

## 失败纪律

提供方泄漏裸失败（非 `BrowserError`）即失去会话：Service Definition 丢弃它，下一条命令重新启动浏览器而不是复用未知状态。启动失败包装为 `BROWSER_LAUNCH_FAILED`；命令失败包装为 `BROWSER_ACTION_FAILED`；取消在分发前检查（`BROWSER_ABORTED`）。 提供方注销后关闭其会话，其他浏览器仍可操作。

## 遗留工作


- 整页截图；文本捕获之外的 DOM 级结构化快照（`page` 结果只携带 url/title/text）。
- 观察面（页面生命周期事件）——有意缺席，与 web seam 放弃观察面的立场一致。

## 后果

- `BrowserCommand` 与 `BrowserResult` 是 `dsh-browser` 持有的闭合联合；提供方与消费方 `switch` 到穷尽，新增 kind 或 outcome 是跨三包的编译期强制变更。
- Service Definition 负责会话生命周期；提供方裸失败仅丢弃对应浏览器会话，同页执行顺序由提供方负责。
- Playwright 提供方的持久上下文让浏览器状态（登录、已解决的挑战）跨运行持久；这一持久性从此成为其他能力可以依赖的运行属性。
- 面向模型的动词只存在于 `dsh-tool-browser`，更换提供方不会改变模型驱动页面的方式。

## 考虑过的替代方案

- **给 `ctx.web` 加一个 `browser` fetch 分支** —— 否决：`web` 的请求/响应词汇无法诚实承载有状态会话，且 web seam note 已把提供方页面交互推迟到兄弟能力。
- **服务上每个操作一个方法** —— 否决：为单一有状态表面复制十份并行的选择/串行化/错误所有权；闭合联合上的单一分发保持唯一所有权，并把新 kind 编译进每个消费方。
- **每个操作一个面向模型的工具** —— 否决，改为带 `action` 字段的单一 `browser` 工具：浏览器是一套页面驱动动词，单一 schema 避免逐工具的目录抖动。
- **每次工具调用一个会话** —— 否决：逐调用启动摧毁工作流依赖的持久 profile 属性，并成倍增加启动成本。
