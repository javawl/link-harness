---
name: google-session
description: 在共享浏览器里初始化、检查或重新播种谷歌会话：用户说"初始化谷歌会话/登录谷歌/检查谷歌会话"或输入 /google-session 时使用。登录由用户人工在 Chrome 窗口完成，智能体只负责导航、轮询确认与复核。
whenToUse: 用户要求初始化、检查或重置共享浏览器 profile 里的 Google 登录会话（为 "Continue with Google" 类外链站做准备）。
user-invocable: true
---

# 谷歌会话管理（google-session）

完整规则见 backlink-publish 技能的 [references/google-session.md](../backlink-publish/references/google-session.md)。本技能只做会话操作，不执行批次：

1. `browser navigate` 到 `https://accounts.google.com`（当前活动页即可）。
2. 已登录（页面显示账号头像/邮箱）→ 跳到第 4 步。未登录 → 告知用户："请在弹出的 Chrome 窗口里亲手完成 Google 登录（含 2FA），密码不会经过我"。然后每 10 秒 `browser snapshot` 轮询，直到出现账号头像/邮箱，最多等 10 分钟；超时如实报告未完成。
3. 登录完成后 `browser navigate` 到 `https://myaccount.google.com` + `snapshot` 复核。
4. 向用户报告当前登录的账号（邮箱），确认"谷歌会话已就绪，带 Google 登录的外链站之后会自动通过授权"。

## 纪律

- 绝不代替用户输入 Google 密码或 2FA 码；只做导航、轮询、快照和读屏。
- 检测到异常授权要求（超范围权限）时截图并在回复中注明。
- 会话已就绪时再次调用本技能是无害的幂等检查。
