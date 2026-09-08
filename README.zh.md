# Link Harness — 外链自动发布 Agent 平台

[English](README.md) | 中文

基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`，由 Cordis 驱动的开源 agent harness）特化的 fork，改造为**专业的外链自动发布 Agent 平台**。智能体从外链管理系统（supermanager）读取发布批次，驱动真实 Chrome 浏览器在导航/博客/论坛/内容/游戏/工具六类站点上自动发布，核验公开页面，并将每条结果诚实回写、自动打标。

## 做什么

```
侧边栏"发布批次"Tab 点击一个批次 → 选范围 + 执行模式
  → 智能体认领租约，并发派发子任务（同域名串行、不同域名各占标签页并行）
      → 勘察目标站（aria 快照 + 语义选择器定位）
      → 需要注册 → cloud-mail 自动建一次性邮箱 + 收验证码
      → Google OAuth 站 → 用播种的谷歌会话自动通过
      → 填表优先用后台维护的网站资料包（简介/Logo/截图）
      → 提交 → 核验公开页 → 诚实回写（live/submitted/failed/skipped）
      → 自动打标：免徽章 / 要徽章 / 可复用 / 有盾
  → 释放租约 → 输出逐条汇总
  CAPTCHA → 浏览器窗口自动召回前台，人工点一次；登录态持久复用
```

三个系统各司其职：**supermanager**（数据与批次）、**link-harness**（本仓库——智能体/技能/控制台）、**cloud-mail**（验证邮箱）。

## 在上游基础上新增的平台能力

| 能力 | 说明 |
|---|---|
| **浏览器能力**（`packages/browser/`） | 持久真实 Chrome、多标签页引用寻址 + 页内锁并发（不同页并行、cookie 共享）、语义选择器（`role:`/`label:`/`placeholder:`/`text:`/`xy:` 坐标/iframe 穿透）、aria 快照、反自动化检测参数、屏幕外静默窗口 + `bringToFront` 召回 |
| **外链能力**（`packages/backlinks/`） | 批次工作源（supermanager）+ 邮箱提供方（cloud-mail）+ 模型可见工具：认领/心跳/释放/逐条回写、互换徽标全流程（入库→footer 刷新→实测上线→验证→提交）、源站自动打标、网站资料包透传 |
| **发布控制台**（`packages/client/ui-backlinks-console/`） | 侧边栏 Tab：批次行卡片、状态徽章、执行中呼吸点、行内条目详情、搜索、30 秒自动轮询、一键发布直达新会话 |
| **发布技能**（`examples/backlink-agent/skills/`） | 六类站点剧本（导航/博客/论坛/内容/游戏/工具）、双执行模式（智能匹配/全部尝试）、按域名分组的并发拓扑、谷歌会话管理 |
| **控制台 Remote**（`packages/backlinks/console/`） | 只读 Remote 服务，把批次数据暴露给 Web 控制台 |

## 快速开始

### 前提

- Node.js ≥24、pnpm 9+、Google Chrome

### 一次性安装

```sh
git clone https://github.com/javawl/link-harness.git
cd link-harness
pnpm install
pnpm run build
```

在仓库根目录建 `.env`：

```sh
NEWAPI_API_KEY=sk-…          # 模型网关（任意 OpenAI 兼容端点）
SUPERMANAGER_TOKEN=smag_…    # supermanager → 系统设置 → Agent 接口 → 创建
CLOUDMAIL_TOKEN=uuid         # cloud-mail Open API 令牌
# SUPERMANAGER_BASE_URL=https://link.screwdom.org  # 切生产时取消注释
```

### 运行

```sh
pnpm dsh web --patch examples/backlink-agent/cordis.yml --port 8787
```

浏览器打开 `http://127.0.0.1:8787` ——侧边栏出现**发布批次** Tab。

### 新电脑接入

```sh
bash examples/backlink-agent/setup.sh    # 自动装 Node 24/pnpm、克隆、生成 .env 模板
bash examples/backlink-agent/start.sh    # 日常启动
```

### 日常使用

| 动作 | 方式 |
|---|---|
| 发布批次 | 侧边栏 → 发布批次 Tab → 点批次行的[发布]按钮 |
| 对话发布 | `/backlink-publish`（弹卡片选择）或 `/backlink-publish 176`（直达） |
| 播种谷歌会话 | `/google-session` ——在弹出的 Chrome 里亲手登录一次，之后 Google OAuth 站自动通过 |
| 命令行一次性 | `pnpm dsh --profile headless --patch examples/backlink-agent/cordis.yml "发布批次 176"` |

## 网站提交资料包

在 supermanager 编辑网站，填"提交资料包"区：一句话简介、长简介、Logo URL（1:1）、截图 URL（16:9）、核心特性、定价类型。智能体发布时**优先使用这些资料**（描述按目标站字数裁剪、图片下载后按需裁剪），缺失的项才自行获取，evidence 里注明各项来源。

## 源站自动打标

每次发布尝试后，智能体自动给目标站打标签：`免徽章`（不需要徽章）、`要徽章`（要求挂徽章）、`可复用`（发布成功）、`有盾`（遇到 Cloudflare 盾）。标签按名解析到工作区（同名不同 id 不影响），幂等只增不删。

## 架构

保留 DeepSeek Harness 一切皆插件的架构，外链能力是标准的 Cordis 能力面：

```
packages/browser/     browser + browser-playwright + tool-browser + console Remote
packages/backlinks/   backlinks + backlinks-supermanager + backlinks-cloud-mail + tool-backlinks
packages/client/      ui-backlinks-console（侧边栏 Tab + 发布控制台）
examples/backlink-agent/  可运行组合 + 技能（backlink-publish、google-session）
```

harness 核心见 [架构文档](docs/architecture.zh.md)，发布智能体见 [examples/backlink-agent/README.zh.md](examples/backlink-agent/README.zh.md)。

## 开发

请先阅读[开发指南](docs/development.zh.md)与[架构文档](docs/architecture.zh.md)。面向 agent：请遵循 [AGENTS.md](AGENTS.md)。

```sh
pnpm run test      # vitest 单测
pnpm run typecheck
pnpm run lint
pnpm run build
```

## 上游致谢

本仓库 fork 自 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)（commit `b150a551b8`）。上游项目处于开发者预览阶段、快速迭代中；本 fork 将其特化为外链发布平台，差异集中在 `packages/browser/`、`packages/backlinks/`、`packages/client/ui-backlinks-console/` 与 `examples/backlink-agent/`。

## 许可证

[MIT](LICENSE)

第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
