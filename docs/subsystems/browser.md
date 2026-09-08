# Browser Automation

English | [中文](browser.zh.md)

The browser automation seam — a capability seam that spans **one stateful operation** (closed-union command dispatch) on one `ctx.browser` service, split across packages: Service Definition ([dsh-browser](../../packages/browser/browser), `ctx.browser` + the provider registry and per-browser session lifetime), Service Provider ([dsh-browser-playwright](../../packages/browser/browser-playwright), a persistent Chromium context over Playwright), and Consumer ([dsh-tool-browser](../../packages/browser/tool-browser), the `browser` tool schema). Browser is **one optional capability**, not part of the agent-loop spine — so its vocabulary lives here, not in [core.md](core.md). A provider swap does not change how the model drives a page.

Source: [`packages/browser/browser/src/types.ts`](../../packages/browser/browser/src/types.ts)

## Why one command dispatch instead of one method per operation

Each browser session orders commands by addressed tab: one tab serializes while distinct tabs may overlap. `BrowserCommand` is a closed discriminated union dispatched through `act()`; providers handle every kind and the model tool exposes the same operations. `newPage` reserves a named blank tab, `fill` accepts one field or an ordered field list, and snapshot formats share semantic and frame addressing. The [command types](../../packages/browser/browser/src/types.ts) own the complete operation set.

## Session lifecycle and selection

Each selected browser opens lazily on its first command and is reused until `closeSession(browserId?)` or context disposal; commands serialize per tab, and a raw provider failure discards only that browser session so the next command relaunches rather than reusing unknown browser state. Provider selection follows the execution-time rules shared with the web seam (configured id must be registered and `available()`; unconfigured requires exactly one usable provider), and `$DSH_BROWSER_PROVIDER` is equivalent to the `provider` config field.

The Playwright provider launches a persistent context (`userDataDir`, headed by default, real Chrome channel by default), so cookie logins and human-solved challenges in the shared profile survive across harness runs — the operational stance backlink publishing depends on.

Pass `browserId` as the third argument to `act()` to select an isolated browser. Explicit selection takes precedence over the deployment default and never falls back on failure. The [Playwright provider](../../packages/browser/browser-playwright/README.md) owns profile and local CDP configuration; the [publication runtime](../../packages/backlinks/tool-backlinks/README.md) owns website bindings and batch scheduling.

## Vocabulary

`BrowserCommand` (closed union above; `navigate`/`snapshot` carry `maxChars`) → `BrowserResult` (closed union: `page` capture with `url`/`title`/`text`/`truncated`, `acked` for state changes, `screenshot` PNG base64); cancellation is a direct optional `AbortSignal` argument to `act()`, checked before dispatch. See `src/types.ts` for the full contracts and the `BrowserError` code taxonomy.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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
