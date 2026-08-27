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
| `launchArgs` | `[]` | Extra Chromium launch arguments (proxy, window size, …) |
| `ignoreDefaultArgs` | `[]` | Playwright default launch arguments to omit by exact flag; dropping `--enable-automation` keeps automation-hostile pages (notably the Google account login) from rejecting the browser as unsafe |
| `windowPosition` | unset | Initial window position `x,y`; offscreen values (for example `-32000,-32000`) run the headed browser silently — a `bringToFront` command surfaces a tab when a human must step in |

Every command dispatch maps the seam's closed `BrowserCommand` union onto its addressed tab: a named `page` ref (bound by a navigate, reused after) or, when omitted, the most recently opened tab. Commands on one tab serialize behind a per-tab chain while commands on different tabs overlap. Raw Playwright failures wrap into `BROWSER_ACTION_FAILED` and launch failures into `BROWSER_LAUNCH_FAILED`.

## Model Experience

Indirectly, through `dsh-tool-browser`; this provider contributes no prompt, schema, or session surface of its own.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

- **Bundled Chromium needs a manual install** — the default `chrome` channel uses the locally installed Google Chrome; an empty `channel` requires `npx playwright-core install chromium` in the deployment.
- **Tabs addressed by ref** — the provider drives each tab behind a per-tab serial chain; cross-tab commands overlap; site-opened popups are adopted as addressable pages.
- **Screenshots are viewport-only** — `fullPage` capture is deferred until a workflow needs page-length evidence.
