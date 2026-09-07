# @deepseek-ai/dsh-backlinks-supermanager

[English](README.md) | 中文

外链批次工作源服务定义的 Service Provider：基于 supermanager `/api/agent/*` 的 Bearer 令牌 HTTP 客户端（批次列表/详情、租约认领/心跳/释放、闭合联合条目回写、互惠徽标）。HTTP 状态映射到 seam 错误分类；租约冲突的 `Retry-After` 以 `retryAfterSeconds` 保留。

| 包 | 角色 | ctx 键 |
|---|---|---|
| `dsh-backlinks` | Service Definition | `ctx.backlinks` |
| `dsh-backlinks-supermanager`（本包） | Service Provider：supermanager HTTP 批次源 | 注册到 `ctx.backlinks` |
| `dsh-tool-backlinks` | Consumer：面向模型的 `backlinks` 工具 | `ctx.tools` |

## 配置

| 字段 | 默认 | 用途 |
|---|---|---|
| `baseUrl` | （空） | 部署基址，如 `http://127.0.0.1:3000`；为空即提供方不可用 |
| `token` | `SUPERMANAGER_TOKEN` 环境变量 | 后端「Agent 接口」设置页生成的 Bearer 令牌 |
| `requestTimeoutMs` | `15000` | 单请求超时 |

批次详情将已配置的锚点目标按 `website.siteUrl` 解析为 HTTP(S) 绝对地址。独立锚点列表为空时，提供方使用已保存的网站 `name` 作为锚文本、`siteUrl` 作为目标，与 `/websites/<websiteId>/edit` 的资料一致。默认锚点没有后台锚点 id，也不修改网站记录。显式锚点优先；显式空字段、无效或非 HTTP(S) 目标以 `BACKLINKS_API_ERROR` 拒绝。既没有可用的网站名称与网址，也没有显式锚点时，列表保持为空，预检在认领前停止。已保存的描述、图片及其他提交资料包字段保持原样。

## 模型体验

间接经由 `dsh-tool-backlinks`；本提供方不产出提示词或 schema。

#### KV Cache 影响

无直接失效；由上述 Consumer 负责请求前缀变化。

## 已知限制与遗留工作

- **`listBatches` 无分页** — 后端返回全量工作空间列表；当前规模足够。
- **租约心跳由调用方驱动** — 提供方只暴露操作；节奏属于消费方。
