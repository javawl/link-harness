# @deepseek-ai/dsh-browser

[English](README.md) | 中文

浏览器自动化能力服务定义（`ctx.browser`）：Provider 注册表、惰性单会话生命周期、串行化的闭合判别联合命令分发，以及 `BrowserError` 错误分类。

| 包 | 角色 | ctx 键 |
|---|---|---|
| `dsh-browser`（本包） | Service Definition：服务定义、命令/结果词汇、错误分类 | `ctx.browser` |
| `dsh-browser-playwright` | Service Provider：基于 Playwright 的持久 Chromium | 注册到 `ctx.browser` |
| `dsh-tool-browser` | Consumer：面向模型的 `browser` 工具 | `ctx.tools` |

## 服务 API（ctx.browser）

| 成员 | 用途 |
|---|---|
| `registerProvider(provider)` | 注册浏览器 Provider；重复 id 抛 `BROWSER_DUPLICATE_PROVIDER`；返回随 fiber 销毁的清理器 |
| `act(command, signal?)` | 在共享会话（惰性打开）上分发一条闭合联合命令；命令串行执行 |
| `closeSession()` | 关闭共享浏览器；下一次 `act()` 打开新会话 |

`BrowserCommand`（`navigate`/`snapshot`/`click`/`fill`/`select`/`press`/`upload`/`screenshot`/`waitFor`/`closePage`）与 `BrowserResult`（`page`/`acked`/`screenshot`）是本包持有的闭合联合。Provider 泄漏的裸失败会丢弃会话（`BROWSER_ACTION_FAILED`），下一条命令重新启动浏览器而不是复用未知状态。

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

## 模型体验

间接经由 `dsh-tool-browser`：由它返回有界页面捕获、确认与截图结果，以及精确的 Provider 选择失败；本注册表自身不产出提示词或 schema。

#### KV Cache 影响

无直接失效；由上述 Consumer 负责请求前缀变化。

## 已知限制与遗留工作

- **单会话单活动页** — 服务定义将全部命令串行到唯一共享会话及其最近打开的页；命名标签页寻址与并行会话推迟到有工作流需要时再做。
- **无观察面** — 没有页面生命周期事件，也没有会话状态查询；调用方按命令观察结果。
- **信号检查是协作式的** — `AbortSignal` 在分发前检查；进行中的 Playwright 操作按自身超时完成。
