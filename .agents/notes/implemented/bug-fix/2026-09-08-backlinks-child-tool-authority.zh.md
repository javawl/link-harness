# Agent Note: 发布子任务的工具 schema 与权限

Status: implemented

[English](2026-09-08-backlinks-child-tool-authority.md) | 中文

## Problem

发送给模型的 schema 必须描述执行器接受的参数。已解析的工具定义已经包含 JSON Schema；在根层追加简写参数声明，会使理解 schema 的调用方看不到这些字段。模型仍可能从文字推断布尔值，因此直接传入正确布尔值的脚本调用无法发现声明错误。通用 shell 还允许绕过浏览器提交跟踪执行外部写入，记录为失败不足以证明网站没有收到内容。

## Decision

[发布器](../../../../packages/backlinks/tool-backlinks/src/publisher.ts)在 properties 内扩展每个子任务的 browser 和 backlinks schema，保留继承字段且不修改全局定义。submission 是布尔值，receipt 和 verificationSelector 是字符串。现有执行检查继续约束唯一最终提交及结果核验。

发布子任务通过原生工具限制仅提供 browser 和 backlinks。Bash 不出现在模型工具中，即使注册了全局 shell，其调用也会在执行前被拒绝。上传文件须在发布前准备好。这取代了[请求预算](2026-09-05-backlinks-request-budgets.zh.md)中的 shell 许可；该记录的请求计数和原生生命周期仍然有效。[发布检查点](2026-09-07-backlinks-publication-checkpoints.zh.md)继续负责持久尝试、结果核对和未知结果保留。

## Alternatives considered

**转换字符串布尔值或更换模型。** 两者都可能掩盖声明错误，却未修复回执字段或其他调用方使用的 schema。声明的 JSON 类型与执行检查保持一致。

**过滤 shell 中的 POST 命令。** 任意脚本、库或编码都可能在没有可识别命令片段的情况下写入。移除 shell 能力可以关闭这条提交旁路，无需声称能够安全解析任意程序。

**提高单项预算。** 更多请求无法修复缺失的参数声明，只会让反复被拒绝的动作消耗更多工作量。

## Consequences

模型收到完整的发布参数，外部发布保留在分配的浏览器流程内。子任务不能通过 shell 下载或转换本地素材；这些文件须在发布流程外准备。用途标记仍无法识别网站脚本执行的所有隐式写入。历史失败尝试在获得新发布授权前仍需核对结果。

[发布器回归](../../../../packages/backlinks/tool-backlinks/tests/publisher.spec.ts)检查实际模型请求、保持全局 schema、拒绝字符串标记，并证明 shell 调用在注册的执行体运行前被拒绝。[Loader/Chrome 场景](../../../../examples/backlink-agent/tests/publisher.snapshot.ts)验证持久化的请求 schema，记录一次被拒绝的 Bash 调用，并核对本地表单的实际提交。脚本模型响应不能证明生产模型遵循指令或第三方接受率。
