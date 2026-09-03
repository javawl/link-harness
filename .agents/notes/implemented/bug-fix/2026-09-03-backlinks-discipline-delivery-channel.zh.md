# Agent Note: backlinks discipline delivery — the subagent prompt is the only channel executors read

Status: implemented

[English](2026-09-03-backlinks-discipline-delivery-channel.md) | 中文

## Problem

批次 310 暴露的是投递失败，不是指引缺失。主会话加载了更新后的 SKILL.md，但真正开浏览器干活的是第 4b 步压缩提示词派出的并行子任务——会话日志显示三个子会话没有一个加载过技能正文（SKILL.md 标志性短语出现 0 次）或任何 playbook。所有只存在于 SKILL.md 单条目循环或 playbook 里的规则——懒加载探测序列、固定跳过措辞、正文带链格式、`role:link` 核验——从未到达执行者。子任务临场编造跳过原因（"静态博文，无评论区…"各种变体，从未用固定措辞）；更早一次运行把 `<a href=…>` 字面敲进 Wix 博客评论框（contenteditable 富文本编辑器），在 pullcommunityoutreach.org 上以纯文本发布。那条被转义的评论随后把条目冻结：防重复守卫的字符串匹配在裸文本里看到目标 URL，回写"已存在跳过"——站点上自己发坏的评论挡住了重发。批次 310 第二次运行证实投递已生效，但暴露了模板自身的陷阱："CAPTCHA/登录墙回写 manual_required"一句让子任务把每个 Wix 会员登录墙都挂起为人工（约 30 条）而不去用一次性邮箱注册——上一次模板未送达的运行反而注册得很勤——而唯一一次注册尝试又因缺少 `domain` 参数报错，子任务无从知道该填什么。

## Decision

纪律必须骑在执行者真正收到的通道上（[`SKILL.md`](../../../../examples/backlink-agent/skills/backlink-publish/SKILL.md)）：

1. 第 4b 步子任务提示词模板内联四段硬纪律——探测序列与固定跳过措辞、按框型的带链方式（Website 字段 / contenteditable 编辑器的链接按钮 / 纯文本框 `<a>` 直写 / BBCode）、以 `role:link` 核验与查重、以及"先把登录要求当注册流程处理"的自助注册（`mailbox_create` 必须带 `localPart` 与 `domain`=screwdom.org 两个参数）。带邮箱注册表单的登录墙是正常流程而不是人工事件；只有人机验证墙（reCAPTCHA）、不可用的社交 OAuth 或注册被拒才挂起 `manual_required`。模板里写明原因：子任务不加载技能文件。
2. 单条目循环本体同步内联浓缩版（勘察第 3 步、填写第 6 步、核验第 7 步）；playbook 降级为扩展参考，任何承重规则不得只住在 playbook 里。
3. "按框型选输入方式"取代"默认直写 HTML"：contenteditable 编辑器或带工具栏的框，敲进去的 `<a>` 标记会按字面渲染——锚文本必须经工具栏链接按钮进入。真纯文本框才 `<a>` 直写。Wix 先例表按面拆开（群组讨论帖 composer 接受 `<a>`；博客评论框必须用链接按钮），pullcommunityoutreach 是反证，同站 v7cztusuh 的可点链接是正证。
4. 核验与查重只认可点链接（`role:link` 且名称含锚文本或指向 targetUrl）；裸 URL 字符串——包括被转义的 `<a>` 文本——证明不了任何事。执行者自己被转义的评论因此不会把条目冻结成"已发布"。evidence.md 同口径。

## Alternatives considered

- **让子任务先加载技能再执行** —— 模板早已写"严格按 backlink-publish 技能的单条目循环执行"，没有一个子任务照做；依赖自愿读文件正是本次要修的失败。
- **把整份技能自动内联进子任务提示词** —— SKILL.md 正文远大于每条真正需要的三段规则；模板会把租约与幂等指令淹没。
- **规则留在 playbook、模板里给链接** —— 子任务可能不点的链接和死通道没有区别；只有物理出现在提示词里的文字才保证送达。

## Consequences

- 每个执行者现在逐字收到探测、带链、核验三段规则，无论它之后选择读什么；固定跳过措辞让懒加载类跳过可聚合统计。
- 模板长出四段规则块——这是保证送达的唯一提示词代价。
- 被转义的评论不再冒充成功或既有外链；它回写 `failed + manual_required`，条目保持可补救。
- 投递仍由提示词承载：无视内联规则的模型仍可能出错，playbook 语料也仍无测试固定。重置批次 310 误跳条目后重跑是实测检验。
