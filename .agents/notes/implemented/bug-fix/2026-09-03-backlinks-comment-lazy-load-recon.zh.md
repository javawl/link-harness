# Agent Note: backlinks comment-area lazy-load recon — never conclude absence from one snapshot

Status: implemented

[English](2026-09-03-backlinks-comment-lazy-load-recon.md) | 中文

## Problem

批次 281（评论区外链为主）里大部分条目被以一句临场编造的"静态博文页面，无公开评论区或外链提交入口"跳过——这个措辞在技能里没有任何出处。勘察在 `navigate` 之后立刻做一次 aria 快照，而评论区组件（Disqus、Wix、Blogger iframe、Facebook 插件、giscus）普遍在正文之后异步挂载或滚动到视口才挂载，首屏快照里经常还没有评论区，模型便得出"页面没有评论区"的结论。技能里仅有的等待指引在核验与频控参考里，勘察阶段一条都没有。

## Decision

判"无评论区"必须走完一段探测序列，SKILL.md 勘察步骤逐字内联了它——批次 310 表明并行子任务不加载技能正文和 playbook，所以序列同时骑在第 4b 步子任务提示词模板上（见 [discipline delivery](2026-09-03-backlinks-discipline-delivery-channel.zh.md)）；playbook-blog.md 保留扩展版。序列为：`waitFor` 常见评论锚点（`#comments`、`#respond`、`#commentform`、`[id*='comment']`、`iframe`）或等 3-5 秒再快照；`press` End/PageDown 滚到页底再快照（挂载常由视口接近触发）；见「Load comments」类按钮先点击再快照；把 aria 快照里的 iframe 当作懒挂载评论区用 `frame()` 前缀进入；兜底 `navigate` 到 `URL#comments`。全走完仍无才允许回写 `skipped`，且 skipReason 固定为"评论区延迟加载探测后仍不存在"——固定措辞禁止一句"静态页面"判死，也让跳过原因可按类聚合统计。

## Alternatives considered

- **navigate 后一律固定等待再快照** —— 把集中在评论组件上的失败模式摊到所有站点头上；序列只在目标区块缺席于首屏快照时才等待。
- **在浏览器 seam 层自动等待（waitUntil networkidle）** —— 懒挂载组件常由滚动触发，任何加载态都覆盖不了；滚动是智能体的决策而不是 Provider 默认。seam 已有 `waitFor` 能力，缺的是技能指引。
- **把"无评论区"按 `failed + retryable` 处理** —— 探测完仍缺席通常就是真死路，`skipped` 保留了"无途径"与"瞬时错误"的诚实区分。

## Consequences

- 评论条目在跳过前花一段探测序列；懒挂载的评论区变得可达，不再被静默丢弃。
- 固定措辞的跳过原因让"探测后仍不存在"的人群在批次汇总里可见，可审计哪些是真死路。
- 该规则是经模板送达每个执行者的提示词指引；无视它的模型仍可能误跳。把误跳条目重置后重跑就是实测检验。
