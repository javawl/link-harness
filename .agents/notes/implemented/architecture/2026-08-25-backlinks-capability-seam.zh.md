# Agent Note：外链能力 seam — 一个工作流，两个后端

状态：已实现

[English](2026-08-25-backlinks-capability-seam.md) | 中文

## 问题

外链发布工作流需要两个外部后端才能运转：外链管理系统（supermanager）持有发布批次、租约与结果回写；邮件系统（cloud-mail）持有解锁站点注册的验证邮箱。两者都是带各自凭据、错误形态与运行规则的 HTTP API（带 `Retry-After` 的租约冲突、「绝不重放结果未知」的回写规则）。若不做 seam，第一个消费方就要内联两个客户端，在工具代码里持有凭据处理与错误映射，且每次后端变更都会变成模型契约变更。

回写契约本身也需要唯一所有者：工作流的安全规则（闭合的结果状态、retryable 与 manual_required 失败模式、超时/租约纪律）必须是词汇，而不是在各调用点重复的散文。

## 决策

外链是一个遵循共同doctrine 的能力 seam，**一个服务上两个注册表**（`ctx.backlinks`）——与 `ctx.web` 对 search+fetch 的切分同构：

1. `@deepseek-ai/dsh-backlinks`（`packages/backlinks/backlinks`）持有 `ctx.backlinks`、两个执行期选择的提供方注册表、闭合联合 `BacklinkItemResult`，以及 `BacklinksError` 错误分类。
2. `@deepseek-ai/dsh-backlinks-supermanager` 基于 `/api/agent/*` 实现批次工作源：批次、租约认领/心跳/释放、条目回写、互惠徽标。HTTP 状态映射到分类；`Retry-After` 以 `retryAfterSeconds` 保留。
3. `@deepseek-ai/dsh-backlinks-cloud-mail` 基于 Open API 实现邮箱：地址创建与有界邮件轮询，携带后端提取的验证码与正文首个链接。
4. `@deepseek-ai/dsh-tool-backlinks` 持有面向模型的 `backlinks` 工具——与 browser 工具单表面形态一致的单工具加 `action` 判别——包括编码工作流安全规则的提示词指引（心跳节奏、未知结果纪律）。

提供方注册能力，绝不注册工具。令牌经配置或 `SUPERMANAGER_TOKEN` / `CLOUDMAIL_TOKEN` 环境回退解析；`available()` 是本地存在性检查。

## 后果

- `BacklinkItemResult` 是编译闭合的：新增状态会破坏提供方与消费方的编译直到被处理，并与对应的后端契约变更一同落地。
- 租约与条目状态留在后端；seam 无状态，消费方崩溃不丢失任何东西——租约服务端过期，条目回到可认领。
- 面向模型的动词集跨后端更换保持稳定；supermanager 或 cloud-mail 的专有行为无法泄漏进工具 schema。
- 验证邮件是一等词汇（`VerificationMail.code`/`link`），工作流的人工干预点因此收缩到仅剩浏览器挑战。

## 考虑过的替代方案

- **每个后端一个带自有工具的提供方包** —— 否决：模型可见 schema 将取决于加载了哪些后端包，且提供方专有字段会泄漏进模型契约。
- **两个 seam（批次 + 邮件）** —— 暂缓：为一个工作流引入两个选择所有者、两套错误分类与两个配置面；若出现独立的邮件消费方再重新评估。
- **类型化结果结构体而非闭合联合** —— 否决：回写状态是后端契约；闭合联合让每次新增都是刻意的、编译可见的变更。
- **提供方内自动租约心跳** —— 否决：节奏是消费方策略；提供方暴露原语，让不同运行方选择自己的节奏。
