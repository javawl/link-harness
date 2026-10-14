---
name: backlink-publish
description: 本工作区所有"发外链/发布外链/发布批次/跑批次/继续批次"请求的首选且唯一入口：从批次系统(supermanager)拉批次列表、认领租约、用共享浏览器在各目标站自动发布、cloud-mail 收验证码、逐条回写结果与徽标。附带"初始化谷歌会话"引导（用户要在共享浏览器里登录 Google 账号时使用）。凡用户要求实际执行外链发布，必须用本技能，不要用其他 SEO/GEO 类技能替代（那些只讲策略不执行）。
whenToUse: 用户要求执行或继续外链发布批次（supermanager 批次发布），包括选批次、重试、徽标互挂，或要求初始化/检查谷歌会话。
user-invocable: true
---

# 外链自动发布（backlink-publish）

你运行的是一套**有纪律的发布流水线**，不是随手发帖。两条铁律高于一切：

1. **幂等**：一个条目只允许一次"最终提交"动作，一个来源对一个网站只发一次——发布前先验证发布记录和状态（见单条目循环第 1 步），已提交/已上线的条目自己跳过，绝不重复发布。提交后拿不到明确回执（结果未知）时，回写 `failed + manual_required`，**绝不自动重试**。
2. **诚实回写**：`live` 必须是你亲自抓取公开页面并确认包含目标链接后的结论；"提交成功但待审核"只能回写 `submitted`。

## 执行流程

收到"发外链"（或输入 `/backlink-publish [批次号]`）后：消息里已带具体批次号时跳过第 1 步直接认领执行。

1. `backlinks batch_list` → **必须调用 `ask_user_question` 工具**把批次渲染成可点击选项卡让用户选，不要只在对话里贴列表让用户打字：每个选项 `label` = "批次 <id> · <待发布数>条"，`description` = 站点类型 + 日期概要；最近 4 个批次作为选项，其余引导用户用自定义输入填批次号。**用户点选后才继续；若问题卡被取消、跳过或未获回答，立即停止本流程，绝不认领任何批次（包括推荐项），向用户说明并等待明确指示。**
2. `backlinks batch_get <id>` → 展示条目并先做**已发布分区**：条目 `publishStatus` 为 `submitted`/`live`（已提交/已上线）或 `publishedUrl` 非空 = 已发布；同批次内同 `sourceId` 的其余条目同样视为已发布。已发布条目本次**不认领、不执行**（认领会被后端拒绝），汇总时单列"已发布跳过"；各卡的候选项只覆盖其余条目。再用 ask-user 依次确认三张卡：
   a. **范围**：全部 / 仅待发布 / 手选；
   b. **执行模式**（本次运行生效）：
      - `智能匹配（推荐）`：只发布类型可识别的外链站——勘察后能匹配六类剧本之一才发；类型不识别的条目回写 `skipped`（failureReason 注明"类型不识别，智能匹配模式下跳过"）。
      - `全部尝试`：不做类型筛选，所有条目都尝试发布——已知类型仍用对应剧本提速，未知类型走通用主循环（勘察→注册→提交→核验→回写）；绝不因类型跳过，结局交给诚实回写。
   未回答模式卡时默认 `智能匹配`；无人值守（headless）任务里以任务描述声明的模式为准。
   c. **停靠模式**（本次运行生效，决定结束后浏览器的去留，影响内存占用）：
      - `保留停靠页`：人工介入（CAPTCHA/登录墙）的标签页跨会话保留，浏览器保持待命；运行结束只关工作标签。适合人工介入多、想空闲时集中处理的节奏。
      - `结束即关浏览器`：运行结束 `browser closeBrowser` 关闭整个浏览器——登录态仍在持久 profile 里无损，下次发布自动恢复；人工介入请趁运行中当场完成，或下次重跑再处理。适合内存紧张或批次间隔长的场景。
      未回答时默认 `保留停靠页`；无人值守（headless）任务里以任务描述声明的模式为准，未声明默认 `保留停靠页`。
3. `backlinks batch_claim <id> [itemIds]` 获得租约，记下 `leaseId`。
4. **选择执行拓扑**：
   - **条目 ≥3 且分布在不同域名** → 用并发拓扑（默认并发 3）：
     a. 按 `sourceHost` 把条目分组——**同域名的条目必须进同一组串行**（防频控）；
     b. 一次回复里并发调用 `subagent` 工具派出至多 3 个子任务（或逐个以 run_in_background 派发再轮询）。每个子任务的提示词必须包含：该组全部条目的完整信息（id/sourceId/sourceUrl/submitUrl/category/anchors/tags/notes/publishStatus/publishedUrl）、`leaseId`、本次运行的停靠模式（保留停靠页/结束即关浏览器）、以及这段话（子任务不会加载技能文件，五段硬纪律全靠这段话送达）："你是并行发布子任务。执行模式：{智能匹配|全部尝试}。先用 browser navigate 并带 page:"组名" 打开专属标签页，此后每一条 browser 命令都必须带同一个 page 参数。五条硬纪律：(1) 勘察——判'无评论区/无入口'前必须依次 waitFor 常见锚点（#comments/#respond/[id*='comment']/iframe）或等 3-5 秒、press End 滚到页底、见'Load comments'类按钮先点击、快照里的 iframe 用 frame() 前缀进入、兜底 navigate 到 URL#comments；全走完仍无才 skipped，措辞固定'评论区延迟加载探测后仍不存在'，禁止凭一次首屏快照判'静态页面'。(2) 带链——表单有 Website 字段优先填字段；contenteditable 富文本框/带工具栏禁止把 <a> 当文本输入（会被原样转义），必须先输观点句、选中锚文本、点工具栏链接按钮填 targetUrl；真纯文本框才直写 <a href="targetUrl">anchorText</a>；BBCode 框用 [url=targetUrl]anchorText[/url]；一段只嵌 1 个链接，锚文本融进观点句。(3) 核验与查重——aria 快照 role:link 且名称含锚文本才算链接嵌上，目标 URL 裸字符串（含被转义的 <a> 文本）不算；'目标站已存在本站链接'同口径，自己被转义的旧评论不算已发布；转义回写 failed + manual_required 绝不重发。(4) 注册——评论区/发帖要求登录时先自助注册：进 Sign Up/Register 走邮箱注册表单，backlinks mailbox_create 必须带两个参数（localPart=随机前缀、domain=screwdom.org，缺 domain 会直接报错）拿邮箱 → 填表注册 → backlinks mail_wait（默认等 120 秒）拿验证码/链接 → 完成验证后回来登录发布。'要求登录'本身不是人工事件——Wix 'Log in to publish as a member' 这类能一次性邮箱注册的登录墙是正常流程；仅 reCAPTCHA/人机验证、仅 Google OAuth 且会话未初始化、或注册被拒才回写 failed + manual_required。已发布的条目回写 skipped 绝不重复提交；每条完成立即用 backlinks item_result（带 leaseId）诚实回写；人机验证墙回写 manual_required 并 bringToFront 保留标签页；不要认领批次、不要 lease_release、不要问用户问题。(5) 标签——组内条目依次复用同一专属标签页；条目挂起 manual_required 时把当前标签保留为停靠页（bringToFront 召回窗口），用新的 page 参数（如 "组名-2"）新开标签继续后续条目；临时弹窗（OAuth 授权窗等）用完即 closePage；返回前按停靠模式收尾——保留停靠页模式 closePage 关闭自己开的全部非停靠标签（停靠页留着等人工），结束即关模式直接返回、由主任务统一关闭浏览器。"
     c. 等待子任务期间，主任务每约 60 秒调一次 `lease_heartbeat` 保活租约；
     d. 全部子任务返回后核对各条目回写状态，`lease_release`，输出汇总表（含每条的 live/submitted/failed/skipped，另单列本次"已发布跳过"的条目）。收尾按停靠模式：结束即关 → `browser closeBrowser`；保留停靠页 → 子任务已各自关闭工作标签，主任务只需关闭自己开过的工作标签，停靠页留着等人工。
   - **条目 <3 或集中在同一域名** → 串行拓扑：自己逐条执行单条目循环，每 1-2 个条目 `lease_heartbeat`，结束后 `lease_release` 输出汇总；收尾同并发拓扑：结束即关 → `browser closeBrowser`，保留停靠页 → 关闭工作标签仅留停靠页。

## 单条目循环

对每个 item（顺序执行，同域连续操作之间自然停顿）：

1. **发布前验证（防重复发布）**：动手前先核对发布记录和状态——
   - 条目 `publishStatus` 为 `submitted`/`live` 或 `publishedUrl` 非空，或同批次同 `sourceId` 条目已发布 → 已发布，**不要打开目标站提交**：已认领的回写 `skipped`（skipReason："发布记录已存在：<publishStatus 或 publishedUrl>，跳过重复发布"），继续下一条；
   - 勘察目标站时检索本站域名/目标 URL（站内搜索、列表页查找）：能找到本站链接 → 同样回写 `skipped`（"目标站已存在本站链接，跳过重复发布"）。已提交待审的来源优先复核公开页，确认已上线可直接回写 `live`（用已有 publishedUrl 作 publicUrl），仍未见则维持跳过，**绝不再提交一次**。
2. **选择 playbook**：先 `snapshot format=aria` 勘察实貌，按特征匹配剧本（导航=提交流表单、博客=评论区、论坛=版块发帖、内容=长文投稿、游戏=截图/平台字段、工具=定价/截图字段）；条目 `category` 仅作提示，与实貌冲突时以实貌为准并在 evidence 注明。
   - **智能匹配模式**：勘察后六类都不匹配 → 该条回写 `skipped`（"类型不识别，智能匹配模式下跳过"），继续下一条；
   - **全部尝试模式**：不匹配 → 直接走通用主循环发（本技能 5-8 步），绝不因类型跳过。
 `submitUrl` 优先于 `sourceUrl`。
3. **勘察优先**：先 `browser navigate` + `snapshot format=aria` 只读了解页面结构（aria 快照带 role 和名称），再动手填写。异步挂载的区块（评论区、Disqus 类 iframe、折叠面板）常缺席于首屏快照——判"无评论区/无入口"前必须依次：`waitFor` 常见锚点（`#comments`/`#respond`/`[id*='comment']`/`iframe`）或等 3-5 秒再 snapshot → `press` End 滚到页底再 snapshot → 见「Load comments」类按钮先点击再 snapshot → 快照里的 iframe 用 `frame()` 前缀进入 → 兜底 `navigate` 到 `URL#comments`。全走完仍无才回写 `skipped`（措辞固定："评论区延迟加载探测后仍不存在"），禁止凭一次首屏快照下"静态页面无入口"的结论。
4. **语义寻址**：定位元素优先用 aria 快照里看到的语义选择器——`role:button|Create Account`、`label:Email`、`placeholder:you@example.com`、`text:Sign in`；CSS 只作兜底；表单在 iframe 里时加 `frame(<iframe css>)>>` 前缀；截图后可 `xy:<x>,<y>` 坐标点击。禁止不看清 aria 快照就猜 CSS。
5. **需要注册/登录？** → 先 `snapshot format=aria` 看登录/注册页，按决策树走（细节见 [references/google-session.md](references/google-session.md)）：
   - 页面有 "Continue with Google"（或同类 Google OAuth 按钮）→ 先 `browser navigate` 到 `https://accounts.google.com` 确认谷歌会话（检查完 navigate 回站点登录页）：
     - 已登录（显示账号头像/邮箱）→ 回到站点点 Google 按钮 → 账号选择器点账号（若只有一个账号多数站直接跳过）→ 授权页点 Allow/Continue → 跳回站点继续发布流程。授权弹窗若是新开窗口，操作会自动切到最后打开的页。
     - 未登录 → 回写 `failed + manual_required`，原因写"谷歌会话未初始化或已过期，请对智能体说『初始化谷歌会话』"。
     - Google 弹"确认是你本人"/二次验证 → 同样回写 manual_required 等人工处理一次。
   - 有邮箱注册表单 → 先 `backlinks mailbox_create`（`localPart`=随机前缀、`domain`=screwdom.org，**两个参数都要给，缺 domain 直接报错**）→ 注册 → `backlinks mail_wait`（默认等 120 秒）拿 `code`/`link` → 完成验证 → 登录。**"要求登录"本身不是人工事件**——Wix "Log in to publish as a member" 这类能一次性邮箱注册的登录墙走本路径，不要回写 manual_required。
   - 只有 CAPTCHA/其他墙 → 先 `browser bringToFront` 把窗口召回前台，再按现有人工兜底规则挂起（浏览器在屏幕外静默运行，人工时必须召回）。
6. **填写与提交**：锚文本和目标 URL 从 batch 详情的 `anchors` 里选（优先第一个 active 项）。评论/正文框的带链方式按框型选：表单有 Website 字段 → 填字段、正文不带链；**contenteditable 富文本框/带工具栏（Wix 博客评论框即此类）禁止把 `<a>` 当文本输入——会被原样转义（pullcommunityoutreach 实证），必须先输完整观点句、选中锚文本片段、点工具栏链接按钮填 targetUrl**；真纯文本框才直写 `<a href="targetUrl">anchorText</a>`；BBCode 框用 `[url=targetUrl]anchorText[/url]`。一段只嵌 1 个链接，锚文本融进观点句读得通。**提交资料优先用批次详情 website 里的"提交资料包"**（shortDescription/longDescription/logoUrl/screenshotUrl/keyFeatures/pricingType 有值就直接用，描述按目标站字数裁剪，图片下载后按需裁剪尺寸，evidence 注明"使用后台资料包"）；资料包缺失的项才自行获取（抓网站 og:image / apple-touch-icon、现写该段文案，evidence 注明"该项自获取"）。核心事实（名称/URL/特性）以后台资料为准，措辞可微调贴目标站调性。提交前 snapshot 复查关键字段。
7. **核验**：提交后 `browser navigate` 到公开列表页（非预览）+ `snapshot`，确认目标链接以**可点击链接**出现（aria 快照 `role:link`，名称含锚文本或指向 targetUrl）。目标 URL 以裸字符串出现——包括被转义显示的 `<a href=…>` 文本——不算链接嵌上；嵌链被转义 → 回写 `failed + manual_required`，绝不重发。**查重（"目标站已存在本站链接"）同口径：只认可点链接，裸文本 URL 不算**——自己被转义的旧评论不是已发布，不能挡住重发。
8. **回写**（`item_result`）后**立即自动打标**（`source_tags`，参数 `sourceId` 取条目的 sourceId，`tags` 按本次观察多选，幂等只加不删）：
   - 站点未要求徽章即可提交（打了 `付费` 的站点不加）→ 加 `免徽章`
   - 站点要求挂徽章/徽标验证 → 加 `要徽章`
   - 本条发布成功（live 或 submitted）→ 加 `可复用`
   - 遇到 Cloudflare 盾（Turnstile/质询页，无论过没过）→ 加 `有盾`
   - 只有付费才能提交（付款墙是唯一提交途径；有免费途径的不加，即使同时提供付费加速）→ 加 `付费`
   把所打标签记进 evidence。回写内容：
   - 核验通过 → `live` + publicUrl + anchorText + targetUrl + evidence（一句话证据）
   - 明确"已提交待审核" → `submitted`
   - CAPTCHA/登录墙/需人工 → `failed` + `manual_required` + 原因（该标签保留为停靠页不关，新开标签继续后续条目）
   - 瞬时错误（超时/网络）→ `failed` + `retryable`
   - 付费/停服/资格不符 → `skipped` + 原因
9. 对方要求先挂互换徽标时（"reciprocal/featured badge"），按此流程**在提交前完成**：
   a. 从对方站点的徽标区拿到徽标 HTML（通常有 Light/Dark/Auto 三种，选一种）→ `backlinks badge_add`（`websiteId` 用批次里的网站 id，`name` 用对方站名）。
   b. **必须让徽标真正上线**：badge_add 返回 `callbackTriggered`；无论真假，都用 bash `curl -s "https://<我方站点host>/footer/refresh"`（supermanager 里该网站配置的回调地址）触发一次站点刷新。
   c. **必须实测确认**：`curl -s "https://<我方站点host>/"` 并 grep 对方域名，徽标 HTML 出现在页面里才算生效；没出现等 5 秒重试，最多 3 次。仍不出现 → 回写 `manual_required`（原因写"徽标已入库但站点未刷新"）。
   d. 线上确认后，才回到对方站点做 Verify Backlink/提交。若徽标此前已挂过（curl 已能 grep 到），直接跳到 d，不要重复 badge_add。

## 人工兜底（持久会话）

浏览器 profile 是持久的。遇到 CAPTCHA/首次登录：把当前标签保留为停靠页（bringToFront 召回窗口），回写 `manual_required`，新开标签继续下一条。用户在浏览器窗口里人工过一次验证后，重跑该批次即可自动复用会话。

批次结束时浏览器的去留由发布前的**停靠模式**选择决定：`保留停靠页` = 停靠页跨会话存活等用户空闲时处理，工作标签全部关闭；`结束即关浏览器` = `closeBrowser` 全部关闭，登录态在持久 profile 里无损，人工介入改在运行中当场完成或下次重跑时处理。用户随时说「关闭浏览器」可立即 `closeBrowser` 释放内存。

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
