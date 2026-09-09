# backlink-agent — 外链自动发布操作员

[English](README.md) | 中文

backlink-agent 是运行在你自己电脑上的外链发布智能体：它从 supermanager 后端拉取发布批次，在唯一的共享持久 Chrome 里逐站完成注册/登录/提交，经 cloud-mail 接收验证邮件并提取验证码，核验公开列表页确认外链可见，最后把每一条结果诚实回写回后端。你只需要选批次、做首次站点登录、以及处理偶发的验证码——其余全部自动。

## 工作方式

一次典型的发布运行：智能体调用后端 Agent 开放接口列出待发批次，你选定批次与范围；认领前先做已发布分区——发布记录为 `submitted`/`live`（已提交/已上线）的来源、或目标站上已能找到本站链接的来源，本次直接跳过并如实上报，**绝不重复发布**。随后认领租约（到期时间和互斥窗口由后台管理），按站点类型选择对应 playbook 驱动共享浏览器逐条发布；遇到 CAPTCHA 或首次登录时，该条目挂起为 `manual_required` 并保留原始标签页，通过通知说明浏览器和页面；智能体不激活、还原或移动窗口。你可手动最小化独立 Chrome 或将其放到其他桌面，等你人工处理一次后，持久 profile 里的会话会让后续同站条目全自动通过。每条结果按状态模型回写：`live`（已核验公开可见）、`submitted`（已提交待对方审核）、`failed`（含待人工与可重试两类）、`skipped`（已发布跳过/付费/资格不符）。结果未知时绝不重试提交，宁可标记待人工——发布记录永远诚实。

[覆盖层](cordis.yml)通过 `backlink_publish` 在一次前台调用中处理已确认的批次范围：保留一个租约，最多三个子任务滚动补位，同一目标主机串行。运行时在付费工作前预留页面，把每个子任务绑定到一页和一个条目，核对真实 href 或回执原文，并在取消后核对结果再释放租约。父任务只接收计数；条目资料直接传给子任务，固定纪律由 persona 提供。Web 预设覆盖移除仓库指令、本地技能发现及无关的编码与委派工具。提供方拥有的[子任务预算](../../packages/subagent/subagent-in-process-driver/README.zh.md#work-budgets)及现有模型选择继续生效。组合变化须重启应用；新会话可避免继续携带旧编码上下文。未知提交保持待人工状态。发布子任务只能调用 browser 和 backlinks；所需本地上传文件须在发布前准备好。

部署设置 `maxOpenPages: 0`，保留页面不会阻断后续发布；执行中的条目仍受三个发布槽位约束。已确认结果及最终提交前已保存的 retryable 失败会释放自有标签页。待人工失败、未知提交与不确定输入保留页面，因此仍须监督浏览器内存。Chrome 重启时恢复保留标签页，页面引用会重新分配。没有显式锚点时，使用已保存的网站名称和网址；只有网站资料不可用才阻断预检。尝试记录在请求模型前保存，单项预算不会停止队列中的其他条目。导航等待 DOM 就绪，超时为 20 秒；元素及快照等待为 8 秒。原始按键和坐标输入也限制等待 8 秒：结果未知时锁定并保留页面交人工核验，绝不重新提交。[并发快照](tests/parallel.snapshot.ts)通过脚本化模型响应检查原生子任务分组执行。容量限制和弹窗行为见[浏览器提供方](../../packages/browser/browser-playwright/README.zh.md)。

范围与模式确认后，发布技能在首次认领前创建或恢复批次 Goal。每一页使用相同的工具 scope；仅待发布任务不扫描失败重试条目。remaining 为零且 stoppedReason 为 null 时完成 Goal，把 unresolvedItemIds 单列为跳过派发、待人工核对的条目；它们不阻塞其他来源，也绝不自动重发。stoppedReason 非空时须先排查，再决定是否继续发布；见[publisher 停派与核对规则](../../packages/backlinks/tool-backlinks/README.zh.md#foreground-batch-publication)。[范围快照](tests/selection.snapshot.ts)覆盖有界分页耗尽及控制台按批次 id 降序排列，不执行外部发布。

## 新电脑接入（三步）

1. **安装（每台电脑一次）**：`bash examples/backlink-agent/setup.sh <仓库地址>`。自动安装 Node 24 与 pnpm、克隆仓库、装好依赖。发布批次时本机需要 Google Chrome，安装脚本会检测并提示。
2. **启动**：`bash examples/backlink-agent/start.sh`。启动只依赖 node，浏览器自动打开 `http://127.0.0.1:8787`。
3. **配置令牌（网页设置页，保存即生效）**：首次启动后在网页设置页填写三个令牌与后端地址，无需编辑任何文件——`NEWAPI_API_KEY`（模型网关令牌，团队共用）、`SUPERMANAGER_TOKEN`（在 supermanager 系统设置 → Agent 接口为这台电脑单独创建，审计按令牌区分）、`CLOUDMAIL_TOKEN`（收验证邮件用，共用）；supermanager 地址生产环境填 `https://link.screwdom.org`（默认是本地开发地址）。

配置的优先级：网页设置页 > 组合文件预置 > 环境变量与仓库根 `.env`（模板见 [`.env.example`](.env.example)，仅供批量引导机器时使用）。修改设置页里的令牌或地址后立即生效，无需重启。

## 日常使用

在网页输入框输入 `/` 会弹出技能触发选择器；消息里出现 `/技能名` 即注入该技能全文：

- `/backlink-publish` —— 弹出可点击的批次选择卡开始发布；第二张卡选执行模式——智能匹配（只发类型可识别的站，未知类型跳过）或全部尝试（任何站点都尝试发布，不因类型跳过）
- `/backlink-publish 176` —— 直接发布批次 176
- `/google-session` —— 初始化或检查共享浏览器的谷歌会话

也可以无界面一次性运行：`pnpm dsh --patch examples/backlink-agent/cordis.yml "发外链"`。直接说「执行批次 176」可跳过选择；`manual_required` 条目须在后台复核、重新开放，再用新的发布会话处理。

## 组合

| 条目 | 角色 |
|---|---|
| `llm-deepseek`（禁用）+ `llm-pi-ai` | OpenAI 兼容网关上的模型适配器（密钥可来自设置页或 `.env`） |
| `agent-spine` | 每次运行一个 `main` agent，会话持久化在 `./.sessions` |
| `skills`（`dsh-skill-filesystem`） | 来自 `./skills` 的六类 playbook `backlink-publish` 技能 |
| `browser` + `browser-playwright` + `tool-browser` | 共享持久 Chrome，默认有头，人工可随时接管 |
| `backlinks` + 两个提供方 + `tool-backlinks` | 批次工作源（supermanager）与邮箱（cloud-mail），令牌与地址均可在设置页配置 |

分站点类型 playbook 位于 [`skills/backlink-publish/references/`](skills/backlink-publish/references/)；状态模型与回写契约和后端 `/api/agent/*` 一一对应。

## Google 登录站

很多目录站只提供 "Continue with Google"。对智能体说一次「**初始化谷歌会话**」：它把共享浏览器停在 `accounts.google.com`，你在弹出的 Chrome 窗口里亲手完成登录（含 2FA），会话 cookie 就持久化在共享 profile 里供之后所有批次使用。此后智能体会全自动完成 OAuth 跳转（选账号 → Allow → 跳回站点）；会话过期时条目会以 `manual_required` 挂起并提示重新初始化。建议使用专用 Google 账号——目录站会拿到该账号的基本资料授权。细节见 [`references/google-session.md`](skills/backlink-publish/references/google-session.md)。

## 安全提醒

Agent 令牌等于数据写入口：每台电脑单独一枚、不要发给别人或提交进 git；泄露后在 supermanager 系统设置 → Agent 接口里撤销重建。设置页中的令牌字段在界面上脱敏显示，存储于本机 `~/.dsh/` 下，不会进入会话记录。
