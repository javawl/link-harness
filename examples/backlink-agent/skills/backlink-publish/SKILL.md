---
name: backlink-publish
description: 本工作区所有"发外链/发布外链/发布批次/跑批次/继续批次"请求的首选且唯一入口：从批次系统(supermanager)拉批次列表、认领租约、用共享浏览器在各目标站自动发布、cloud-mail 收验证码、逐条回写结果与徽标。附带"初始化谷歌会话"引导（用户要在共享浏览器里登录 Google 账号时使用）。凡用户要求实际执行外链发布，必须用本技能，不要用其他 SEO/GEO 类技能替代（那些只讲策略不执行）。
whenToUse: 用户要求执行或继续外链发布批次（supermanager 批次发布），包括选批次、重试、徽标互挂，或要求初始化/检查谷歌会话。
user-invocable: true
---

# 外链自动发布（backlink-publish）

你运行的是一套**有纪律的发布流水线**，不是随手发帖。两条铁律高于一切：

1. **幂等**：一个条目只允许一次"最终提交"动作。提交后拿不到明确回执（结果未知）时，回写 `failed + manual_required`，**绝不自动重试**。
2. **诚实回写**：`live` 必须是你亲自抓取公开页面并确认包含目标链接后的结论；"提交成功但待审核"只能回写 `submitted`。

## 执行流程

收到"发外链"（或输入 `/backlink-publish [批次号]`）后：消息里已带具体批次号时跳过第 1 步直接认领执行。

1. `backlinks batch_list` → **必须调用 `ask_user_question` 工具**把批次渲染成可点击选项卡让用户选，不要只在对话里贴列表让用户打字：每个选项 `label` = "批次 <id> · <待发布数>条"，`description` = 站点类型 + 日期概要；最近 4 个批次作为选项，其余引导用户用自定义输入填批次号。**用户点选后才继续；若问题卡被取消、跳过或未获回答，立即停止本流程，绝不认领任何批次（包括推荐项），向用户说明并等待明确指示。**
2. `backlinks batch_get <id>` → 展示条目；用 ask-user 确认范围（全部 / 仅待发布 / 手选）。
3. `backlinks batch_claim <id> [itemIds]` 获得租约，记下 `leaseId`。
4. **选择执行拓扑**：
   - **条目 ≥3 且分布在不同域名** → 用并发拓扑（默认并发 3）：
     a. 按 `sourceHost` 把条目分组——**同域名的条目必须进同一组串行**（防频控）；
     b. 一次回复里并发调用 `subagent` 工具派出至多 3 个子任务（或逐个以 run_in_background 派发再轮询）。每个子任务的提示词必须包含：该组全部条目的完整信息（id/sourceUrl/submitUrl/category/anchors/tags/notes）、`leaseId`、以及这段话："你是并行发布子任务。先用 browser navigate 并带 page:"组名" 打开专属标签页，此后每一条 browser 命令都必须带同一个 page 参数；严格按 backlink-publish 技能的单条目循环执行；每条完成立即用 backlinks item_result（带 leaseId）诚实回写；CAPTCHA/登录墙回写 manual_required 并保留标签页；不要认领批次、不要 lease_release、不要问用户问题。"
     c. 等待子任务期间，主任务每约 60 秒调一次 `lease_heartbeat` 保活租约；
     d. 全部子任务返回后核对各条目回写状态，`lease_release`，输出汇总表（含每条的 live/submitted/failed/skipped）。
   - **条目 <3 或集中在同一域名** → 串行拓扑：自己逐条执行单条目循环，每 1-2 个条目 `lease_heartbeat`，结束后 `lease_release` 输出汇总。

## 单条目循环

对每个 item（顺序执行，同域连续操作之间自然停顿）：

1. **选择 playbook**：按 `category` 选择（六类见 references/）。`submitUrl` 优先于 `sourceUrl`。
2. **勘察优先**：先 `browser navigate` + `snapshot` 只读了解页面结构，再动手填写。表单字段名从 snapshot 里找。
3. **需要注册/登录？** → 先 `browser snapshot` 看登录/注册页，按决策树走（细节见 [references/google-session.md](references/google-session.md)）：
   - 页面有 "Continue with Google"（或同类 Google OAuth 按钮）→ 先 `browser navigate` 到 `https://accounts.google.com` 确认谷歌会话（检查完 navigate 回站点登录页）：
     - 已登录（显示账号头像/邮箱）→ 回到站点点 Google 按钮 → 账号选择器点账号（若只有一个账号多数站直接跳过）→ 授权页点 Allow/Continue → 跳回站点继续发布流程。授权弹窗若是新开窗口，操作会自动切到最后打开的页。
     - 未登录 → 回写 `failed + manual_required`，原因写"谷歌会话未初始化或已过期，请对智能体说『初始化谷歌会话』"。
     - Google 弹"确认是你本人"/二次验证 → 同样回写 manual_required 等人工处理一次。
   - 有邮箱注册表单 → `backlinks mailbox_create`（随机前缀 + screwdom.org 域）→ 注册 → `backlinks mail_wait`（默认等 120 秒）拿 `code`/`link` → 完成验证 → 登录。
   - 只有 CAPTCHA/其他墙 → 现有人工兜底规则。
4. **填写与提交**：锚文本和目标 URL 从 batch 详情的 `anchors` 里选（优先第一个 active 项）；描述文字要自然、贴站点的语言。提交前 snapshot 复查关键字段。
5. **核验**：提交后 `browser navigate` 到公开列表页（非预览）+ `snapshot`，确认页面包含目标 URL/锚文本。
6. **回写**（`item_result`）：
   - 核验通过 → `live` + publicUrl + anchorText + targetUrl + evidence（一句话证据）
   - 明确"已提交待审核" → `submitted`
   - CAPTCHA/登录墙/需人工 → `failed` + `manual_required` + 原因（保留浏览器标签页不关）
   - 瞬时错误（超时/网络）→ `failed` + `retryable`
   - 付费/停服/资格不符 → `skipped` + 原因
7. 对方要求先挂互换徽标时（"reciprocal/featured badge"），按此流程**在提交前完成**：
   a. 从对方站点的徽标区拿到徽标 HTML（通常有 Light/Dark/Auto 三种，选一种）→ `backlinks badge_add`（`websiteId` 用批次里的网站 id，`name` 用对方站名）。
   b. **必须让徽标真正上线**：badge_add 返回 `callbackTriggered`；无论真假，都用 bash `curl -s "https://<我方站点host>/footer/refresh"`（supermanager 里该网站配置的回调地址）触发一次站点刷新。
   c. **必须实测确认**：`curl -s "https://<我方站点host>/"` 并 grep 对方域名，徽标 HTML 出现在页面里才算生效；没出现等 5 秒重试，最多 3 次。仍不出现 → 回写 `manual_required`（原因写"徽标已入库但站点未刷新"）。
   d. 线上确认后，才回到对方站点做 Verify Backlink/提交。若徽标此前已挂过（curl 已能 grep 到），直接跳到 d，不要重复 badge_add。

## 人工兜底（持久会话）

浏览器 profile 是持久的。遇到 CAPTCHA/首次登录：保留标签页，回写 `manual_required`，继续下一条。用户在弹出的浏览器窗口里人工过一次验证后，重跑该批次即可自动复用会话。

## 初始化谷歌会话

用户说"初始化谷歌会话/登录谷歌/绑定 Google 账号"时（不属于批次执行）：

1. `browser navigate` 到 `https://accounts.google.com`（用当前活动页即可，不关其他页）。
2. 告知用户：请在弹出的 Chrome 窗口里**亲手**完成 Google 登录（含 2FA）——密码永不经智能体之手。然后每 10 秒 `browser snapshot` 轮询，直到页面出现账号头像/邮箱（最多等 10 分钟）。
3. 登录成功后 `browser navigate` 到 `https://myaccount.google.com` + `snapshot` 复核已登录，向用户确认"谷歌会话已就绪，后续带 Google 登录的外链站会自动通过授权"。
4. 若已登录而用户只想检查：直接做第 3 步并报告状态。

详细规则：[references/google-session.md](references/google-session.md)。

详细规则：[references/status-model.md](references/status-model.md)（状态映射）、[references/safety.md](references/safety.md)（频控与授权）、[references/evidence.md](references/evidence.md)（什么算已发布）。

六类站点的操作手册（按 category 取用）：
[目录/导航](references/playbooks/playbook-directory.md) ·
[博客评论](references/playbooks/playbook-blog.md) ·
[论坛](references/playbooks/playbook-forum.md) ·
[内容站](references/playbooks/playbook-article.md) ·
[游戏站](references/playbooks/playbook-gaming.md) ·
[工具站](references/playbooks/playbook-tools.md)
