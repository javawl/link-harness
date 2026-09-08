# 浏览器自动化

[English](browser.md) | 中文

浏览器自动化 seam 是一个能力 seam，在同一个 `ctx.browser` 服务上承载**一项有状态操作**（闭合联合命令分发），并拆分到多个包：Service Definition（[dsh-browser](../../packages/browser/browser)，`ctx.browser` + 提供方注册表与各浏览器会话生命周期）、Service Provider（[dsh-browser-playwright](../../packages/browser/browser-playwright)，基于 Playwright 的持久 Chromium 上下文）与 Consumer（[dsh-tool-browser](../../packages/browser/tool-browser)，即 `browser` 工具 schema）。浏览器是**一项可选能力**，不属于 agent loop（智能体循环）主干，因此其词汇定义在此而非 [core.md](core.zh.md) 中。更换提供方不会改变模型驱动页面的方式。

源码：[`packages/browser/browser/src/types.ts`](../../packages/browser/browser/src/types.ts)

## 为什么是一条命令分发而不是每个操作一个方法

各浏览器会话按目标标签页排列命令：同一页串行，不同页可以并行。`BrowserCommand` 是经 `act()` 分发的闭合判别联合；提供方处理所有种类，模型工具暴露同一套操作。`newPage` 预留命名空白页，`fill` 接受单个字段或有序字段列表，快照格式共用语义及 frame 寻址。[命令类型](../../packages/browser/browser/src/types.ts)定义完整操作集合。

## 会话生命周期与选择

各浏览器在其第一条命令时惰性打开并复用，直到 `closeSession(browserId?)` 或上下文销毁；命令在页内串行化，提供方泄漏的裸失败仅丢弃对应浏览器会话，使下一条命令重新启动而不是复用未知状态。提供方选择遵循与 web seam 相同的执行期规则（配置的 id 必须已注册且 `available()`；未配置时要求恰好一个可用提供方），`$DSH_BROWSER_PROVIDER` 等价于 `provider` 配置字段。

Playwright 提供方启动持久上下文（`userDataDir`、默认有头、默认真实 Chrome 渠道），共享 profile 里的 cookie 登录态与人工解决过的挑战跨 harness 运行保留——这正是外链发布工作流依赖的运行姿态。

向 `act()` 第三个参数传 `browserId` 选择独立浏览器。显式选择优先于部署默认值，失败时不自动回退。[Playwright 提供方](../../packages/browser/browser-playwright/README.zh.md)负责 profile 与本机 CDP 配置，[发布运行时](../../packages/backlinks/tool-backlinks/README.zh.md)负责网站绑定与批次调度。

## 词汇

`BrowserCommand`（上述闭合联合；`navigate`/`snapshot` 携带 `maxChars`）→ `BrowserResult`（闭合联合：带 `url`/`title`/`text`/`truncated` 的 `page` 捕获、状态变更的 `acked`、PNG base64 的 `screenshot`）；取消是 `act()` 的直接可选 `AbortSignal` 参数，在分发前检查。完整契约与 `BrowserError` 错误分类见 `src/types.ts`。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxbrowser--browserruntime"></a>

### `ctx.browser` — `BrowserRuntime`

The browser automation service. Registered as `ctx.browser` (one instance per context).

Selection semantics (resolved at execution time, never order-dependent):

- A configured id that is registered and `available()` → that provider.
- A configured id not registered → `BROWSER_PROVIDER_CONFIGURED_MISSING`.
- A configured id registered but unavailable → `BROWSER_PROVIDER_CONFIGURED_UNAVAILABLE`.
- No id configured, exactly one registered usable provider → that provider.
- No id configured, multiple usable providers → `BROWSER_PROVIDER_AMBIGUOUS`.
- No id configured, no usable provider → `BROWSER_PROVIDER_UNAVAILABLE`.

```ts cordis-catalog
/**
 * Register one independently addressable browser. A resource cannot have two ids.
 * @param provider - backend owning this browser's login state and tabs.
 * @returns disposer that unregisters and closes only this browser.
 */
registerProvider(provider: BrowserAutomationProvider): () => void

/**
 * List configured browser ids without launching or connecting to them.
 * @returns browser ids and their local availability; no credentials or page contents.
 */
list(): { id: string; available: boolean }[]

/**
 * Resolve an explicit browser or the configured default before starting work.
 * @param browserId - registered id; omitted uses the service's provider selection.
 * @returns selected browser id; an unknown or ambiguous selection throws before launch.
 */
resolve(browserId?: string): string

/**
 * Check whether a browser has a live or opening session.
 * @param browserId - registered browser id.
 * @returns whether changing its configuration would affect retained pages.
 */
hasSession(browserId: string): boolean

/**
 * Execute in the selected browser's lazy session. Tab refs are local to that browser.
 * @param command - closed-union command; parallel callers must address a page.
 * @param signal - cancellation forwarded to the provider.
 * @param browserId - explicit browser; omitted uses the configured default.
 * @returns the command outcome. Failure discards only the affected browser session.
 */
async act(command: BrowserCommand, signal?: AbortSignal, browserId?: string): Promise<BrowserResult>

/**
 * Close one selected browser, awaiting a pending launch. Other browsers remain usable.
 * @param browserId - explicit id; omitted closes the configured default, if any session exists.
 * @returns when its provider cleanup settles; a dead browser's close error is ignored.
 */
async closeSession(browserId?: string): Promise<void>
```

Source: [`packages/browser/browser/src/index.ts`](../../packages/browser/browser/src/index.ts)
<!-- END GENERATED cordis-surface -->
