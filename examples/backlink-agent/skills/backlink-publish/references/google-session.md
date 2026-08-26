# 谷歌会话（Google OAuth 登录站的处理）

很多导航/目录站只提供 "Continue with Google" 一种登录方式。设计是**一次人工播种，之后全自动**：

- 播种：用户在共享浏览器的 Chrome 窗口里亲手登录一次 Google（含 2FA）。密码永不经智能体之手，自动化只发生在登录完成之后的 OAuth 授权跳转（选账号→Allow→跳回），Google 对后者宽容。
- 复用：会话 cookie 存在持久 profile（`.backlink-browser-profile`）里，所有批次、所有站点共用，通常可活几个月。

## 批次执行中的决策树

遇登录墙 → `browser snapshot` 看页面：

1. 有 Google 按钮 → 先 `browser navigate` 到 `https://accounts.google.com` 确认会话（检查完 navigate 回站点登录页）：
   - 已登录 → 回站点点 Google 按钮 → 选账号（单账号常直接跳过选择器）→ 授权页 Allow → 跳回继续。OAuth 若新开窗口，活动页自动切到新页；跳回后如需回到原站，navigate 回去即可。
   - 未登录 → 回写 `failed + manual_required`，failureReason 写明"谷歌会话未初始化或已过期，请说『初始化谷歌会话』"，保留标签页。
   - Google 弹"确认是你本人"/二次验证/设备验证 → 回写 `manual_required` 等人工处理；用户处理一次后该授权通常不再出现。
2. 有邮箱注册 → 走 mailbox_create/mail_wait 流程（本技能主流程第 3 步）。
3. 只有 CAPTCHA → 现有人工兜底。

## 初始化 / 检查（触发词：初始化谷歌会话、登录谷歌、检查谷歌会话）

1. `browser navigate` 到 `https://accounts.google.com`（当前活动页即可）。
2. 已登录 → 直接到第 4 步；未登录 → 提示用户在弹出的 Chrome 窗口里亲手登录（含 2FA），每 10 秒 snapshot 轮询直到出现账号头像/邮箱，最多 10 分钟；超时则报告未完成，不猜结果。
3. 登录完成后 navigate 到 `https://myaccount.google.com` 复核。
4. 向用户报告当前登录的账号（邮箱即可），确认就绪。

## 纪律

- 绝不在 accounts.google.com 上代替用户输入密码或 2FA 码；智能体只做导航、轮询、截图和授权页的 Allow 点击。
- 授权页出现权限清单异常（要求通讯录/云端硬盘等超范围权限）时，截图并在回写证据中注明，由用户决定。
- 建议使用专用 Google 账号（不推荐个人主账号）：目录站会拿到该账号的邮箱与基本资料授权。
- `.backlink-browser-profile` 目录因此等同于凭据存储：不可提交、不可打包分发。
- 会话过期无固定周期：决策树第 1 步的检查就是兜底，过期后重新初始化一次即可。
