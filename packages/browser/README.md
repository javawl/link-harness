# browser/ — Browser automation capability family

English | [中文](README.zh.md)

The browser seam and its provider/tool adapters. The `browser` package owns the Service Definition role: the abstract service (`ctx.browser`), the closed-union command/result vocabulary, and the `BrowserError` taxonomy. `browser-playwright` is the Service Provider over a persistent Chromium profile. `tool-browser` is the Consumer: the model-facing `browser` tool. All **product** packages.

| Package | Role | ctx key |
|---|---|---|
| [`browser/`](browser/README.md) | Browser automation service and command/result vocabulary | `ctx.browser` |
| [`browser-playwright/`](browser-playwright/README.md) | Playwright provider (persistent Chromium profile) | registers on `ctx.browser` |
| [`tool-browser/`](tool-browser/README.md) | Model-facing `browser` tool | `ctx.tools` |

The seam keeps one shared lazy session: the first command opens the provider's browser and every later command (serialized) drives its active page until `closeSession()` or context disposal. Model-visible names, schemas, and prompt guidance live only in `tool-browser`; a provider swap never changes how the model drives a page.
