# Agent Note: backlinks duplicate-publish guard — verify records before re-submitting

Status: implemented

[English](2026-09-01-backlinks-duplicate-publish-guard.md) | 中文

## Problem

重复运行发布批次时，已成功发布的来源可能被再次提交。后端租约让同一批次的执行互斥，`batch_claim` 也只接受 `pending`/`failed` 条目，但已发布的来源仍可能再次走到浏览器：supermanager 在条目回到 `pending`/`failed` 时都会清空 `executed_publish_record_id`（发布记录被改回 `recorded`/`failed` 会重新打开关联条目），而模型此前没有"提交前先核对发布记录"的常驻规则。同一网站在同一目标站的第二次提交在站长看来就是垃圾信息，也污染发布历史。

## Decision

一条规则——已发布的来源一律跳过、绝不重复提交——落在三个面：

1. `backlinks` 工具提示词分节（[`tool-backlinks`](../../../../packages/backlinks/tool-backlinks/src/backlinks.ts)）写明发布前验证规则：条目 `publishStatus` 为 `submitted` 或 `live`、或 `publishedUrl` 非空即已发布；同批次任一条目对同一来源已有此类记录，该来源同样视为已发布；勘察时在目标站发现本站链接也视为已发布。跳过一律回写 `skipped` 并附原因。集成测试固定了这些句子。
2. `backlink-publish` 技能在 `batch_get` 阶段就完成已发布分区（先于任何认领和 ask-user 卡片），单条目循环第 1 步做同样核对，并在勘察阶段检索目标站上是否已有本站链接。`submitted` 条目若公开页已能核验到链接，可用已有 `publishedUrl` 复核并回写 `live`——只核验，绝不再次提交。子任务提示词携带 `publishStatus`/`publishedUrl` 与先验证指令；运行汇总单列"已发布跳过"条目。
3. 能力词汇（[`dsh-backlinks`](../../../../packages/backlinks/backlinks/src/types.ts)）在 `BacklinkBatchItem` 上写明 `publishedUrl`/`publishStatus` 的"已发布"判据。

## Alternatives considered

- **仅过滤认领响应** —— 可认领条目恰为 `pending`/`failed`，而后端在这两条回退路径上都清空执行记录链接，认领负载里没有可过滤的已发布信号；已执行条目本就被后端认领拒绝。
- **发布前逐条查询 supermanager 发布记录** —— 需要后端新增 `/api/agent/*` 端点，超出本仓库；批次详情已暴露每条目的记录，目标站链接检索覆盖 Agent API 看不到的记录。
- **只依赖目标站检索** —— 记录核对在浏览器打开目标站之前就拦下重复（更省、不惊动站点）；目标站检索兜住后端看不见的重复。两者互补，都保留。

## Consequences

- 重复运行对"来源 × 网站"幂等：已发布来源只花一次 `batch_get` 核对，而不是第二次站点提交，跳过原因落在批次页。
- `submitted` 记录一直未上线的来源不会被自动重发。操作者在 supermanager 把记录改回 `recorded`/`failed`——这会重新打开关联条目——下次运行再发布。诚实优先于数量；智能体无法核验的重试决策归人所有。
- 目标站检测仍依赖提示词与技能指引。[请求预算决策](../../implemented/bug-fix/2026-09-05-backlinks-request-budgets.zh.md)增加基于最新批次详情的工具过滤，并排除已认领来源。这些检查无法发现后台记录中不存在的链接，仍须浏览器核验。
