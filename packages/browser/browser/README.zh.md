# @deepseek-ai/dsh-browser

[English](README.md) | 中文

浏览器自动化能力服务定义（`ctx.browser`）：Provider 注册表、惰性单会话生命周期、按标签页引用寻址且页内保序的闭合判别联合命令分发，以及 `BrowserError` 错误分类。

| 包 | 角色 | ctx 键 |
|---|---|---|
| `dsh-browser`（本包） | Service Definition：服务定义、命令/结果词汇、错误分类 | `ctx.browser` |
| `dsh-browser-playwright` | Service Provider：基于 Playwright 的持久 Chromium | 注册到 `ctx.browser` |
| `dsh-tool-browser` | Consumer：面向模型的 `browser` 工具 | `ctx.tools` |

## 服务 API（ctx.browser）

| 成员 | 用途 |
|---|---|
| `registerProvider(provider)` | 注册浏览器 Provider；重复 id 抛 `BROWSER_DUPLICATE_PROVIDER`；返回随 fiber 销毁的清理器 |
| `act(command, signal?)` | 在共享会话（惰性打开）上分发一条闭合联合命令；同页命令保序，不同页可并行 |
| `closeSession()` | 关闭共享浏览器；下一次 `act()` 打开新会话 |

`BrowserCommand`（`navigate`/`newPage`/`snapshot`/`click`/`fill`/`select`/`press`/`upload`/`screenshot`/`waitFor`/`closePage`/`bringToFront`）与 `BrowserResult`（`page`/`acked`/`screenshot`）是本包持有的闭合联合。Provider 泄漏的裸失败会丢弃会话（`BROWSER_ACTION_FAILED`），下一条命令重新启动浏览器而不是复用未知状态。

## 选择

| 情形 | 执行 |
|---|---|
| 配置的 id 已注册且 `available()` | 运行该 Provider |
| 配置的 id 未注册 | `BROWSER_PROVIDER_CONFIGURED_MISSING` |
| 配置的 id 已注册但不可用 | `BROWSER_PROVIDER_CONFIGURED_UNAVAILABLE` |
| 未配置 id，恰好一个可用 Provider | 运行它 |
| 未配置 id，无可用 Provider | `BROWSER_PROVIDER_UNAVAILABLE` |
| 未配置 id，多个可用 Provider | `BROWSER_PROVIDER_AMBIGUOUS` |

`$DSH_BROWSER_PROVIDER` 等价于 `provider` 配置字段。

`BROWSER_ACTION_UNCERTAIN` 表示等待中断后输入仍可能完成。它保留会话并要求人工核验；绝不能视为已回滚或自动重新提交。[Playwright 提供方](../browser-playwright/README.zh.md)会锁定受影响页面并保留在途输入。

Provider 可用 `BROWSER_PAGE_LIMIT` 拒绝创建新页。该资源错误保留共享会话与已有页面；调用方可以关闭已完成页面后重试，无需重新启动浏览器。

`newPage` 通过 `BrowserNewPageCommand` 预留命名空白页。`BrowserSnapshotCommand.format` 支持 text、aria、form 和 links，均接受同一套定位器。`BrowserFillCommand` 接受单个 selector/value 或有序 `BrowserFillField[]`；空字符串用于清空，值原样保留，后续失败不回滚先前字段。

提供方仅在浏览器上下文确已关闭时报告 `BROWSER_SESSION_CLOSED`，服务在下次调用时重新启动。页面关闭引起的 `BROWSER_ACTION_FAILED` 会保留其他标签页；错误消息文字不决定是否释放整个会话。

## 模型体验

间接经由 `dsh-tool-browser`：由它返回有界页面捕获、确认与截图结果，以及精确的 Provider 选择失败；本注册表自身不产出提示词或 schema。

#### KV Cache 影响

无直接失效；由上述 Consumer 负责请求前缀变化。

## 已知限制与遗留工作

- **单会话多可寻址标签页** — 每条命令可带 `page` 引用；navigate 以调用者命名的引用绑定标签页，后续命令按引用寻址，并行调用方各驭其页（cookie 共享）。不带引用的命令保持『最近标签页』旧契约；第二个并行会话仍不在范围内。
- **无观察面** — 没有页面生命周期事件，也没有会话状态查询；调用方按命令观察结果。
- **取消不保证回滚** — 提供方在分发前检查 `AbortSignal`；在途操作可能完成，也可能报告结果未知。调用方须遵循提供方的恢复指引。
