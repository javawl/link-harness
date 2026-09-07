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
| `navigationTimeoutMs` | `20000` | 导航超时，与元素及快照等待分开 |
| `navigationWaitUntil` | `domcontentloaded` | 默认导航就绪条件；单次命令的 `waitUntil` 可覆盖 |
| `maxOpenPages` | `16` | 已打开页数上限，包含并发创建预留；`0` 表示不设上限 |
| `launchArgs` | `[]` | 额外的 Chromium 启动参数（代理、窗口尺寸……） |
| `ignoreDefaultArgs` | `[]` | 按精确标志省略的 Playwright 默认启动参数；去掉 `--enable-automation` 可避免对自动化敏感的页面（尤其是 Google 账号登录）把浏览器判定为不安全 |
| `windowPosition` | 不设 | 初始窗口位置 `x,y`；屏幕外取值（如 `-32000,-32000`）让有头浏览器静默运行——需要人工介入时用 `bringToFront` 命令召回标签页 |

每条命令分发把服务定义的闭合 `BrowserCommand` 联合映射到其寻址的标签页：命名 `page` 引用（由 navigate 绑定、此后复用），省略时为最近打开的标签页。同一标签页的命令在页内链上保序，不同标签页的命令可并行；Playwright 的裸失败包装为 `BROWSER_ACTION_FAILED`，启动失败包装为 `BROWSER_LAUNCH_FAILED`。

容量已满时开新页会抛出 `BROWSER_PAGE_LIMIT`；已有页面仍可操作，显式 `closePage` 后释放容量。子 agent 结束不会关闭共享浏览器中的页面，调用方须关闭已确认完成的页面并保留未知提交。快照定位器等待使用 `defaultTimeoutMs`；DOM 就绪不要求所有图片或广告都加载完成。

原始按键与坐标点击最多等待 `defaultTimeoutMs`，并响应执行中的取消信号。Playwright 没有这些输入的取消 API，因此中断返回 `BROWSER_ACTION_UNCERTAIN`，不表示操作已回滚。会话保留在途操作，直至其结束，并在关闭浏览器时等待清理完成。即使输入随后完成，该实际页面在本会话内仍保持锁定，只允许 `bringToFront` 和显式 `closePage`。其他页面仍可用；调用方须保留该页交人工核验，绝不重新提交未知结果的发布。普通定位器等待仍使用 Playwright 原生超时行为。

所有快照格式复用动作的语义选择器及嵌套 frame 语法。`form` 返回可见字段的属性、当前值和 select 选项，省略密码值及隐藏字段；`links` 返回可见锚文本和解析后的 href。`fill.fields` 在同一页内顺序执行，失败后保留此前已填字段；它不点击提交。`newPage` 预留一个命名空白页，重复引用会失败，不访问目标站。

浏览器上下文关闭报告 `BROWSER_SESSION_CLOSED`。操作期间单个页面关闭仍属于页面失败，不丢弃其他调用方的页面。

## 模型体验

间接经由 `dsh-tool-browser`；本 Provider 不产出提示词、schema 或会话面。

#### KV Cache 影响

无直接失效；由上述 Consumer 负责请求前缀变化。

## 已知限制与遗留工作

- **密码遮蔽按格式区分**——结构化 form 快照省略密码值；Playwright aria 快照可能包含输入值，包括密码。避免对已填入凭据的表单截取 aria 快照。

- **容量在工具请求开页时检查** — 已恢复页面和站点弹窗计入上限，但不会被强制关闭。该限制约束后续请求的页面增长，不是进程内存限制，也不保证站点自行弹窗的数量。

- **内置 Chromium 需手动安装** — 默认 `chrome` 渠道使用本机安装的 Google Chrome；`channel` 留空时部署环境需 `npx playwright-core install chromium`。
- **按引用寻址标签页** — Provider 以页内串行链驾驭每个标签页，跨页命令可重叠；弹出窗口自动收养为可寻址页。
- **截图仅视口** — `fullPage` 整页捕获推迟到有工作流需要页面级证据时。
