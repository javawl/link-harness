# @deepseek-ai/dsh-tool-browser

[English](README.md) | 中文

浏览器自动化能力的 Consumer：基于 `ctx.browser` 的面向模型 `browser` 工具。单一工具加 `action` 判别字段——浏览器是一个有状态表面，模型用一个动词集驱动它，而不是每个操作一个工具。

| 包 | 角色 | ctx 键 |
|---|---|---|
| `dsh-browser` | Service Definition | `ctx.browser` |
| `dsh-browser-playwright` | Service Provider：基于 Playwright 的持久 Chromium | 注册到 `ctx.browser` |
| `dsh-tool-browser`（本包） | Consumer：面向模型的 `browser` 工具 | `ctx.tools` |

## 工具

`browser(action, url?, selector?, value?, key?, files?, waitUntil?, timeoutMs?)` — 动作 `navigate`、`snapshot`、`click`、`fill`、`select`、`press`、`upload`、`screenshot`、`waitFor`、`closePage`。结果是服务定义的闭合联合：有界页面捕获（`page`）、`acked`、或 `screenshot` PNG base64。页面文本受 `maxOutputChars`（默认 60000）约束；单次调用超时（`timeoutMs`，默认 120000）是部署策略，经工具取消信号转发。没有 Provider 时工具保持可见，执行时返回结构化错误。

## 模型体验

### 系统提示词

#### 模型看到什么

browser 工具在注册时贡献以下指引。

##### Browser 工具指引

```markdown
Use the browser tool to drive one shared, persistent real-browser session (the active tab). Actions: navigate (absolute http(s) url), snapshot (url/title/text of the page or a selector), click/fill/select (CSS selector; fill and select need value), press (key like Enter), upload (selector + files), screenshot (PNG base64), waitFor (selector or url), closePage. The session persists cookies and logins across calls and runs; prefer it for sites that need JavaScript, logins, or form submission. Confirm outcomes with snapshot or waitFor after state-changing actions.
```

#### Token 影响

工具注册期间每次请求固定指引成本，加上每次调用返回的有界页面文本（`maxOutputChars`，默认 60000 字符）。

#### KV Cache 影响

工具 schema 与提示词分节稳定；跨调用无请求前缀抖动。

## 已知限制与遗留工作

- **不支持标签页寻址** — 工具只驱动会话的活动页；命名标签页随服务定义契约变更引入。
- **不检查 cookie/存储** — 有意为之：会话对模型不透明；登录态只通过页面快照观察。
