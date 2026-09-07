# 初始化 link-harness 项目规范

## 背景

仓库已经接入 Trellis，并从内网 `vibe-specs` registry 安装跨项目通用工程指南。当前 `.trellis/spec/` 还缺少 link-harness 项目专属规范。

项目已有详细的 `AGENTS.md`、双语文档、Agent Notes、TypeScript/Python SDK、CLI、Web、Native 和大量 package 级约束。项目规范必须从这些当前资产中提取，不能用通用模板代替现状。

## 目标

在 `.trellis/spec/project/` 中沉淀当前系统真实存在且可执行的开发约束，让后续会话能正确选择局部检查、维护双语文档、遵守 package 边界，并区分源码、生成物、快照和归档记录。

## 范围

- pnpm workspace、package 分层、公共导出和依赖方向。
- Cordis 配置、Agent loop、工具、浏览器、子进程和子代理能力边界。
- TypeScript/Python SDK 同步要求。
- 双语文档、i18n pairing、Agent Notes 和生成目录的权威来源。
- Oxlint、TypeScript、Vitest、snapshot、E2E、文档及发布验证命令的适用范围。

## 执行要求

1. 先读取 `AGENTS.md`、`CONTRIBUTING.md`、`docs/testing.md` 和相关 package 的局部 `AGENTS.md`。
2. 每条项目规范引用真实存在的源码、测试或权威文档路径。
3. 描述当前系统；单次需求结论留在 task 中，不直接提升为永久规则。
4. 明确生成文件的来源和再生成命令，不指导 AI 直接修改生成结果。
5. Journal 不记录 secrets、prompt、diff、环境变量值或绝对临时路径。
6. Codex 默认在主会话工作；只有当前用户请求明确授权时才可派发子代理。

## 验收标准

- [ ] `.trellis/spec/project/index.md` 与实际项目规范文件一致。
- [ ] 所有引用路径真实存在。
- [ ] 没有 `TBD`、`TODO`、placeholder 或 `to be filled`。
- [ ] 通用 registry 规则与 link-harness 项目规则分离。
- [ ] 检查命令与仓库当前 `package.json` 和文档一致。
- [ ] 未修改或提交当前业务 WIP。

完成后运行：

```bash
python3 ./.trellis/scripts/task.py finish
python3 ./.trellis/scripts/task.py archive 00-bootstrap-guidelines
```
