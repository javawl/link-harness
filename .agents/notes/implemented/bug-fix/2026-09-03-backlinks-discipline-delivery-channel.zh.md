# Agent Note: 发布纪律必须传递给每个执行者

Status: implemented

[English](2026-09-03-backlinks-discipline-delivery-channel.md) | 中文

## Problem

批次 310 暴露的是投递失败，不是指引缺失。主会话加载了更新后的 SKILL.md，但真正开浏览器干活的是第 4b 步压缩提示词派出的并行子任务——会话日志显示三个子会话没有一个加载过技能正文（SKILL.md 标志性短语出现 0 次）或任何 playbook。所有只存在于 SKILL.md 单条目循环或 playbook 里的规则——懒加载探测序列、固定跳过措辞、正文带链格式、`role:link` 核验——从未到达执行者。子任务临场编造跳过原因（"静态博文，无评论区…"各种变体，从未用固定措辞）；更早一次运行把 `<a href=…>` 字面敲进 Wix 博客评论框（contenteditable 富文本编辑器），在 pullcommunityoutreach.org 上以纯文本发布。那条被转义的评论随后把条目冻结：防重复守卫的字符串匹配在裸文本里看到目标 URL，回写"已存在跳过"——站点上自己发坏的评论挡住了重发。批次 310 第二次运行证实投递已生效，但暴露了模板自身的陷阱："CAPTCHA/登录墙回写 manual_required"一句让子任务把每个 Wix 会员登录墙都挂起为人工（约 30 条）而不去用一次性邮箱注册——上一次模板未送达的运行反而注册得很勤——而唯一一次注册尝试又因缺少 `domain` 参数报错，子任务无从知道该填什么。

## Decision

必需的发布纪律由[部署配置](../../../../examples/backlink-agent/cordis.yml)作为子任务 persona 安装。父任务[技能](../../../../examples/backlink-agent/skills/backlink-publish/SKILL.md)负责选择批次，不把规则复制进逐条提示词。子任务在首次模型请求前收到探测顺序、链接格式、href 核验及邮箱注册指令。剧本保留为扩展参考，不是必需规则的唯一传递途径。

提供邮箱注册的登录墙属于注册流程。只有人机验证、无法使用的社交 OAuth 或注册被拒才需要人工处理。富文本必须使用编辑器的链接控件；转义锚标签和裸 URL 文本都不能证明发布。publisher 通过[执行与预算机制](2026-09-05-backlinks-request-budgets.zh.md)核验真实 href 和回执原文。

## Alternatives considered

- **让子任务先加载技能再执行** —— 模板早已写"严格按 backlink-publish 技能的单条目循环执行"，没有一个子任务照做；依赖自愿读文件正是本次要修的失败。
- **把整份技能自动内联进子任务提示词** —— SKILL.md 正文远大于每条真正需要的三段规则；模板会把租约与幂等指令淹没。
- **规则留在 playbook、模板里给链接** —— 子任务可能不点的链接和死通道没有区别；只有物理出现在提示词里的文字才保证送达。

## Consequences

每个执行者都收到固定纪律，不依赖自愿读取文件。父任务只携带批次选择，子任务资料位于稳定的 persona 与工具 schema 前缀之后。转义评论不能建立已核验外链。用途声明和文字规则仍依赖模型判断；href 与回执存在性检查不证明站点的审核语义。[真实浏览器场景](../../../../examples/backlink-agent/tests/publisher.snapshot.ts)检查指令传递及可执行核验路径，不声称真实站点发布成功。
