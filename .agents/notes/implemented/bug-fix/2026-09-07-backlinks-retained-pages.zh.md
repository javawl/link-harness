# Agent Note: 外链页面保留与发布预检

Status: implemented

[English](2026-09-07-backlinks-retained-pages.md) | 中文

## Problem

已经结束的 manual_required 失败即使未发生最终提交，也会占用浏览器槽位。较小的总页数上限随后阻断其他待处理工作。网站缺少锚点会反复消耗付费尝试并产生条目失败，相对目标地址则无法通过绝对 URL 核验。

## Decision

页面保留依据提交结果是否明确。已保存失败只有在未声明最终发布、且没有不确定输入时才释放自有页面。未知提交保留人工复核状态和页面。其他任务页面不被回收。

外链部署使用 `maxOpenPages: 0` 关闭浏览器总页数限制；三个发布槽位及同主机串行仍约束执行中的工作。其他部署仍可设置正数上限。这扩展了[请求预算](2026-09-05-backlinks-request-budgets.zh.md)的页面策略，其原生预算、请求计量与核验要求继续有效。

锚点解析遵循[发布检查点与网站默认资料](2026-09-07-backlinks-publication-checkpoints.zh.md)。Supermanager 优先使用已配置锚点，否则使用已保存的网站名称和网址；缺少可用资料时，在开页、认领和模型工作前停止。显式相对目标按网站 URL 解析，无效显式锚点仍在 JSON 解析处报错。

## Alternatives considered

- 提高页数上限只会推迟复核页面积累造成的再次停止。
- 关闭全部失败页面可能丢失未知提交；仅有后台失败状态不足以证明可以安全关闭。
- 在发布时编造默认锚点会绕过已批准的网站资料并掩盖配置错误。

## Consequences

保留页面可能增加浏览器内存；监督须衡量资源并保留不确定工作。重新开放 manual_required 条目仍须经过后台复核及现有会话排除规则。[发布器快照](../../../../examples/backlink-agent/tests/publisher.snapshot.ts)覆盖没有创建子任务的批次预检拒绝，[浏览器快照](../../../../examples/backlink-agent/tests/browser-capacity.snapshot.ts)覆盖正数上限及关闭上限后的七个保留页面。定向回归覆盖终态页面复用与相对 URL 解析。
