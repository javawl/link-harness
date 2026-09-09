# Agent Note: 后台发布与人工浏览器控制

Status: implemented

[English](2026-09-09-background-publication.md) | 中文

## Problem

把浏览器放在屏幕外，不能阻止 Chrome 默认的新标签页行为恢复最小化窗口。仅拦截显式 bringToFront 调用不能覆盖建页路径。关闭登录或验证码页面，即使尚未提交，也会丢失用户的恢复位置。

## Decision

[发布器](../../../../packages/backlinks/tool-backlinks/src/publisher.ts)在浏览器执行前拒绝 bringToFront。既有的 browser/backlinks 工具限制拒绝 shell 和系统输入工具。Playwright/CDP 负责页面输入；独立有头 Chrome 的可见状态由用户控制。通用浏览器指引要求用户明确请求后才能置前窗口。

[Playwright 提供方](../../../../packages/browser/browser-playwright/src/provider.ts)通过 [Target.createTarget](https://chromedevtools.github.io/devtools-protocol/tot/Target/#method-createTarget) 创建标签页并启用 background。Playwright 默认的 context.newPage 没有传该标志。创建前开始收集页面事件，并发请求按 target id 匹配，等待受操作超时限制。窗口位置参数仅为提示，macOS 可以调整。

已保存的 manual_required 失败保留原始页面。批次结果包含 manualRequired，各条提供 itemId、browserId、page 和 reason，用于通知人工处理。其他可执行条目继续。只有已保存的 retryable 失败，且没有最终提交或不确定输入，才允许释放失败页。这取代[页面保留](2026-09-07-backlinks-retained-pages.zh.md)中的待人工失败清理策略；其容量和预检决策继续有效。[子任务工具权限](2026-09-08-backlinks-child-tool-authority.zh.md)仍负责 schema 与工具限制。

## Alternatives considered

**只改提示词。** 执行器不拒绝时，模型生成的 bringToFront 调用仍会到达浏览器。

**只拒绝 bringToFront。** 原生前台建页无需调用该动作就能恢复窗口。无头页面测试无法证明桌面最小化行为。

**使用无头 Chrome。** 用户人工介入所需的可见恢复位置会消失。

## Consequences

待人工页面在用户复核前持续占用内存。通知随批次结果返回；本次不增加桌面提醒或自动重启浏览器。发布器与 Loader/Chrome 回归验证拦截、页面保留、通知及本地发布。macOS 有头 Loader 场景创建最小化测试窗口，并验证并发建页、导航、填写、点击和截图后仍保持最小化。测试不测量物理指针移动或第三方接受提交；网站自行创建的弹窗仍由 Chromium 控制。
