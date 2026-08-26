# @deepseek-ai/dsh-tool-backlinks

[English](README.md) | 中文

外链能力服务定义的 Consumer：基于 `ctx.backlinks` 的面向模型 `backlinks` 工具。单一工具加 `action` 判别字段——批次发布工作流是一套连贯动词，与 browser 工具的单表面形态一致。

| 包 | 角色 | ctx 键 |
|---|---|---|
| `dsh-backlinks` | Service Definition | `ctx.backlinks` |
| `dsh-backlinks-supermanager` | Service Provider：supermanager HTTP 批次源 | 注册到 `ctx.backlinks` |
| `dsh-backlinks-cloud-mail` | Service Provider：cloud-mail 邮箱 | 注册到 `ctx.backlinks` |
| `dsh-tool-backlinks`（本包） | Consumer：面向模型的 `backlinks` 工具 | `ctx.tools` |

## 工具

`backlinks(action, …)` — 动作 `batch_list`、`batch_get`、`batch_claim`、`lease_heartbeat`、`lease_release`、`item_result`、`badge_add`、`mailbox_create`、`mail_wait`。结果携带一行 `summary` 与结构化 `data` 负载；单次调用超时（`timeoutMs`，默认 300000）是部署策略。没有提供方时工具保持可见，执行时返回结构化错误。

## 模型体验

### 系统提示词

#### 模型看到什么

backlinks 工具在注册时贡献以下指引。

##### Backlinks 工具指引

```markdown
Use the backlinks tool to run the publish-batch workflow against the backlink management backend: batch_list → batch_get (pick a batch) → batch_claim (grants a lease; heartbeat every ~30s while working) → per item: browser publishes on the target site, then item_result reports live/submitted/failed/skipped → lease_release when done. mailbox_create + mail_wait receive site verification codes (returns code and first link). badge_add installs a reciprocal footer badge when a site requires exchange. Never re-submit an item whose outcome is unknown: report failed with failureMode manual_required instead.
```

#### Token 影响

工具注册期间每次请求固定指引成本，加上每次调用返回的有界批次/租约/邮件摘要。

#### KV Cache 影响

工具 schema 与提示词分节稳定；跨调用无请求前缀抖动。

## 已知限制与遗留工作

- **无批次进度事件** — 进度按调用观察；租约/进度事件流推迟。
- **邮件等待以工具调用为界** — 受工具 `timeoutMs` 约束；更长等待意味着多次 `mail_wait` 调用。
