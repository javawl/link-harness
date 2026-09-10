# Agent Note：发布成功后回写来源分类

Status: implemented

[English](2026-09-08-backlinks-category-writeback.md) | 中文

## 问题

大量 supermanager 来源的 `category` 为空；而发布方在勘察阶段本来就会判定站点类型（六类剧本）。该判定此前被丢弃，来源只能等人工补分类。

## 决策

发布成功时，仅当来源分类为空才回填。判定类型随条目结果一起传输，不引入额外请求或排序窗口。

[seam](../../../../packages/backlinks/backlinks/README.md) 扩展 `BacklinkItemResult`：`live`/`submitted` 可携带可选 `category`，仅在条目自身 `category` 为空时发送。[消费方](../../../../packages/tool-backlinks/README.md)解析该字段并写进工具 schema 与提示词指引；[发布运行时](../../../../packages/backlinks/tool-backlinks/README.md)拒绝已分类条目附带 `category`（本地响亮守卫；失败调用不消耗条目结果，子代理去掉字段重报即可）。[supermanager provider](../../../../packages/backlinks/backlinks-supermanager/README.md) 在既有 `/api/agent/items/:id/result` 调用上透传该字段。

后端（独立部署的 supermanager）按名匹配工作区激活的 `source_categories`，用一条带守卫的语句填 `sources.category_id`——`category_id IS NULL`、精确匹配名称、仅激活分类。未知名称是空操作并记入审计元数据（`category`、`categoryFilled`），绝不让发布失败；写入与结果同事务。

发布 persona 指示子代理：分配条目未分类且 live/submitted 时附上类型（导航站/博客/论坛/内容站/游戏站/工具站），识别不出就省略，不猜测。

## 备选方案

- 独立 `setSourceCategory` 端点保持载荷纯净，但多一次请求、多一个与人工编辑的竞态窗口，还要为次要效应做失败处理。
- 每次判定都覆盖分类会冲掉人工维护；「仅空时填」以后端为权威，而非客户端客气。
- 工具 schema 限定六值枚举会把 supermanager 的种子词表固化进通用 seam；自由字符串加提示词纪律可支持工作区自定义分类。

## 结果

provider 测试覆盖 wire 展开；publisher 测试覆盖透传与响亮拒绝；publisher fixture 把两个方向都作为后端不变量强制执行，Chrome 快照断言子代理 `tool/call` 事件中的判定分类。服务端测试覆盖按名匹配、submitted 变体、未知名称空操作与省略。先部署 harness 后部署后端无害：旧后端忽略未知 body 字段，只是不填分类。
