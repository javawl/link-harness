# @deepseek-ai/dsh-tool-browser

English | [中文](README.zh.md)

Consumer for the browser automation seam: the model-facing `browser` tool over `ctx.browser`. One tool with an `action` discriminant — the browser is one stateful surface, so the model drives it with a single verb set instead of one tool per operation.

| Package | Role | ctx key |
|---|---|---|
| `dsh-browser` | Service Definition | `ctx.browser` |
| `dsh-browser-playwright` | Service Provider: persistent Chromium via Playwright | registers on `ctx.browser` |
| `dsh-tool-browser` (this) | Consumer: the model-facing `browser` tool | `ctx.tools` |

## Tool

`browser(action, url?, selector?, value?, key?, files?, waitUntil?, timeoutMs?)` — actions `navigate`, `snapshot`, `click`, `fill`, `select`, `press`, `upload`, `screenshot`, `waitFor`, `closePage`. Results are the seam's closed union: bounded page capture (`page`), `acked`, or `screenshot` PNG base64. Page text is bounded by `maxOutputChars` (default 60 000); the per-call timeout (`timeoutMs`, default 120 000) is deployment policy forwarded as the tool's cancellation signal. The tool stays visible when no provider exists and fails with a structured error at execution.

`fill` accepts `fields: [{selector,value}]` to fill several known text controls in one call. All arguments validate before ordered filling begins; empty strings clear fields and whitespace is preserved. A failure can leave earlier fields filled; submission is a separate call. All text, aria, form and links snapshots support semantic selectors and nested frames; form omits password values and links supplies actual hrefs. Truncated results are marked and require a narrower selector. `newPage` only reserves a named blank tab and fails at capacity.

## Model Experience

### System prompt

#### What the model sees

The browser tool contributes the guidance below at registration time.

##### Browser tool guidance

```markdown
Use the browser tool to drive one shared, persistent real-browser session across tabs. Tabs: navigate returns a page ref like p2; pass that page on every later command for the tab you are working. Work several sites in parallel by giving each its own ref. Omit page only for single-tab serial work. newPage reserves a blank tab under a new page ref without visiting a website; it fails if the ref exists or page capacity is exhausted. Selectors address semantically first: role:<role>|<name> (for example role:button|Submit), label:<text>, placeholder:<text>, text:<text>, or bare CSS as fallback; prefix frame(<iframe css>)>> to reach inside an iframe; click also takes xy:<x>,<y> viewport coordinates from a screenshot. Prefer snapshot with format=aria to read element roles and names, then address them by role/label/placeholder — far more reliable than guessing CSS. Use a scoped snapshot with format=form for input attributes and values (password values are omitted), or format=links for visible anchor text and resolved hrefs. Link text alone does not verify a destination. Fill several known text controls in one call with fields: [{selector, value}]; fills run in order and stop at the first failure without undoing earlier fields. Submit separately after checking the form. The window may run offscreen; when a human must step in (CAPTCHA, login), call bringToFront first so the window surfaces. Actions: navigate (absolute http(s) url), snapshot (url/title/text of the page or a selector), click/fill/select (semantic or CSS selector; fill and select need value), press (key like Enter), upload (selector + files), screenshot (PNG base64), waitFor (selector or url), closePage. The session persists cookies and logins across calls and runs; prefer it for sites that need JavaScript, logins, or form submission. Confirm outcomes with snapshot or waitFor after state-changing actions.
```

#### Token effect

Fixed guidance cost per request while the tool is registered, plus the bounded page text each call returns (`maxOutputChars`, default 60 000 characters).

#### KV Cache effect

Stable tool schema and prompt section; no request-prefix churn across calls.

## Known Limitations and Deferred Work

- **Tab addressing is per-caller** — the `page` argument threads through every action; navigate binds a new ref, later commands address it. One agent's calls stay serial (`isConcurrencySafe` false); cross-agent parallelism is orchestration (each child addresses its own ref), not this agent's parallel calls.
- **Semantic selectors first** — `snapshot format=aria` returns the accessibility tree; selectors address by `role:<role>|<name>`, `label:`, `placeholder:`, `text:`, bare CSS as fallback, `frame(<css>)>>` chains into iframes, and click alone takes `xy:<x>,<y>`. `bringToFront` surfaces an offscreen window for human fallback.
- **No cookie/storage inspection** — deliberate: sessions are opaque to the model; login state is observed through page snapshots only.
