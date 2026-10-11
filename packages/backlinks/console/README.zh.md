---
description: "面向 Web 控制台的外链 seam 只读 Remote。"
kind: "package-reference"
---

# @deepseek-ai/dsh-backlinks-console

[English](README.md) | 中文

## 概述

Web 发布控制台的 Host 半边：一个 Typert Remote，把外链 seam 的批次列表与批次详情暴露给浏览器。控制台用这些读取渲染；发布本身开启全新 Session，从不经由这个 Remote。插件挂载在任一提供 `ctx.backlinks` 的组合上。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

Web 客户端的发布控制台调用 `batches()` 获取带各状态计数与执行中标记的批次列表，调用 `batch(batchId)` 获取某个批次的网站、锚文本与条目。两者都转发到选定的批次工作源，并把 seam 失败原样透出；本包不写入、不启动、不发布。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现 internals — 点击展开</summary>

一个 `TypertRemoteService` 子类（`BacklinksConsoleRuntime`），`inject: ['backlinks']`，两个读取方法分别调用 `ctx.backlinks.listBatches` / `getBatch`。api-remotes 捆绑包挂载命名空间；`dsh-client-ui-backlinks-console` 的浏览器半边渲染它。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [backlinks](../backlinks/README.zh.md) — 本 Remote 投影其读取的 seam。
- [ui-backlinks-console](../../client/ui-backlinks-console/README.zh.md) — 渲染这些读取并把发布提交进全新 Session 的 Web 面板。
- [api-remotes](../../api/remotes/README.zh.md) — 挂载命名空间的 Remote 网关。

-----

<a id="model-experience"></a>
## 模型体验

无；本包是面向浏览器的 Remote 投影，不注册任何模型面。

#### KV Cache effect

无；本包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **只读是设计使能** — 条目结果、租约与徽章都经由 Session 内面向模型的 `backlinks` 工具；在此加写入会绕过发布纪律。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文 — 点击展开</summary>

无。

</details>
