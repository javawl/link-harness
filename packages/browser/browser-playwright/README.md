# @deepseek-ai/dsh-browser-playwright

English | [中文](README.zh.md)

Service Provider for the browser automation seam: a Playwright persistent Chromium context. Headed by default over a real Chrome channel, so cookie logins and human-solved challenges in the shared profile survive across harness runs.

| Package | Role | ctx key |
|---|---|---|
| `dsh-browser` | Service Definition | `ctx.browser` |
| `dsh-browser-playwright` (this) | Service Provider: persistent Chromium via Playwright | registers on `ctx.browser` |
| `dsh-tool-browser` | Consumer: the model-facing `browser` tool | `ctx.tools` |

## Configuration

| Field | Default | Purpose |
|---|---|---|
| `userDataDir` | `.browser-profile` | Persistent profile directory; logins, cookies, and challenge solutions survive runs |
| `headless` | `false` | Headed by default so a human can step into the same browser |
| `channel` | `chrome` | Chromium distribution; `chrome` uses the installed Google Chrome, empty uses bundled Chromium |
| `defaultTimeoutMs` | `15000` | Default per-operation timeout |
| `navigationTimeoutMs` | `20000` | Navigation timeout, independent of element and snapshot waits |
| `navigationWaitUntil` | `domcontentloaded` | Default navigation readiness; a command's `waitUntil` overrides it |
| `maxOpenPages` | `16` | Live-page ceiling including concurrent reservations; `0` disables the ceiling |
| `launchArgs` | `[]` | Extra Chromium launch arguments (proxy, window size, …) |
| `ignoreDefaultArgs` | `[]` | Playwright default launch arguments to omit by exact flag; dropping `--enable-automation` keeps automation-hostile pages (notably the Google account login) from rejecting the browser as unsafe |
| `windowPosition` | unset | Initial window position `x,y`; the window manager may adjust this hint. Background page creation preserves focus independently |

Every command dispatch maps the seam's closed `BrowserCommand` union onto its addressed tab: a named `page` ref (bound by a navigate, reused after) or, when omitted, the most recently opened tab. Commands on one tab serialize behind a per-tab chain while commands on different tabs overlap. Raw Playwright failures wrap into `BROWSER_ACTION_FAILED` and launch failures into `BROWSER_LAUNCH_FAILED`.

Page creation at capacity throws `BROWSER_PAGE_LIMIT`; existing pages remain usable and an explicit `closePage` releases capacity. Completing a child agent does not close its pages in the shared browser. Callers close confirmed-complete pages and retain unfinished submissions. Snapshot locator waits use `defaultTimeoutMs`; DOM readiness does not wait for every image or advertisement to finish loading.

Tool-created pages use Chromium `Target.createTarget` with `background: true`, preserving the selected tab and an existing window's minimized state. Concurrent creations match each Playwright page to its returned target id. Creation waits use `defaultTimeoutMs` and remove temporary event listeners and CDP sessions on settlement. This applies to persistent profiles and attached default contexts; website-created popups remain Chromium-controlled. The [headed Chrome snapshot](../../../examples/backlink-agent/tests/browser-capacity.snapshot.ts) checks minimized-window preservation on macOS through real page creation and input.

Raw keyboard presses and coordinate clicks wait at most `defaultTimeoutMs` and observe in-flight cancellation. Because Playwright exposes no cancellation API for those inputs, interruption returns `BROWSER_ACTION_UNCERTAIN` without claiming rollback. The session retains the pending operation until it settles and drains it during browser closure. That physical page stays locked for the session even if the input later completes: only `bringToFront` and explicit `closePage` are allowed. Other pages remain usable; callers preserve the page for manual review and never resubmit an uncertain publication. Ordinary locator waits retain Playwright’s native timeout behavior.

All snapshot formats share action selectors, including semantic addressing and nested frames. `form` returns visible field attributes, values and select options, omitting password values and hidden controls; `links` returns visible anchor text and resolved hrefs. `fill.fields` runs sequentially on one page, retaining earlier fills if a later field fails; it does not click submit. `newPage` reserves a named blank tab, rejects an existing ref, and does not visit a target site.

A browser-context close reports `BROWSER_SESSION_CLOSED`. Closing one page during an action remains a page failure and does not discard other callers’ pages.

## Named browsers

The default browser id is `playwright`. Additional `profiles` entries use a unique `id` plus exactly one of `userDataDir` or `cdpEndpoint`; `channel` optionally selects another installed Chromium distribution such as `msedge`. Managed browsers inherit launch and timeout settings, with independent directories, cookies, tabs and page limits. Set the browser service's `provider: playwright` to retain a default when multiple browsers exist.

`cdpEndpoint` binds an already-running local Chrome/Edge HTTP debugging origin, for example `http://127.0.0.1:9222`. Each instance needs its own profile directory and debugging port. Connections are lazy; closing an attached session disconnects and preserves its existing tabs, while closing a managed session closes its browser. No profile or login state is copied. Remote endpoints and non-Chromium browsers are unsupported.

With a settings provider, the `browser-playwright` section persists the additional profiles and applies additions immediately. The publish console provides an add/connect form. Duplicate directories (including existing symlink aliases), browser ids, and equivalent local endpoints are rejected. Changing or removing a profile with an open session fails until that session is closed; retained submissions must be reconciled first. CDP endpoints must refer to distinct browser instances; do not expose a managed browser under another connection alias.

## Model Experience

Indirectly, through `dsh-tool-browser`; this provider contributes no prompt, schema, or session surface of its own.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

- **Password masking is format-specific** — structured form snapshots omit password values; Playwright aria snapshots can include input values, including passwords. Avoid aria captures of populated credential forms.

- **Capacity is checked at tool-requested creation** — restored pages and site-opened popups count toward the ceiling, but are not forcibly closed. The limit bounds further requested page growth; it is not a process-memory limit or a guarantee about unsolicited popup count.

- **Bundled Chromium needs a manual install** — the default `chrome` channel uses the locally installed Google Chrome; an empty `channel` requires `npx playwright-core install chromium` in the deployment.
- **Tabs addressed by ref** — the provider drives each tab behind a per-tab serial chain; cross-tab commands overlap; site-opened popups are adopted as addressable pages.
- **Screenshots are viewport-only** — `fullPage` capture is deferred until a workflow needs page-length evidence.
