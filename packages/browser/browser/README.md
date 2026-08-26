# @deepseek-ai/dsh-browser

English | [中文](README.zh.md)

Service Definition for the browser automation capability seam (`ctx.browser`): the provider registry, the lazy single-session lifecycle, per-tab-ordered closed-union command dispatch over page refs, and the `BrowserError` taxonomy.

| Package | Role | ctx key |
|---|---|---|
| `dsh-browser` (this) | Service Definition: seam, command/result vocabulary, error taxonomy | `ctx.browser` |
| `dsh-browser-playwright` | Service Provider: persistent Chromium via Playwright | registers on `ctx.browser` |
| `dsh-tool-browser` | Consumer: the model-facing `browser` tool | `ctx.tools` |

## Service API (ctx.browser)

| Member | Purpose |
|---|---|
| `registerProvider(provider)` | Register a browser provider; duplicate ids throw `BROWSER_DUPLICATE_PROVIDER`; returns a fiber-scoped disposer |
| `act(command, signal?)` | Dispatch one closed-union command on the shared session (opened lazily); same-tab commands serialize while different-tab commands may overlap |
| `closeSession()` | Close the shared browser; the next `act()` opens a fresh one |

`BrowserCommand` (`navigate`/`snapshot`/`click`/`fill`/`select`/`press`/`upload`/`screenshot`/`waitFor`/`closePage`) and `BrowserResult` (`page`/`acked`/`screenshot`) are CLOSED unions owned here. A raw provider failure discards the session (`BROWSER_ACTION_FAILED`), so the next command relaunches rather than reusing unknown browser state.

## Selection

| Situation | Execution |
|---|---|
| configured id registered and `available()` | runs that provider |
| configured id not registered | `BROWSER_PROVIDER_CONFIGURED_MISSING` |
| configured id registered but unavailable | `BROWSER_PROVIDER_CONFIGURED_UNAVAILABLE` |
| no id, exactly one registered usable provider | runs it |
| no id, no usable provider | `BROWSER_PROVIDER_UNAVAILABLE` |
| no id, multiple usable providers | `BROWSER_PROVIDER_AMBIGUOUS` |

`$DSH_BROWSER_PROVIDER` is equivalent to the `provider` config field.

## Model Experience

Indirectly, through `dsh-tool-browser`, which returns the bounded page capture, ack, or screenshot outcomes and the exact provider-selection failures while this registry contributes no prompt or schema itself.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

- **One session, many addressed tabs** — every command takes an optional `page` ref; a navigate binds a caller-named ref to a tab and later commands address it, so parallel callers each drive their own tab (cookie jar shared). Commands without a ref keep the legacy most-recent-tab contract; a second parallel session remains out of scope.
- **No observation surface** — no page-lifecycle events and no session-status query; callers observe outcomes per command.
- **Signal checks are cooperative** — `AbortSignal` is checked before dispatch; in-flight Playwright operations complete under their own timeouts.
