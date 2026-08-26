# Agent Note: Browser capability seam — one session, one verb set

Status: implemented

English | [中文](2026-08-25-browser-capability-seam.zh.md)

## Problem

The backlink-publishing workflow needs to drive logged-in, JavaScript-heavy sites through a real browser with a persistent profile — cookie sessions and human-solved challenges must survive across harness runs. The harness has no browser surface, and `ctx.web` is the wrong place to add one: its own Agent Note already keeps provider-backed page interaction out of `fetch`, and a stateful browser process (one session, one active page, serialized operations) is a different operational shape from request/response retrieval. Without a seam, the first consumer would own launching, session lifetime, serialization, cancellation, and error vocabulary inline in a tool.

Two contract questions had to be settled up front: how the model addresses a stateful surface (one tool per operation would give ten schemas that churn independently), and who owns the session (tool calls are short-lived; the profile must not be).
- Status: implemented (active)
- Packages: `packages/browser/browser` (Service Definition), `packages/browser/browser-playwright` (Service Provider), `packages/browser/tool-browser` (Consumer)
- Subsystem reference: [docs/subsystems/browser.md](../../../../docs/subsystems/browser.md)

## Decision


Browser automation is its own capability seam, not a widening of `ctx.web`. The web Agent Note already named provider-backed page interaction as separate-surface work (a `web_extract` sibling, not a fetch arm); driving a logged-in, JavaScript-heavy site is further still — it needs a stateful browser process, not a request/response. The seam follows the web trio's shape exactly: provider registry with execution-time selection, a service error taxonomy extending `HarnessError`, model-facing names/schemas only in the consumer.

Two contract choices differ from web and define the seam:

1. **One command dispatch, not one method per operation.** The browser is a single stateful surface: every operation lands on the same session's active page and must observe the previous operation's settled state. The SD therefore exposes one `act(command)` over a CLOSED `BrowserCommand` union (`navigate`/`snapshot`/`click`/`fill`/`select`/`press`/`upload`/`screenshot`/`waitFor`/`closePage`) returning a CLOSED `BrowserResult` union (`page`/`acked`/`screenshot`). The consumer mirrors the same set as one `browser` tool's `action` field — ten page-driving verbs on one shared browser instead of ten tools whose schemas would churn independently.

2. **One shared lazy session owned by the SD.** The session opens on the first command and survives until `closeSession()` or context disposal; commands serialize through a promise chain inside the SD. This is what lets a persistent browser profile outlive individual tool calls and whole runs: the Playwright provider launches `chromate.launchPersistentContext` over a configurable `userDataDir`, headed by default on the real Chrome channel. Cookie logins and human-solved CAPTCHAs in that profile are the operational basis of the backlink-publishing workflow that consumes this seam.

## Failure discipline

A provider that leaks a raw (non-`BrowserError`) failure loses the session: the SD discards it, so the next command relaunches rather than reusing unknown browser state. Launch failures wrap as `BROWSER_LAUNCH_FAILED`; command failures as `BROWSER_ACTION_FAILED`; cancellation is checked before dispatch (`BROWSER_ABORTED`). An unregistered provider after a session is open does NOT affect that session — selection matters at open time, which the SD tests pin explicitly.

## Deferred work

- Named-tab addressing (commands always drive the most recently opened page); parallel sessions.
- Full-page screenshots; DOM-level structured snapshots beyond text capture (`page` result carries url/title/text only).
- An observation surface (page-lifecycle events) — intentionally absent, same posture as web's dropped observation surface.
- Real-browser e2e lane: current tests cover the provider through a mocked `playwright-core`; a keyless real-Chrome smoke (self-skipping when no Chrome is installed) is future work alongside the backlinks workflow's snapshot tests.

## Consequences

- `BrowserCommand` and `BrowserResult` are closed unions owned by `dsh-browser`; providers and consumers `switch` to exhaustiveness, so adding a kind or outcome is a compile-enforced change across all three packages.
- The SD owns one shared lazy session and serializes every command; consumers cannot open parallel sessions, and a provider that leaks a raw failure loses the session (next command relaunches instead of reusing unknown state).
- The Playwright provider's persistent context makes browser state (logins, solved challenges) durable across runs; that durability is now an operational property other capabilities may rely on.
- Model-facing verbs live only in `dsh-tool-browser`, so a provider swap never changes how the model drives a page.

## Alternatives considered

- **Widening `ctx.web` with a `browser` fetch arm** — rejected: `web`'s request/response vocabulary cannot honestly carry a stateful session, and the web seam note already defers provider-backed page interaction to a sibling capability.
- **One method per operation on the service** — rejected: ten parallel methods duplicate selection/serialization/error ownership for one stateful surface; one dispatch over a closed union keeps one owner and compiles new kinds into every consumer.
- **One model-facing tool per operation** — rejected in favor of a single `browser` tool with an `action` field: the browser is one page-driving verb set, and a single schema avoids per-tool catalog churn.
- **Session per tool call** — rejected: launching per call destroys the persistent-profile property the workflow depends on and multiplies launch cost.
