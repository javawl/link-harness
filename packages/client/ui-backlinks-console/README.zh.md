# @deepseek-ai/dsh-client-ui-backlinks-console

[English](README.md) | 中文

Web 侧栏发布面板列出批次、展开条目详情并启动发布会话。读取通过[外链控制台 Remote](../../backlinks/console/README.zh.md)；[外链智能体](../../../examples/backlink-agent/README.zh.md)负责发布、核验和结果回写。

浏览器插件依赖 slots、locale、sessions、workspaces 和 `remote.backlinksConsole` 服务。Host 入口不注册行为。刷新更新批次计数，展开批次加载详情。发布操作创建新会话，在对话连接后发送发布命令。

## 模型体验

### 发布命令

#### 模型看到什么

点击发布会在新会话中发送一条用户消息 `/backlink-publish <batchId>`。后续指令和工具由所选技能和部署配置提供。

#### Token 影响

列出或展开批次不请求模型。发布启动普通对话，其执行成本属于所选智能体。

#### KV Cache 影响

面板不增加系统提示词或工具 schema。发布使用新会话配置的请求前缀。

## 已知限制与待办

- 发布创建新会话，不恢复已有的阻塞发布会话。
- 批次刷新读取后台状态，不订阅条目进度事件。
