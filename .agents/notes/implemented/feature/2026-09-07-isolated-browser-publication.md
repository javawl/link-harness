# Agent Note: Isolated browsers for website publication

Status: implemented

English | [中文](2026-09-07-isolated-browser-publication.zh.md)

## Problem

Concurrent publication for different websites needs independent login state. Separate tabs share cookies, and a browser choice in a prompt alone cannot constrain verification, cleanup or child tool execution.

## Decision

The [browser service](../../../../packages/browser/browser/README.md) owns one lazy session per registered browser id. The [Playwright provider](../../../../packages/browser/browser-playwright/README.md) supplies the default browser and named profiles or local Chromium debugging connections. Canonical resource registration rejects duplicate profiles and endpoints; explicit missing ids fail without fallback. Attached-browser cleanup disconnects and preserves operator tabs. Configuration additions persist through the existing settings service; active profiles cannot be changed or removed while pages are retained.

The [publication runtime](../../../../packages/backlinks/tool-backlinks/README.md) captures one browser for each batch, resolving explicit selection before the saved website preference and deployment default. It holds browser and promoted-website reservations across callers. The multi-batch tool dispatches distinct pairs together, queues shared resources in input order, and preserves item-level host serialization. Every child browser command, verification snapshot and cleanup uses its assigned browser and page. A stopped batch prevents new admissions while active work drains; unresolved submissions remain excluded under the existing publication rules.

The [console](../../../../packages/client/ui-backlinks-console/README.md) adds browsers, saves website defaults and includes temporary overrides in the durable user request. Profile additions use settings revisions to reject competing writes. Binding writes change future selections; running assignments retain their browser.

The [capability-seam note](../architecture/2026-08-25-browser-capability-seam.md) retains the separate browser capability and closed command unions. The [tab-concurrency note](../architecture/2026-08-27-browser-multi-page-concurrency.md) retains ordering within a profile; one browser per item remains unnecessary.

## Alternatives considered

- Separate tabs alone share login state and cannot isolate website accounts.
- One browser per item multiplies profiles and login preparation; website-selected browsers share state only where the user chooses.
- Prompt-only selection leaves alternate tool calls, verification and cleanup able to use another browser.
- A separate browser database duplicates the existing persistent settings service and its validation and revision handling.

## Consequences

Each browser has its own page limit and item concurrency allowance, so total browser memory and concurrent model work grow with the selected browser count. CDP connections support local Chromium instances only; each endpoint must refer to a distinct browser, including when managed browsers expose debugging ports. Browser routing is not OS sandboxing. [Publication tool authority](../bug-fix/2026-09-08-backlinks-child-tool-authority.md) restricts children to browser and backlinks.

Browser and publisher regressions cover cross-browser page refs, shared-resource serialization, invalid selection before allocation, child routing restrictions, durable settings and profile aliases. Loader snapshots exercise two real Chrome profiles, cookie/localStorage isolation, reconnection and attached-tab preservation; the assembled publisher uses the real tool/model loop against local forms. The Web test covers browser addition, website binding, transmitted assignments, and desktop/narrow layouts. Local fixtures establish runtime behavior, not third-party acceptance or live-provider success rates.
