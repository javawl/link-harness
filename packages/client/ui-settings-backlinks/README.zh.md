---
description: "dsh Web 客户端插件页上的外链提供方设置页：Supermanager 批次工作源与 Cloud-mail 验证邮箱，各自包含接口地址与令牌。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-backlinks

[English](README.md) | 中文

## 概述

在侧栏打开**插件**，在外链提供方分组里选择 **Supermanager** 或 **Cloud-mail**，即可设置各提供方的接口地址与令牌。页面暂存输入、只在保存时写入；令牌是区块密钥，明文从不出现在任何响应里，因此控件每次加载都是空的，只报告是否已配置。各页面只在 Host 服务对应提供方命名空间（`backlinks-supermanager` / `backlinks-cloud-mail`）期间存在。

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

**Supermanager** 和 **Cloud-mail** 卡片打开两个提供方页面。**后端地址** / **接口地址**显示生效值，一旦被覆盖就带**已覆盖**标签和**恢复默认**，清空后保存等于重置。令牌控件每次加载都是空的，只报告是否已配置令牌；留空保存等于保留现有令牌。点击**保存**之前不会写入任何内容；离开页面即丢弃草稿。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现 internals — 点击展开</summary>

Host 半边是空的 `apply`，只是让包在 Loader 里占一行，由客户端模块系统为浏览器半边提供服务。浏览器半边通过 `ctx.configForms.get` 绑定各提供方的命名空间，把暂存表单放在 `BacklinksCardController` 里，复用 `ui-primitives` 的共享 `SettingsFormModel`；两个提供方共享一个控制器类和一个渲染器，由包装组件把文案固定到各自的 locale 键。令牌是表单唯一的密钥控件：写入通过表单带版本栅栏的 mutate 回到区块，已配置徽章来自共享 describe 镜像的密钥槽位，因为被脱敏的响应永远无法回答读回校验。各页面通过 `ctx.configForms.whileServed` 把卡片注册进插件页的 `plugins.item` 插槽。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [ui-plugin-manager](../ui-plugin-manager/README.zh.md) — 插件页与页面注册进入的 `plugins.item` 插槽。
- [ui-settings](../ui-settings/README.zh.md) — 页面依赖的设置表单与服务命名空间监视。
- [ui-primitives](../ui-primitives/README.zh.md) — 页面渲染使用的设置表单模型与字段。
- [backlinks-supermanager](../../backlinks/backlinks-supermanager/README.zh.md) — 注册命名空间的批次工作源提供方。
- [backlinks-cloud-mail](../../backlinks/backlinks-cloud-mail/README.zh.md) — 注册命名空间的邮箱提供方。

-----

<a id="model-experience"></a>
## 模型体验

无；本包是浏览器侧设置界面，不注册任何模型面。

#### KV Cache effect

无；本包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **共享一个字典命名空间** — 两个提供方页面都读 `settings.backlinks`；只有当两者文案超出共享表单框架出现分歧时才需要拆分。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文 — 点击展开</summary>

无。

</details>
