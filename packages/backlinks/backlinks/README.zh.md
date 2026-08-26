# @deepseek-ai/dsh-backlinks

[English](README.md) | 中文

外链能力服务定义（`ctx.backlinks`）：两个提供方注册表——批次工作源与邮箱——各自采用与 web seam 相同的执行期选择，外加闭合联合 `BacklinkItemResult` 词汇与 `BacklinksError` 错误分类。

| 包 | 角色 | ctx 键 |
|---|---|---|
| `dsh-backlinks`（本包） | Service Definition | `ctx.backlinks` |
| `dsh-backlinks-supermanager` | Service Provider：supermanager HTTP 批次源 | 注册到 `ctx.backlinks` |
| `dsh-backlinks-cloud-mail` | Service Provider：cloud-mail 邮箱 | 注册到 `ctx.backlinks` |
| `dsh-tool-backlinks` | Consumer：面向模型的 `backlinks` 工具 | `ctx.tools` |

## 服务 API（ctx.backlinks）

| 成员 | 用途 |
|---|---|
| `registerBatchSourceProvider` / `registerMailboxProvider` | 注册提供方；重复 id 抛 `BACKLINKS_DUPLICATE_PROVIDER`；随 fiber 销毁 |
| `listBatches` / `getBatch` | 批次列表与详情（网站、锚文本、条目） |
| `claim` / `heartbeat` / `release` | 单个批次的租约生命周期 |
| `reportItemResult` | 闭合联合回写：live/submitted/failed/skipped |
| `addBadge` | 互惠 footer 徽标 |
| `createMailbox` / `pollMail` | 验证邮箱创建与有界邮件等待 |

## 选择

配置的 id 必须已注册且 `available()`；未配置时每个注册表要求恰好一个可用提供方。`$DSH_BACKLINKS_BATCH_SOURCE` / `$DSH_BACKLINKS_MAILBOX` 等价于配置字段。

## 模型体验

间接经由 `dsh-tool-backlinks`：由它返回有界的批次/租约/邮件摘要与精确的提供方选择失败；本注册表自身不产出提示词或 schema。

#### KV Cache 影响

无直接失效；由上述 Consumer 负责请求前缀变化。

## 已知限制与遗留工作

- **无观察面** — 没有批次进度事件；调用方按调用观察结果。
- **每个提供方实例单工作空间** — 后端把身份绑定到配置的令牌；多工作空间意味着多份提供方配置。
- **`pollMail` 匹配仅为子串** — 主题/发件人过滤是不区分大小写的子串；结构化发件人解析推迟。
