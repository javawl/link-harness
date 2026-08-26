# Browser Automation

English | [中文](browser.zh.md)

The browser automation seam — a capability seam that spans **one stateful operation** (closed-union command dispatch) on one `ctx.browser` service, split across packages: Service Definition ([dsh-browser](../../packages/browser/browser), `ctx.browser` + the provider registry and shared session lifecycle), Service Provider ([dsh-browser-playwright](../../packages/browser/browser-playwright), a persistent Chromium context over Playwright), and Consumer ([dsh-tool-browser](../../packages/browser/tool-browser), the `browser` tool schema). Browser is **one optional capability**, not part of the agent-loop spine — so its vocabulary lives here, not in [core.md](core.md). A provider swap does not change how the model drives a page.

Source: [`packages/browser/browser/src/types.ts`](../../packages/browser/browser/src/types.ts)

## Why one command dispatch instead of one method per operation

The browser is one stateful surface: every command lands on the same session's active page, and each dispatch must observe the previous one's settled state. `BrowserCommand` is therefore a CLOSED discriminated union (`navigate`/`snapshot`/`click`/`fill`/`select`/`press`/`upload`/`screenshot`/`waitFor`/`closePage`) dispatched through a single `act()`, and providers `switch` to exhaustiveness so adding a kind breaks their compilation. The consumer mirrors the same set as one tool's `action` field — ten page-driving verbs on one shared browser instead of ten tools.

## Session lifecycle and selection

The session opens lazily on the first command and is reused until `closeSession()` or context disposal; commands serialize through the seam, and a raw provider failure discards the session so the next command relaunches rather than reusing unknown browser state. Provider selection follows the execution-time rules shared with the web seam (configured id must be registered and `available()`; unconfigured requires exactly one usable provider), and `$DSH_BROWSER_PROVIDER` is equivalent to the `provider` config field.

The Playwright provider launches a persistent context (`userDataDir`, headed by default, real Chrome channel by default), so cookie logins and human-solved challenges in the shared profile survive across harness runs — the operational stance backlink publishing depends on.

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
