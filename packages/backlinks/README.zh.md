# backlinks/ — 外链能力族

[English](README.md) | 中文

外链服务定义与其 Provider/Consumer 适配器。`backlinks` 包承担 Service Definition 角色：抽象服务（`ctx.backlinks`）、两个提供方注册表（批次工作源与邮箱）、闭合联合的条目结果词汇，以及 `BacklinksError` 错误分类。`backlinks-supermanager` 与 `backlinks-cloud-mail` 是 Service Provider。`tool-backlinks` 是 Consumer：面向模型的 `backlinks` 工具。全部为**产品**包。

| 包 | 角色 | ctx 键 |
|---|---|---|
| [`backlinks/`](backlinks/README.zh.md) | 外链服务与条目结果词汇 | `ctx.backlinks` |
| [`backlinks-supermanager/`](backlinks-supermanager/README.zh.md) | 批次工作源提供方（supermanager `/api/agent/*`） | 注册到 `ctx.backlinks` |
| [`backlinks-cloud-mail/`](backlinks-cloud-mail/README.zh.md) | 邮箱提供方（cloud-mail Open API） | 注册到 `ctx.backlinks` |
| [`tool-backlinks/`](tool-backlinks/README.zh.md) | 面向模型的 `backlinks` 工具 | `ctx.tools` |

面向模型的名称、schema 与提示词指引只存在于 `tool-backlinks`；更换任一后端都不会改变模型驱动批次发布工作流的方式。
