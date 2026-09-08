# @deepseek-ai/dsh-backlinks-console

[English](README.md) | 中文

Web 发布控制台的 Typert Remote 服务。与 `dsh-backlinks` 一起挂载；各方法使用该服务配置的批次提供方及错误处理。

## 方法

`batches()` 按批次 id 降序返回全部摘要。即使新批次复制自较早的发布计划，也会显示在顶部；提供方原数组和计划时间保持原样。`batch(batchId)` 返回提供方给出的单个批次完整详情。

`browsers()` 返回浏览器选项和持久化的网站绑定。`bindBrowser(websiteId, browserId)` 先核对引用，再保存或清除默认值。`addBrowser(id, kind, location)` 通过 Playwright 设置区新增独立登录目录或本机 CDP 连接；版本核对防止并发新增互相覆盖。配置写入要求对应提供方与 settings 服务，不启动浏览器，也不向外部发布内容。

## 模型体验

无，因为此 Remote 提供 UI 数据，不注册模型提示词或工具 schema。

#### KV Cache 影响

无；控制台排序不改变模型请求。

## 已知限制与遗留工作

- 不推送批次更新：客户端通过这些读取方法刷新。发布记录和租约所有权仍以后端为准。
