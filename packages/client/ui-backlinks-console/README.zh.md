---
description: "The Web client publish console: batch listing, selection, and one-request submission into a fresh Session."
kind: "package-reference"
---

# 发布批次控制台

[English](README.md) | 中文

<a id="summary"></a>
## 概述

Web 侧栏的“发布批次”标签通过 `backlinksConsole` 读取批次概要和明细，需要挂载 backlinks console Host 插件并配置批次提供方。

<a id="table-of-contents"></a>
## 目录

- [选择与提交](#selection-and-submission)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

-----

<a id=""></a>

<a id="selection-and-submission"></a>
## 选择与提交

每次刷新均按数字批次号降序排列。每个一级条目都有独立于详情展开按钮的复选框。“全选当前列表”只作用于当前搜索结果，隐藏的选择仍然保留。刷新时会移除已不存在的批次选择。展开的条目将 `executed` 显示为绿色，`failed` 显示为红色，其他状态显示为淡色文字。

“批量发布”将所选批次号按降序放入一条请求，提交到最近使用的工作区。提交会先在其中创建空白会话，持有会话引用直到其初始打开完成，再经该引用的会话级会话接口发送。提交结束前禁用所有发布和选择控件。成功后打开接收会话并清除已提交的选择；失败（含空白会话打开失败）时保留选择并显示错误。单行“发布”使用相同的提交路径。

<a id="model-experience"></a>
## 模型体验

### 用户请求提交

#### 模型看到什么

单个批次发送 `/backlink-publish <id>`。多个批次发送 `/backlink-publish <ids>`，其中批次号去重、降序排列并用空格分隔，随后追加换行及 `请按以上批次号顺序依次发布，仅处理这些批次。`。conversation 服务将其作为一条普通用户消息提交。

#### Token 影响

该请求向接收会话添加命令、所选批次号，以及仅在多批次时添加的句子。列表读取、筛选、选择和刷新不发起模型请求。

#### KV Cache 影响

提交向接收请求的空白会话追加用户消息，不替换已有对话的消息。不同批次号会改变该消息的 token；提供方缓存是否可用仍由提供方负责。

<a id=""></a>

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- 提交确认表示 Harness 已接收请求，不表示外部发布已经完成。发布技能负责执行、确认和结果汇报。选择状态仅保存在当前浏览器插件实例中。

-----

### 开发备注

<details>
<summary>维护者的工作上下文 — 点击展开</summary>

无。

</details>
