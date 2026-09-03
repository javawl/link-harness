# Agent Note: backlinks comment-body link — embedding the anchor without a Website field

Status: implemented

[English](2026-09-02-backlinks-comment-body-link.md) | 中文

## Problem

博客评论剧本此前只在表单的 Website 字段携带目标链接，而 Wix 类评论组件没有该字段——只有一个评论正文输入框加会员登录，这类站点因此没有成文的带链途径。登录墙过后，执行者只能临场发挥把锚文本嵌进正文，格式、链接数量、核验都没有纪律。更糟的是通用 live 标准（"公开页文本里能找到目标链接或锚文本"）在 HTML 被转义时会误报：`<a href=…>` 以纯文本显示的评论照样能通过文本搜索，一条没生效的链接可能被回写成 `live`。

## Decision

`playbook-blog.md` 按勘察到的表单形态分支选择带链方式（[`examples/backlink-agent`](../../../../examples/backlink-agent/skills/backlink-publish/references/playbooks/playbook-blog.md)）。有 Website 字段的表单维持原行为——链接进字段，正文不带链接。只有评论正文一个输入框的评论区走"正文嵌链"一节：

1. 输入格式按框型选择：真纯文本框（无工具栏、非 contenteditable）`<a href="targetUrl">anchorText</a>` 直写；contenteditable 富文本框或带工具栏的框必须经工具栏链接按钮放入锚文本——敲进去的标记会按字面渲染（pullcommunityoutreach 实证）。两种方式都要求锚文本融进 2-3 句真实观点、一段评论只嵌 1 个链接。**裸链默认禁用**（splendorsinglesministry 实证裸链显示为纯文本），仅站内确有裸链自动转链先例时才允许。
2. **平台先例表**按面拆分，命中即按该平台方式执行、无需逐站勘察：Wix 群组讨论帖 composer 接受 `<a>` 直写（splendorsinglesministry 渲染成功）；Wix 博客评论框是 contenteditable 编辑器，直写标记会被转义，必须用工具栏链接按钮（pullcommunityoutreach 转义反证；同站 v7cztusuh 的可点链接正证）。未知平台提交前仍需三证据居一：评论区已有上线评论带**可点击**链接（aria 快照 `role:link`，最强证据）/ 富文本工具栏有链接按钮 / 表单附近有 "HTML allowed" 类提示；一个都没有 → 回写 `skipped`（"评论区无 Website 字段且无正文链接先例，无途径携带目标链接"），不发试探性评论——一次最终提交的铁律下，发出去的无链评论就是纯水评。
3. 论坛式评论框在站内已有 BBCode 先例或表单旁有格式提示时，改用 `[url=targetUrl]anchorText[/url]`。群组/讨论式站点（如 Wix groups）的帖子正文经论坛剧本走同一套正文嵌链规则。
4. 核验口径严于通用 live 标准：aria 快照里评论正文出现 `role:link` 且名称含锚文本才算嵌上；被转义的 `<a href=…>` 纯文本 → 回写 `failed + manual_required`（人工可在浏览器里编辑该评论），绝不自动重发第二条；failureReason 注明平台，供修正先例表。

## Alternatives considered

- **先发一条 HTML 评论试探，被转义再补救** —— 违反一次最终提交铁律；被转义的试探已经是一条发出去的水评，且该条目的唯一一次机会已被消耗。
- **所有平台一律要求逐站证据** —— Wix 类站点在评论外链批次里占大头且已有平台级验证先例，逐站重勘察只是重复花费；逐站门槛只留给它真正有区分度的未知平台。
- **同时把 markdown `[text](url)` 输入写成规则** —— 没有任何证据表明目标评论框渲染 markdown，写进去就是把猜测固化成规则；等真实站点出现再说。
- **把通用 live 证据规则全域收紧为必须 `role:link`** —— 被转义误报只存在于正文嵌链场景；共享标准维持不变，更严的口径只放在本剧本。
- **维持"会员登录组件一律 manual_required"的现状** —— 登录决策树已能自动通过 Google OAuth 与一次性邮箱注册站点，一刀切挂起会把可行站点挡在自动化之外。

## Consequences

- 无 Website 字段的评论区在平台或逐站证据存在时变得可发布，无证据时只花一次勘察并诚实回写 `skipped`——不再有临场发挥的水评。
- 先例表随每个验证过的平台增长；被错列的平台通过注明平台的 `failed + manual_required` 回写得到修正。
- 被转义的评论回写为 `failed + manual_required` 而非误报 `live`；发布记录保持诚实，人工拥有浏览器内编辑的补救权。
- 该规则是由提示词文本承载的技能指引；目前没有任何测试引用剧本文件，约束边界仍是后端租约、认领规则和模型对技能的遵循。

## Related

规则向并行子任务的投递由 [discipline-delivery-channel](../bug-fix/2026-09-03-backlinks-discipline-delivery-channel.zh.md) 拥有；评论区勘察序列由 [comment-lazy-load-recon](../bug-fix/2026-09-03-backlinks-comment-lazy-load-recon.zh.md) 拥有。
