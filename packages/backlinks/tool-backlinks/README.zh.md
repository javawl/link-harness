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

`batch_get` 默认返回计数、`eligibleCount` 和 `nextItemIds`。`view: items` 返回含网站资料与 anchors 的完整小页；可指定 `itemIds`，或使用返回的 `nextAfterItemId` 游标。`view: all` 显式请求全部详情。`maxBatchItems` 默认为 6，`maxBatchViewBytes` 默认为 16384 个 UTF-8 字节；小页过大时返回可操作的错误，不丢弃字段。

`batch_claim` 根据最新批次详情校验选择，排除已发布来源与待人工失败，再在所选候选项内去重。它只返回 `leaseId`、不透明的 `leaseExpiresAt` 和 `itemIds`。已认领 id 写入仅日志可见的 `backlinks/attempt` 事件，在返回认领结果前刷写；检查点保存失败时释放租约并返回错误。取消、压缩和重放后，该智能体会话仍排除这些尝试。重新处理失败条目需要后台复核并新建会话。

`leaseHeartbeatMs` 默认为 60000。工具描述要求模型对已认领工作省略 `lease_heartbeat`。运行时按独立于服务器时钟的间隔续租，无需 LLM（大语言模型）调用。释放租约前、所有者进入空闲或被释放时，以及插件被释放时，续租会停止并等待在途请求完成。续租失败会取消活跃所有者并记录原因。清理不会释放远端租约，也不推断发布结果；到期时间仍以后台为准。

`scope` 同时适用于 `batch_get` 与 `batch_claim`：`pending` 选择待发布条目，`retryable` 选择可重试失败，默认 `all` 包含两者。摘要和条目页返回该 scope，并只统计其中可执行的工作。仍可通过显式条目读取核对已完成结果；认领会拒绝所选范围之外的 id。翻页时沿用用户确认的 scope；一页完成不代表整个批次完成。

<a id="foreground-batch-publication"></a>

## 前台批次发布

配置 `publisher` 后注册 `backlink_publish(batchId, scope, mode, itemIds?, browserId?)`。provider、concurrency、persona、maxTokens 均须显式配置，并要求 browser、agents 和 subagents 服务。provider 必须创建支持 persona、工具限制和深度限制的全新进程内子任务。调用前确认范围；mode 为 smart 或 all，scope 为 pending、retryable 或 all。

一次调用保留一个租约，最多按 concurrency 滚动派发，同一目标主机串行。提供方使用显式锚点或已保存网站资料中的默认值；网站资料不可用时，在创建页面、租约或子任务前停止。显式 itemIds 在可执行来源去重前生效。每条子任务只收到本条、website、anchors、mode、leaseId 和预留页，固定纪律通过 persona 注入。首次请求模型前，发布器在父会话写入并刷写 `backlinks/attempt` 记录，恢复不依赖取消时可能丢失的最终工具结果。检查点失败停止派发；页面不足不会修改未启动条目。

子任务的模型或基础设施错误停止新派发，等待在途子任务结束并释放租约；未启动条目保持待处理。单项预算、结果核对或页面清理失败时，跳过受影响工作并继续队列。已尝试但仍 pending 且没有发布记录的来源排除后续派发，列入 unresolvedItemIds；这不会回写 skipped 状态，也不允许重新提交。额度、鉴权、检查点和租约错误仍停止整批，stoppedReason 保留其诊断。remaining 为零且 stoppedReason 为 null 时，本次范围执行结束，未决条目单独列出交人工核对。

子任务工具执行器强制使用专属页面及 itemId/leaseId，限制 source_tags 和 badge_add 的目标，并拒绝批次和租约操作。省略 page 使用专属页；其他页会被拒绝。click/press 必须声明 submission：false 为导航或账户操作，true 为唯一最终发布。已派发最终发布后只允许核验、导航、召回及安全关闭。结果保存后禁止继续输入或导航；即使已有更早的结果，未知提交页也不能关闭。用途声明不能识别网站脚本的隐式提交。子任务仅提供 browser 和 backlinks，shell 调用在执行前被拒绝。所需本地上传文件须在发布前准备好。

live 和 submitted 都要求已声明最终提交；预先存在的外链记为 skipped。live 回写重新访问 HTTP(S) publicUrl，主机必须属于所分配的 sourceUrl 或 submitUrl，仅忽略开头的 www，并检查真实目标 href。发布页面不能位于推广网站或目标地址的主机。verificationSelector 可缩小页面范围。submitted 要求当前页面包含 receipt 原文；该检查确认文字存在，不判定其含义或匿名可访问性。已派发但未确认的提交保持 manual_required。回写响应丢失时先读取后台，再决定是否写入兜底结果。

取消后等待子任务结束并核对结果。未声明最终提交且无不确定输入的中断可记 retryable；未知提交和不确定输入保留页面。最终提交前已保存的失败会释放本条页面，即使后台仍需人工复核。仅关闭已有明确结果的自有页面及尚未分配的空白预留页，随后停止续租并释放租约。该长调用不使用低层工具的单次超时；子任务仍受提供方预算约束。返回 attempted、remaining、counts、stoppedReason 和 unresolvedItemIds；模型文本省略空的未决列表。live、submitted 与未决状态分别统计。

`backlink_publish_many(batches, scope, mode)` 接收有序的 `{batchId, browserId?, itemIds?}` 分配。浏览器按显式 id、网站已保存绑定、部署默认值的顺序选择；开页或认领前核对所有浏览器 id。不同浏览器和网站组合并行，共享其中任何一项的批次按传入顺序执行。每个浏览器最多执行 `concurrency` 条，总并发可达到该值乘以所选浏览器数。在途发布跨调用占用浏览器与网站。一个批次停止后不再启动其他批次，并等待在途工作结束。结果标识各批次及浏览器；`pendingBatchIds` 记录尚未启动批次。子任务同时受浏览器和页面限制，结果核验与清理也使用相同分配。

## 模型体验

### 系统提示词

#### 模型看到什么

backlinks 工具在注册时贡献以下指引。

##### Backlinks 工具指引

```markdown
Use the backlinks tool to run the publish-batch workflow against the backlink management backend: batch_list → batch_get (counts by default; view=items returns only a small pending page) → batch_claim (grants a bounded lease) → per item: browser publishes on the target site, then item_result reports live/submitted/failed/skipped → lease_release when done. Keep lease renewal in the runtime; never use model calls to sleep or poll subagents. mailbox_create + mail_wait receive site verification codes (returns code and first link). badge_add installs a reciprocal footer badge when a site requires exchange. source_tags attaches tags to the target site by name after a publish attempt (免徽章/要徽章/可复用/有盾…); idempotent add-only. Verify before publishing: an item whose publishStatus is submitted or live, or whose publishedUrl is set, is already published — never claim or re-submit it, and a source with such a record on any item of the batch is done too; an existing link to the promoted website found on the target site also means already published — report skipped with the reason. Never re-submit an item whose outcome is unknown: report failed with failureMode manual_required instead.
```

#### Token 影响

工具注册期间每次请求固定指引成本，加上每次调用返回的有界批次/租约/邮件摘要。

#### KV Cache 影响

工具 schema 与提示词分节稳定；跨调用无请求前缀抖动。

### 前台 publisher

#### 模型看到什么

可选的 `backlink_publish` schema 见[工具目录](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-backlinks)。它向父任务返回计数和停止原因。子任务接收分配的任务资料、配置的 persona，以及受作用域约束的 browser/backlinks 指引；普通工具调用与结果仍记录在子会话日志中。

#### Token 影响

一次父任务调用协调所选队列，不轮询或复制逐条提示词。固定纪律在每个子任务上下文中只出现一次。核验读取由代码执行；报告的子任务用量与提供方预算含义不变。

#### KV Cache 影响

不同条目使用稳定的子任务 persona 与工具 schema；条目和页面标识位于任务资料中，不改变 schema 前缀。

## 已知限制与遗留工作

- **无批次进度事件** — 进度按调用观察；租约/进度事件流推迟。
- **邮件等待以工具调用为界** — 受工具 `timeoutMs` 约束；更长等待意味着多次 `mail_wait` 调用。
