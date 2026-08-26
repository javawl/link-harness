# 浏览器自动化

[English](browser.md) | 中文

浏览器自动化 seam 是一个能力 seam，在同一个 `ctx.browser` 服务上承载**一项有状态操作**（闭合联合命令分发），并拆分到多个包：Service Definition（[dsh-browser](../../packages/browser/browser)，`ctx.browser` + 提供方注册表与共享会话生命周期）、Service Provider（[dsh-browser-playwright](../../packages/browser/browser-playwright)，基于 Playwright 的持久 Chromium 上下文）与 Consumer（[dsh-tool-browser](../../packages/browser/tool-browser)，即 `browser` 工具 schema）。浏览器是**一项可选能力**，不属于 agent loop（智能体循环）主干，因此其词汇定义在此而非 [core.md](core.zh.md) 中。更换提供方不会改变模型驱动页面的方式。

源码：[`packages/browser/browser/src/types.ts`](../../packages/browser/browser/src/types.ts)

## 为什么是一条命令分发而不是每个操作一个方法

浏览器是一个有状态表面：每条命令都落在同一会话的活动页上，每次分发必须观察到前一次的稳定状态。因此 `BrowserCommand` 是一个闭合判别联合（`navigate`/`snapshot`/`click`/`fill`/`select`/`press`/`upload`/`screenshot`/`waitFor`/`closePage`），经由唯一的 `act()` 分发；提供方 `switch` 到穷尽，新增一个 kind 会破坏其编译。消费方把同一集合镜像为单个工具的 `action` 字段——一个共享浏览器上的十个页面驱动动词，而不是十个工具。

## 会话生命周期与选择

会话在第一条命令时惰性打开并复用，直到 `closeSession()` 或上下文销毁；命令经服务定义串行化，提供方泄漏的裸失败会丢弃会话，使下一条命令重新启动而不是复用未知状态。提供方选择遵循与 web seam 相同的执行期规则（配置的 id 必须已注册且 `available()`；未配置时要求恰好一个可用提供方），`$DSH_BROWSER_PROVIDER` 等价于 `provider` 配置字段。

Playwright 提供方启动持久上下文（`userDataDir`、默认有头、默认真实 Chrome 渠道），共享 profile 里的 cookie 登录态与人工解决过的挑战跨 harness 运行保留——这正是外链发布工作流依赖的运行姿态。

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
 * Register a browser automation provider. Throws {@link BrowserError}
 * `BROWSER_DUPLICATE_PROVIDER` if its id is already registered. Returns a
 * disposer; disposed with the calling fiber.
 * @param provider - the provider; its `id` is the registry key.
 * @returns the disposer that unregisters the provider.
 */
registerProvider(provider: BrowserAutomationProvider): () => void

/**
 * Perform one command on the shared session, opening it lazily through the
 * selected provider on first use. Commands serialize: each dispatch observes
 * the previous one's settled state. Provider selection and session open
 * throw {@link BrowserError} before any page work runs.
 * @param command - the closed-union command to execute.
 * @param signal - optional cancellation signal checked before dispatch.
 * @returns the closed-union outcome for the command kind.
 */
act(command: BrowserCommand, signal?: AbortSignal): Promise<BrowserResult>

/**
 * Close the shared session (and its browser). Safe when no session is open;
 * the next `act()` opens a fresh one.
 * @returns when the session is closed or none existed.
 */
async closeSession(): Promise<void>
```

Source: [`packages/browser/browser/src/index.ts`](../../packages/browser/browser/src/index.ts)
<!-- END GENERATED cordis-surface -->
