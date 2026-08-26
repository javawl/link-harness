# browser/ — 浏览器自动化能力族

[English](README.md) | 中文

浏览器服务定义与其 Provider/Consumer 适配器。`browser` 包承担 Service Definition 角色：抽象服务（`ctx.browser`）、闭合判别联合的命令/结果词汇，以及 `BrowserError` 错误分类。`browser-playwright` 是基于持久 Chromium profile 的 Service Provider。`tool-browser` 是 Consumer：面向模型的 `browser` 工具。全部为**产品**包。

| 包 | 角色 | ctx 键 |
|---|---|---|
| [`browser/`](browser/README.zh.md) | 浏览器自动化服务与命令/结果词汇 | `ctx.browser` |
| [`browser-playwright/`](browser-playwright/README.zh.md) | Playwright Provider（持久 Chromium profile） | 注册到 `ctx.browser` |
| [`tool-browser/`](tool-browser/README.zh.md) | 面向模型的 `browser` 工具 | `ctx.tools` |

服务定义维持一个共享的惰性会话：第一条命令打开 Provider 的浏览器，之后的每条命令（串行执行）驱动其活动页，直到 `closeSession()` 或上下文销毁。面向模型的名称、schema 与提示词指引只存在于 `tool-browser`；更换 Provider 不会改变模型驱动页面的方式。
