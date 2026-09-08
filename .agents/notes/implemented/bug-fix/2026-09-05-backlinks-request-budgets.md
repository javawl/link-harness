# Agent Note: Bounded backlink requests and native child runs

Status: implemented

English | [中文](2026-09-05-backlinks-request-budgets.zh.md)

## Problem

A long backlink batch repeatedly sends full batch records and child history through model requests. Parent polling and lease heartbeats consume another model request despite doing no publishing work. A child can repeatedly debug one site without producing an item result, while step-based usage replacement hides failed attempts that share a step with their retries.

## Decision

The backlink composition uses one foreground `backlink_publish` call over the confirmed selection. Its queue refills up to three slots and serializes each target hostname, reusing native subagent start, result and disposal. One lease covers the selected sources; the existing timer renews it without model turns. A page is reserved before claiming or starting paid work. Scoped child executors enforce the assigned page and item, and outcome reconciliation precedes page closure and lease release. Fixed discipline is delivered through persona; task prompts contain item data only. [Publication tool authority](2026-09-08-backlinks-child-tool-authority.md) restricts children to browser and backlinks; upload files are prepared outside publishing. The general delegation tool retains its bounded prompt-array API for independent callers.

Web sessions load their preset after host composition. The deployment applies publishing persona, compaction and tool exclusions through `agent-presets.overrides` for standard, code and cordis, using the Include loader's existing patch mechanism. Coding instructions, default filesystem skill discovery, filesystem tools and separate delegation controls are absent from these publishing sessions. The Web regression creates and resumes all three presets and checks their persona and tool visibility. Existing log content remains historical context; a fresh conversation avoids retaining older coding instructions.

The backlinks tool returns counts by default and bounded complete item pages on request. It selects pending or retryable work in code, deduplicates sources, excludes published sources, and checks fresh detail before claiming. Claims return ids and lease metadata. Claimed ids are logged in result metadata and excluded throughout that agent session, including replay. A fresh session after backend review is required for another attempt. Explicit full-detail reads remain available for investigation.

Native spawn and fork providers validate optional per-run budgets and install them before child publication through the existing shared driver. Limits cover reported request tokens including cache and retries, steps, elapsed time and identical tool failures. Checks precede further model work and let dispatched tools settle. Exhaustion is a durable error with a parent-facing diagnostic. The publisher checks backend records before fallback writes: an interruption before a declared final submission can be retryable; dispatched or uncertain submissions remain manual-required. Configured budgets reject continuable starts because their activation ownership differs.

The token-meter projection counts streams separated by terminal finish chunks as distinct attempts, including retries within one step. Repeated usage samples and finalized message usage within an attempt replace one another. Provider response ids are not unique request identities. Provider anomalies stay intact for audit. Normal retry policy allows one empty-response retry by default, independently bounded within the general retry cap.

The shared browser outlives child runs, so request budgets do not bound retained page memory. The Playwright provider reserves page capacity before each requested creation, including parallel callers, and rejects excess requests without closing existing work. The publishing workflow closes pages after confirmed live/submitted/skipped write-back and stops new work at capacity. Unknown submissions and human handoffs remain intact. Navigation readiness and timeout are configured separately from locator waits; snapshots use the configured locator timeout. The [real-Chrome snapshot](../../../../examples/backlink-agent/tests/browser-capacity.snapshot.ts) verifies capacity, preserved work, released slots, DOM readiness with a pending image, and snapshot deadlines; it requires an installed Chrome.

Raw key and coordinate input have a provider-owned wait deadline. Playwright exposes no non-destructive cancellation for these calls, so expiry or cancellation reports `BROWSER_ACTION_UNCERTAIN` and locks that physical page for manual review. The provider retains the input Promise until settlement and drains pending inputs when closing the browser. Late completion never unlocks automation; an explicit close releases the page. Other tabs remain usable. The real-Chrome snapshot exercises a busy key handler, rejection of repeated input, and a separate usable site.

The publishing skill arms the existing Goal before the first claim after scope and mode confirmation. The objective covers all selected work, not one claim page; the Goal driver retains it across compaction and continues after an ordinary model stop. Tool reads and claims carry the same `scope` (`pending`, `retryable`, or `all`), so a pending-only run excludes retryable failures before pagination. The console sorts summaries by descending batch id because copied batches can have older planned dates. The [selection snapshot](../../../../examples/backlink-agent/tests/selection.snapshot.ts) checks scope exhaustion and console ordering through the Loader; it does not claim live-model instruction compliance.

Native children inherit the provider/model from the parent's latest recorded request, with creation options as the fallback and explicit child overrides taking precedence. This keeps a [Web model selection](../feature/2026-08-07-default-model-follows-the-picker.md) aligned with subsequently delegated work without mutating existing children or replay history.

Model or infrastructure errors stop further admission and drain active work before lease release. Local budget and output-token stops follow [publication checkpoints](2026-09-07-backlinks-publication-checkpoints.md): reconcile the item, preserve unknown submissions and continue unrelated work. Native error diagnostics expose bounded codes such as QUOTA; raw provider payloads remain in the child log. The queue rechecks admission after each browser reservation. A previously attempted selected source still pending without a publication record requires reconciliation.

The [publisher snapshot](../../../../examples/backlink-agent/tests/publisher.snapshot.ts) exercises model selection, quota stop and unrecorded prior attempts through the Loader and native driver. Provider failures leave unstarted backend items pending, and reconciliation does not issue a second website submission.

The [retained-page decision](2026-09-07-backlinks-retained-pages.md) extends this policy with an opt-out ceiling and cleanup of saved failures before submission. Native execution budgets and uncertain-input retention remain required.

## Alternatives considered

**Continue after each model error.** A quota or authentication failure can affect the whole queue, so repeatedly starting children consumes requests and mislabels untouched websites. Stopping after an abnormal terminal result preserves work while letting normally recorded website failures continue.

**Copy raw provider errors into parent results.** Provider payloads may contain credentials or request data. A bounded code identifies the failure class; the child log retains the detailed evidence.

**Inherit only creation-time model options.** A live model selection changes request routing without mutating those options. The recorded request is the durable evidence of the model the parent used.

- Prompt-only budgets cannot prevent another paid request or enforce a tool failure limit.
- Reimplementing child lifecycle would duplicate native delegation. The publication queue owns only batch selection, page authority, result verification and slot admission; native runs own child execution and teardown.
- Aborting active tools at a token threshold can interrupt a submission after the site accepts it but before the result is recorded.
- Treating cached input as free hides repeated request volume and cannot establish gateway quota or billing rules.
- Zeroing anomalous provider output would discard evidence without the raw gateway response needed to establish its cause.
- Automatically evicting old pages or closing every page at child exit can discard an unfinished submission or human handoff. Capacity rejection preserves those pages and requires explicit cleanup of completed work.

## Consequences

Coordination waits do not create LLM calls. Small item views and child tool filters reduce repeated context. The budget is a stopping threshold: a request can overshoot it, provider-unreported usage and direct compaction calls are excluded, and elapsed time is checked between requests. Native locator timeouts bound element waits; interrupted raw input retains its uncertain outcome and page until manual reconciliation. The [parallel snapshot](../../../../examples/backlink-agent/tests/parallel.snapshot.ts) boots three native children whose first steps wait for all three starts, and checks their logged prompts and ordered results. These limits require calibration against observed publishing outcomes; they are not a measured production savings guarantee.

Page capacity constrains requested growth rather than process RSS: restored tabs and unsolicited popups are counted but not forcibly closed. Resource supervision must also measure browser memory and system pressure; task progress alone cannot establish host health. Operational supervision state belongs in durable storage, not a temporary directory cleared at reboot.

The [record guard](../../implemented/feature/2026-09-01-backlinks-duplicate-publish-guard.md) remains complemented by on-site verification. The [child discipline channel](2026-09-03-backlinks-discipline-delivery-channel.md) remains mandatory: smaller prompts still carry lazy-load, link-format, verification and registration rules. The [usage projection decision](../../implemented/architecture/2026-07-29-projected-token-usage-and-request-context.md) retains durable totals and approximate occupancy. These notes are partially extended and remain active.

The assembled keyless [budget scenario](../../../../examples/backlink-agent/tests/budget.snapshot.ts) checks small batch results and native budget stops. The [publisher scenario](../../../../examples/backlink-agent/tests/publisher.snapshot.ts) exercises real Chrome, ordinary and nested-frame forms, batched filling, fresh public href verification, and one retained skill body. Focused native tests check rolling slots, same-host serialization, foreign-page/item rejection, capacity admission, cancellation and lost write acknowledgements. The skill tool suppresses only unchanged bodies still visible in the session; compaction or an edited skill permits reloading. No production publication rate or paid-model savings is inferred from these checks.
