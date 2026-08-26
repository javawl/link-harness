# @deepseek-ai/dsh-backlinks-cloud-mail

[English](README.md) | 中文

外链邮箱服务定义的 Service Provider：cloud-mail Open API 客户端。创建验证邮箱（`/public/addUser`）并在调用方给定的有界等待内轮询收件（`/public/emailList`）；后端 AI 提取的 `code` 与正文首个 URL 呈现在 `VerificationMail` 上。

| 包 | 角色 | ctx 键 |
|---|---|---|
| `dsh-backlinks` | Service Definition | `ctx.backlinks` |
| `dsh-backlinks-cloud-mail`（本包） | Service Provider：cloud-mail 邮箱 | 注册到 `ctx.backlinks` |
| `dsh-tool-backlinks` | Consumer：面向模型的 `backlinks` 工具 | `ctx.tools` |

## 配置

| 字段 | 默认 | 用途 |
|---|---|---|
| `baseUrl` | （空） | Worker API 基址，如 `https://mail.example.org/api`；为空即提供方不可用 |
| `token` | `CLOUDMAIL_TOKEN` 环境变量 | Open-API 令牌（管理员生成） |
| `requestTimeoutMs` | `15000` | 单请求超时 |

## 模型体验

间接经由 `dsh-tool-backlinks`；本提供方不产出提示词或 schema。

#### KV Cache 影响

无直接失效；由上述 Consumer 负责请求前缀变化。

## 已知限制与遗留工作

- **仅轮询** — cloud-mail 无 webhook；`pollMail` 按调用方间隔轮询至截止。
- **无邮箱清理** — 创建的地址在 cloud-mail 中持久；生命周期清理属于后端职责。
