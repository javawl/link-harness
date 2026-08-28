# Agent Note: backlinks 令牌与地址接入 settings 网页配置

Status: implemented

[English](2026-08-27-backlinks-settings-section.md) | 中文

## Problem

把 backlink-agent 部署到操作员机器时，supermanager 与 cloud-mail 的令牌只能通过 cordis.yml config 或环境变量（仓库根 `.env`）提供。非技术用户找文件、改变量极易出错——"缺少 .env"是实际出现的接入工单。harness 已有 settings 能力（`$DSH_HOME/settings.yaml`、热加载、界面脱敏、配置 UI 按 namespace 渲染表单），`llm-pi-ai` 已接入，而这两个 provider 是模型可见能力里唯一仍强迫文件配置的，属于配置面选错而非能力缺失。

## Decision

两个 provider 各注册一个 settings namespace（`backlinks-supermanager`、`backlinks-cloud-mail`），经 `installSettingsSection` 以组合 entry 为 base 挂接：

1. 字段只有用户需要动的 `baseUrl` 与 `token`（`token` 标记 `role('secret')`，配置界面上写而不显）；`requestTimeoutMs` 留在组合层，不进用户设置。
2. 逐字段解析优先级：网页设置用户层 > 组合预置 > `SUPERMANAGER_TOKEN` / `CLOUDMAIL_TOKEN` 环境兜底。settings 变更时 dispose 并按同一 provider id 重注册，保存即生效、无需重启；settings 服务不在场（如最小 headless 组合）或剥离时回退组合 entry 行为，与接入前一致。
3. `validate` 钩子拒绝非 http(s) 的 `baseUrl` 写入（拒绝写入而非存下再失效）；apply 对 entry 的同一校验保持 load-time fail-loud。provider 对空令牌 `available()` 为 false，进程可先启动、后在网页补配置——解除"没令牌起不来 → 没法进网页配令牌"的死锁。
4. 接入脚本同步：`start.sh` 令牌门禁从硬失败降级为缺失提示；`setup.sh` 不再生成 `.env`，Chrome 检测从阻断降为提示。

## Consequences

- 操作员三步接入：setup.sh 安装 → start.sh 启动 → 网页设置页填三枚令牌与生产地址。`.env`/环境变量降级为批量引导手段，仍在解析链内。
- 令牌只存本机 `$DSH_HOME/settings.yaml`，界面上脱敏，不进入会话记录。
- 每台机器的 `SUPERMANAGER_TOKEN` 仍单独创建，审计按令牌区分的既有约定不变。

## Alternatives considered

- **只把 .env 流程写得更清楚** —— 不解决非技术用户找文件、改格式、放错目录的根因。
- **把令牌写进组合文件（cordis.yml config）** —— 每台机器改文件，且令牌有进 git 的风险。
- **复用凭据商店（`$DSH_HOME/.credentials.yaml`）** —— 该层面向模型密钥与 Models 页；业务后端令牌走 settings namespace 与"配置 UI 按 namespace 渲染"的既有机制一致，不必混层。
