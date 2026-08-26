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

## 模型体验

间接经由 `dsh-tool-backlinks`；本提供方不产出提示词或 schema。

#### KV Cache 影响

无直接失效；由上述 Consumer 负责请求前缀变化。

## 已知限制与遗留工作

- **`listBatches` 无分页** — 后端返回全量工作空间列表；当前规模足够。
- **租约心跳由调用方驱动** — 提供方只暴露操作；节奏属于消费方。
