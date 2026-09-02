# Agent Note: backlinks comment-body link — embedding the anchor without a Website field

Status: implemented

[English](2026-09-02-backlinks-comment-body-link.md) | 中文

## Problem

博客评论剧本此前只在表单的 Website 字段携带目标链接，而 Wix 类评论组件没有该字段——只有一个评论正文输入框加会员登录，这类站点因此没有成文的带链途径。登录墙过后，执行者只能临场发挥把锚文本嵌进正文，格式、链接数量、核验都没有纪律。更糟的是通用 live 标准（"公开页文本里能找到目标链接或锚文本"）在 HTML 被转义时会误报：`<a href=…>` 以纯文本显示的评论照样能通过文本搜索，一条没生效的链接可能被回写成 `live`。

## Decision

`playbook-blog.md` 按勘察到的表单形态分支选择带链方式（[`examples/backlink-agent`](../../../../examples/backlink-agent/skills/backlink-publish/references/playbooks/playbook-blog.md)）。有 Website 字段的表单维持原行为——链接进字段，正文不带链接。只有评论正文一个输入框的评论区走新增的"正文嵌链"一节：

1. 提交前必须拿到"本站接受正文链接"的证据，三者居一：评论区已有上线评论带可点击链接（aria 快照 `role:link`，最强证据）、富文本编辑器工具栏有链接按钮、表单附近有 HTML 允许提示。一个都没有 → 回写 `skipped`（"评论区无 Website 字段且无正文链接先例，无途径携带目标链接"），不发试探性评论——一次最终提交的铁律下，发出去的无链评论就是纯水评。
2. 一段评论只嵌 1 个链接；锚文本取 anchors 第一个 active 项，必须融进 2-3 句真实观点读得通；裸链只在站内已有裸链被自动转为链接的先例时才用。
3. 核验口径严于通用 live 标准：aria 快照里评论正文出现 `role:link` 且名称含锚文本才算嵌上；被转义的 `<a href=…>` 纯文本 → 回写 `failed + manual_required`（人工可在浏览器里编辑该评论），绝不自动重发第二条。

## Alternatives considered

- **先发一条 HTML 评论试探，被转义再补救** —— 违反一次最终提交铁律；被转义的试探已经是一条发出去的水评，且该条目的唯一一次机会已被消耗。
- **同时把 markdown `[text](url)` 输入写成规则** —— 没有任何证据表明目标评论框渲染 markdown，写进去就是把猜测固化成规则；等真实站点出现再说。
- **把通用 live 证据规则全域收紧为必须 `role:link`** —— 被转义误报只存在于正文嵌链场景；共享标准维持不变，更严的口径只放在本剧本。
- **维持"会员登录组件一律 manual_required"的现状** —— 登录决策树已能自动通过 Google OAuth 与一次性邮箱注册站点，一刀切挂起会把可行站点挡在自动化之外。

## Consequences

- 无 Website 字段的评论区在有证据时变得可发布，无证据时只花一次勘察并诚实回写 `skipped`——不再有临场发挥的水评。
- 被转义的评论回写为 `failed + manual_required` 而非误报 `live`；发布记录保持诚实，人工拥有浏览器内编辑的补救权。
- 该规则是由提示词文本承载的技能指引；目前没有任何测试引用剧本文件，约束边界仍是后端租约、认领规则和模型对技能的遵循。
