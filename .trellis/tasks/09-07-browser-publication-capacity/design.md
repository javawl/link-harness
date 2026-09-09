# 设计

`browser-playwright.maxOpenPages = 0` 明确表示不限制已保留标签页数量，默认 16 不变；backlink 示例设为 0，publisher 的三项并发仍生效。publisher 回收所有已保存失败且未提交、未发生不确定输入的自有页面，其他页面保留。

Supermanager 的数据解析统一将相对 anchor.targetUrl 相对 website.siteUrl 解析，并拒绝空锚文本及非 HTTP(S) URL。publisher 在有待执行项时预检锚点，缺失则返回 stoppedReason，既不领取租约也不启动模型。网站详情以用户给出的管理页和对应 agent API 为来源。默认锚点通过已验证的现有管理 API 写入并回读；当前管理页未登录，写入权限作为执行时先验证的外部条件，不能以编造資料或重复发布绕过。

使用现有 DSH 公开会话接口恢复原 session；以独立本地监督脚本持续读状态/日志，在 12 小时内每小时汇总。脚本只向已授权 DSH 会话发送继续指令，不创建 Codex 子代理。未知提交、认证/配额等需外部修复的中断不得无限重试。

范围不包含清理其他用户标签页、绕过验证码、充值付费或重新提交已有/未知发布。原脏工作区完整保留。

无限总页数允许保留未知提交证据，内存会随保留页增加；安全回收已结束且未提交页面减少累积，监控记录进程内存与页面相关错误。不得以释放内存为由关闭未知页面。回滚只恢复本任务差异及已记录的配置值，不覆盖原有修改。

## 发布正确性修复

Supermanager 将没有独立锚点的网站资料解析成无后台锚点 id 的默认锚点。tool-backlinks 在父会话写入并刷写 backlinks/attempt，恢复从该日志记录排除已尝试条目；首次模型请求等待检查点，取消不依赖最终工具结果。publisher 限制已保存终态的后续输入，核验 live 的来源主机和提交声明，在手选范围内去重。原生 driver 用 budget-exhausted 区分单项预算，publisher 安全收尾后继续队列；模型、存储和租约故障仍停派。

改动集中在 backlinks 提供方与消费方、subagent 结果分类及其回归/组装快照；文档生成器只补已发现的 console 映射，补缺失 UI README 并压缩新增 Trellis 指令。同步各自的 README、Agent Note、类型说明、SDK 投影证据与生成目录。

## 后台发布

在 publisher 的专属 browser 执行器拒绝 bringToFront，复用现有工具白名单禁止系统输入。manual_required 终态保留页面，manualRequired 返回 itemId、browserId、page、reason；父任务只报告，由用户打开窗口。通用 browser 提示仅在用户明确要求时允许置前。聚焦执行器回归和 Loader/Chrome 快照覆盖拦截、页面保留、通知及继续队列，不新增窗口控制或自动重启。

Playwright 默认 context.newPage 发送 Target.createTarget 时不带 background，仍会选择新标签并恢复窗口。共享 createPage 改为 background=true，创建前收集页面事件，并按返回 targetId 关联页面；超时、失败、上下文关闭清理临时监听及 CDP 会话。新页分配保留原容量预留规则，网站自行开的弹窗不改写。macOS 有头 Loader 场景使用独立、初始最小化的测试窗口，验证三页并发创建、导航、填写、点击和截图后仍为同一最小化窗口。
