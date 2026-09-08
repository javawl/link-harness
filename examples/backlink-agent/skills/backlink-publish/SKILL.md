---
name: backlink-publish
description: 本工作区所有"发外链/发布外链/发布批次/跑批次/继续批次"请求的首选且唯一入口：从批次系统(supermanager)拉批次列表、认领租约、用指定浏览器在各目标站隔离发布、cloud-mail 收验证码、逐条回写结果与徽标。附带"初始化谷歌会话"引导（用户要在共享浏览器里登录 Google 账号时使用）。凡用户要求实际执行外链发布，必须用本技能，不要用其他 SEO/GEO 类技能替代（那些只讲策略不执行）。
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
2. `backlinks batch_get <id>` 默认只返回计数和最多 3 个 `nextItemIds`；用 `view: items, itemIds: [...]` 读取这一小页资料，禁止反复读取 `view: all`。工具在代码中排除已发布来源并去重，每个来源每个会话只认领一次。核对**已发布分区**：条目 `publishStatus` 为 `submitted`/`live`（已提交/已上线）或 `publishedUrl` 非空 = 已发布；同批次内同 `sourceId` 的其余条目同样视为已发布。已发布条目本次**不认领、不执行**（认领会被后端拒绝），汇总时单列"已发布跳过"；两张卡的候选项只覆盖其余条目。仅对尚未确定的选择用 ask-user 确认：
   a. **范围**：全部 / 仅待发布 / 手选；
   b. **执行模式**（本次运行生效）：
      - `智能匹配（推荐）`：只发布类型可识别的外链站——勘察后能匹配六类剧本之一才发；类型不识别的条目回写 `skipped`（failureReason 注明"类型不识别，智能匹配模式下跳过"）。
      - `全部尝试`：不做类型筛选，所有条目都尝试发布——已知类型仍用对应剧本提速，未知类型走通用主循环（勘察→注册→提交→核验→回写）；绝不因类型跳过，结局交给诚实回写。
   用户已经声明或本会话已经确认的范围和模式直接沿用，只询问缺失项。未回答模式卡时默认 `智能匹配`；无人值守（headless）任务里以任务描述声明的模式为准。
3. 先建立下文的整批执行 Goal，然后调用 `backlink_publish`，传 `batchId`、已确认的 `scope`（`pending` / `retryable` / `all`）和 `mode`（智能匹配=`smart`，全部尝试=`all`）；手选时附上完整的已确认 `itemIds`。**不要先 batch_claim，不复制子任务提示词，不另开 subagent，也不手动续租或轮询。** `backlink_publish` 是前台调用，运行时保留一个租约，最多同时执行 3 个条目，同域名串行，完成一个就补一个。
4. 返回值中的 `attempted` 是本次实际派发条目数，`remaining` 是该次选择中未派发的数量，`counts` 分列回写状态。`live` 与 `submitted` 分开报告，待审核不等于公开上线。`unresolvedItemIds` 是已尝试但结果无法确认、已跳过后续派发的条目；单列交人工核对，不重新认领、不重发，不为消除 pending 把后台改成 skipped。`remaining=0` 且 `stoppedReason=null` 时该范围执行结束，可以完成 Goal 并列出未决项，无需反复调用或等待这些条目解除阻塞。已记录的失败如实列出，不为消除失败数自动重试。
5. `stoppedReason` 非空表示全局错误、取消或资源不足导致提前停止。模型额度、鉴权、租约和检查点错误停止新派发，等待在途任务结束；单项预算、回写核对和清理失败由运行时跳过并继续其他条目，未启动条目保持待处理。先核对全局诊断、后台结果和保留页面，不把未派发条目标为失败，也不立即重复调用。用户已授权继续的范围可以在全局问题解决后沿用原 scope 再调用；未知提交和 manual_required 不自动重派，手选范围不扩大到整批。

## 多浏览器与网站绑定

用户指定浏览器时先用 `browser_list` 核对 id。单批次向 `backlink_publish` 传 `browserId`；未指定时按网站已保存绑定、部署默认浏览器的顺序选择。任何已指定或已绑定浏览器不可用时停止，不得换用其他登录状态。

用户选择多个批次一起发布时，调用 `backlink_publish_many`，传 `batches: [{ batchId, browserId?, itemIds? }]` 以及已确认的 `scope`、`mode`。保留用户给出的逐批次浏览器分配。不同浏览器和网站可以并行；同一浏览器或同一网站的批次按传入顺序执行。每个浏览器内保持部署配置的条目并发数，同目标主机串行。返回 `results` 逐批次记录结果，`pendingBatchIds` 表示尚未派发的批次；任何停止或错误先核对，不能把未派发批次算作完成。

发布控制台的「添加 / 绑定浏览器」可以保存独立登录目录或本机 Chrome/Edge 调试地址；每个实例必须使用不同目录与调试端口。「绑定网站」保存默认选择，「本次浏览器」只覆盖本次执行。所有浏览器操作、公开链接核验、回执读取与页面清理都必须保留分配的 `browserId` 和 `page`，不通过其他浏览器工具或命令行访问其他实例。

## 整批执行目标

范围与模式确认后、首次发布前，调用 `get_goal`；没有本任务 Goal 时，用 `create_goal` 记录批次 id、scope、执行模式，以及“对所选范围的每个可执行来源尝试一次，保存可确认结果，跳过并单列无法核对的条目，结清在途任务和租约”。已有同任务 Goal 时沿用，不覆盖无关 Goal，不自行增加轮数。

进度汇报和单条预算耗尽不代表整批结束。运行时返回 `remaining=0` 且 `stoppedReason=null` 时标记 complete，并明确列出跳过派发、待人工核对的 `unresolvedItemIds`。这些单项问题不阻塞 Goal，也不通过额外复核轮次消耗模型请求。全局错误或资源不足时保留真实状态，遵守 Goal 的 blocked 条件。后台待审、失败和已发布跳过分别列出。

## 子任务与页面

固定的勘察、注册、带链和核验纪律由[发布配置](../../cordis.yml)的 publisher persona 注入一次；父任务只选择范围，不复制纪律或批次资料。每个子任务只获得本条资料、website、anchors、租约和专属页面。每条保留累计 600K token、40 步、10 分钟和相同参数失败 3 次的预算，运行时在模型请求之间检查。

运行时在认领或启动付费子任务前预留页面，并在工具执行器中把子任务绑定到该页和条目；省略 page 使用专属页，显式传其他页会拒绝。子任务只能调用 browser 和 backlinks，Bash 调用在执行前被拒绝；所需本地上传文件须在发布前准备好。click/press 必须声明 `submission=false`（导航或账户操作）或 `submission=true`（最终发布）；最终发布只允许派发一次，之后仅作只读核验及导航；终态回写后禁止继续输入或导航。尝试记录在首次请求模型前刷写到父会话日志，取消或恢复后仍有效。该标记记录智能体声明的用途，不能识别任意网站脚本的隐式提交。

局部 snapshot 的 text、aria、form、links 使用相同的语义选择器和 frame 前缀。`form` 返回字段属性与当前值（不返回密码值）；`links` 返回可见锚文本和真实 href。已知字段用一次 `fill fields:[{selector,value}]` 顺序填写；后续字段失败不撤销前面的填写，提交必须另行操作。

`live` 与 `submitted` 都要求已声明最终提交，预先存在的外链记为 skipped。`live` 的 publicUrl 须属于本条来源或提交地址的主机，且与推广站和目标地址主机不同，并在页面找到真实目标 href；裸字符串和转义 HTML 不算链接。`submitted` 必须提供当前页面可读的确认原文 `receipt`，只是待审。长页面使用 `verificationSelector` 缩小核验范围。回写响应丢失时运行时先读取后台，避免覆盖已保存发布。

未声明最终提交、没有不确定输入的中断可记为 retryable。已派发最终提交但缺回执或 `BROWSER_ACTION_UNCERTAIN` 保留为 manual_required，页面也保留，不自动重试。验证码或人工登录须记录 manual_required；若没有最终提交或不确定输入，终态失败回写后由运行时回收本条页面。成功、已提交和跳过的本条页面也由运行时清理，其他页面保持原状。

部署设置 `maxOpenPages: 0`，保留页面不设总数上限；执行中的条目仍最多三个，同一目标主机串行。不要关闭未知归属或未知提交页面。独立锚点未配置时，默认使用对应网站详情（`/websites/<websiteId>/edit`）已保存的名称作为锚文本、网址作为目标 URL，显式锚点优先。描述、图片、功能等继续使用该网站的提交资料包。仅当名称或 HTTP(S) 网址也不可用时，运行时在开页、认领或请求模型前停止；不要编造资料，也不要把同一个网站资料缺失逐条记为发布失败。

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
