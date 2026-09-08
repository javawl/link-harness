# Agent Note: 网站发布的浏览器隔离

Status: implemented

[English](2026-09-07-isolated-browser-publication.md) | 中文

## Problem

不同网站一起发布需要独立登录状态。不同标签页仍共享 cookie，仅在提示词中指定浏览器也无法约束结果核验、清理或子任务工具执行。

## Decision

[浏览器服务](../../../../packages/browser/browser/README.zh.md)按注册浏览器 id 持有惰性会话。[Playwright 提供方](../../../../packages/browser/browser-playwright/README.zh.md)提供默认浏览器、命名 profile 和本机 Chromium 调试连接。规范化资源注册拒绝重复目录及地址，显式 id 缺失时失败而不回退。绑定浏览器的清理只断开连接，保留操作者标签页。新增配置复用 settings 持久化；保留页面期间禁止修改或删除活动 profile。

[发布运行时](../../../../packages/backlinks/tool-backlinks/README.zh.md)为每个批次固定浏览器，按显式选择、网站已保存绑定、部署默认值的顺序解析。浏览器与推广网站的占用跨调用生效。多批次工具同时派发互不冲突的组合，共享资源的批次按传入顺序排队，每个浏览器内部继续按目标主机串行。子任务的每次浏览器操作、核验快照与页面清理都使用分配的 browserId 和 page。某批次停止后不再启动其他批次，并等待在途工作结束；未知提交继续遵循现有规则排除重发。

[控制台](../../../../packages/client/ui-backlinks-console/README.zh.md)新增浏览器、保存网站默认绑定，并把临时覆盖写入持久化用户请求。新增 profile 使用 settings 版本核对拒绝竞争写入。绑定更新只影响后续选择，在途任务保留原分配。

[能力服务定义说明](../architecture/2026-08-25-browser-capability-seam.zh.md)继续约束独立浏览器能力和闭合命令联合；[标签页并发说明](../architecture/2026-08-27-browser-multi-page-concurrency.zh.md)继续约束单个 profile 内的执行顺序，不需要为每个条目单独创建浏览器。

## Alternatives considered

- 仅分开标签页仍共享登录状态，无法隔离网站账户。
- 每条目创建浏览器会增加登录目录和准备工作；按网站指定浏览器只在用户选择的范围内共享状态。
- 只写提示词不能约束其他工具调用、核验和清理所用浏览器。
- 独立浏览器数据库会重复现有 settings 的持久化、校验与版本处理。

## Consequences

每个浏览器有独立页面上限和条目并发额度，总内存与模型并发随选择的浏览器数增长。CDP 仅支持本机 Chromium；每个地址必须对应不同实例，包括托管浏览器开放调试端口的情况。浏览器路由不等于 OS 沙箱。[发布工具权限](../bug-fix/2026-09-08-backlinks-child-tool-authority.zh.md)将子任务限制为 browser 和 backlinks。

浏览器与发布回归覆盖跨浏览器页面引用、共享资源串行、非法选择在资源分配前被拒绝、子任务路由限制、持久化设置及目录别名。Loader 快照使用真实 Chrome profile 验证 cookie/localStorage 隔离、重连和绑定标签页保留；发布组装测试通过真实工具与模型循环操作本地表单。Web 测试覆盖添加浏览器、网站绑定、传递分配以及桌面与窄屏布局。本地夹具证明运行时行为，不代表第三方接受率或在线模型成功率。
