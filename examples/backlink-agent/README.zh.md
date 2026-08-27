# backlink-agent — 外链自动发布操作员

[English](README.md) | 中文

端到端运行 supermanager 批次发布工作流：选批次、在唯一的共享持久 Chromium 里逐站发布、经 cloud-mail 接收验证邮件、核验公开列表页、逐条回写结果。CAPTCHA 与首次登录会把条目挂起为 `manual_required`，同时保持有头浏览器窗口开着等人工处理一次；持久 profile 随后带着会话继续自动跑。

## 前置条件

- supermanager 已运行，并在 系统设置 → Agent 接口 创建了令牌 → `SUPERMANAGER_TOKEN`
- cloud-mail Open-API 令牌 → `CLOUDMAIL_TOKEN`
- 本机 Google Chrome（Playwright 提供方的默认渠道）

## 运行

```sh
SUPERMANAGER_TOKEN=smag_… CLOUDMAIL_TOKEN=… \
  pnpm dsh --patch examples/backlink-agent/cordis.yml "发外链"
```

agent 会列出批次、请你选择批次与范围、认领租约，最后输出逐条汇总。直接说「执行批次 176」可跳过选择；人工解除浏览器挑战后，manual_required 条目会在下次运行自动回到队列。

## 新电脑接入

新 Mac 一次性安装：`bash examples/backlink-agent/setup.sh <仓库地址>`（自动装 Node 24/pnpm、克隆、装依赖、从 `.env.example` 生成 `.env`）。日常启动：`bash examples/backlink-agent/start.sh`。supermanager 地址由 `.env` 里的 `SUPERMANAGER_BASE_URL` 决定（生产域名或本地 dev 实例），组合文件本身无需按机器修改；每台电脑在后台单独创建 Agent 令牌，审计记录按令牌区分。

## 快捷入口

在网页输入框输入 `/` 会弹出技能触发选择器；消息里出现 `/技能名` 即注入该技能全文：

- `/backlink-publish` —— 弹可点击批次选择卡开始发布；第二张卡选执行模式——智能匹配（只发类型可识别的站，未知类型跳过）或全部尝试（任何站点都尝试发布，不因类型跳过）
- `/backlink-publish 176` —— 直接发布批次 176
- `/google-session` —— 初始化或检查共享浏览器的谷歌会话

## 组合

| 条目 | 角色 |
|---|---|
| `llm-deepseek`（禁用）+ `llm-pi-ai` | OpenAI 兼容网关上的模型适配器（密钥来自根目录 `.env`） |
| `agent-spine` | 每次运行一个 `main` agent，会话持久化在 `./.sessions` |
| `skills`（`dsh-skill-filesystem`） | 来自 `./skills` 的六类 playbook `backlink-publish` 技能 |
| `browser` + `browser-playwright` + `tool-browser` | 共享持久 Chromium，默认有头 |
| `backlinks` + 两个提供方 + `tool-backlinks` | 批次工作源（supermanager）与邮箱（cloud-mail） |

分站点类型 playbook 位于 [`skills/backlink-publish/references/`](skills/backlink-publish/references/)；状态模型与回写契约和后端 `/api/agent/*` 一一对应。

## Google 登录站

很多目录站只提供 "Continue with Google"。对智能体说一次「**初始化谷歌会话**」：它把共享浏览器停在 `accounts.google.com`，你在弹出的 Chrome 窗口里亲手完成登录（含 2FA），会话 cookie 就持久化在共享 profile 里供之后所有批次使用。此后智能体会全自动完成 OAuth 跳转（选账号 → Allow → 跳回站点）；会话过期时条目会以 `manual_required` 挂起并提示重新初始化。建议使用专用 Google 账号——目录站会拿到该账号的基本资料授权。细节见 [`references/google-session.md`](skills/backlink-publish/references/google-session.md)。
