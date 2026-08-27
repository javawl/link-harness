# @deepseek-ai/dsh-browser-playwright

[English](README.md) | 中文

浏览器自动化能力服务定义的 Service Provider：Playwright 持久 Chromium 上下文。默认有头并使用真实 Chrome 渠道，共享 profile 里的 cookie 登录态与人工解决过的挑战跨运行保留。

| 包 | 角色 | ctx 键 |
|---|---|---|
| `dsh-browser` | Service Definition | `ctx.browser` |
| `dsh-browser-playwright`（本包） | Service Provider：基于 Playwright 的持久 Chromium | 注册到 `ctx.browser` |
| `dsh-tool-browser` | Consumer：面向模型的 `browser` 工具 | `ctx.tools` |

## 配置

| 字段 | 默认 | 用途 |
|---|---|---|
| `userDataDir` | `.browser-profile` | 持久 profile 目录；登录、cookie 与已解决的挑战跨运行保留 |
| `headless` | `false` | 默认有头，人可以进入同一个浏览器操作 |
| `channel` | `chrome` | Chromium 发行渠道；`chrome` 用本机安装的 Google Chrome，留空用内置 Chromium |
| `defaultTimeoutMs` | `15000` | 默认单操作超时 |
| `launchArgs` | `[]` | 额外的 Chromium 启动参数（代理、窗口尺寸……） |
| `ignoreDefaultArgs` | `[]` | 按精确标志省略的 Playwright 默认启动参数；去掉 `--enable-automation` 可避免对自动化敏感的页面（尤其是 Google 账号登录）把浏览器判定为不安全 |
| `windowPosition` | 不设 | 初始窗口位置 `x,y`；屏幕外取值（如 `-32000,-32000`）让有头浏览器静默运行——需要人工介入时用 `bringToFront` 命令召回标签页 |

每条命令分发把服务定义的闭合 `BrowserCommand` 联合映射到其寻址的标签页：命名 `page` 引用（由 navigate 绑定、此后复用），省略时为最近打开的标签页。同一标签页的命令在页内链上保序，不同标签页的命令可并行；Playwright 的裸失败包装为 `BROWSER_ACTION_FAILED`，启动失败包装为 `BROWSER_LAUNCH_FAILED`。

## 模型体验

间接经由 `dsh-tool-browser`；本 Provider 不产出提示词、schema 或会话面。

#### KV Cache 影响

无直接失效；由上述 Consumer 负责请求前缀变化。

## 已知限制与遗留工作

- **内置 Chromium 需手动安装** — 默认 `chrome` 渠道使用本机安装的 Google Chrome；`channel` 留空时部署环境需 `npx playwright-core install chromium`。
- **按引用寻址标签页** — Provider 以页内串行链驾驭每个标签页，跨页命令可重叠；弹出窗口自动收养为可寻址页。
- **截图仅视口** — `fullPage` 整页捕获推迟到有工作流需要页面级证据时。
