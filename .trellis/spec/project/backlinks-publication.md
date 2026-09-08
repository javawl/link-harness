# Backlink publication

## Scope / Trigger

Apply when changing [Supermanager detail parsing](../../../packages/backlinks/backlinks-supermanager/src/provider.ts), [batch selection](../../../packages/backlinks/tool-backlinks/src/batch-view.ts), [publication](../../../packages/backlinks/tool-backlinks/src/publisher.ts), or [native child budgets](../../../packages/subagent/subagent-in-process-driver/src/work-budget.ts).

## Signatures

Browser routing uses `browser.act(command, signal?, browserId?)` and `closeSession(browserId?)`. Console Remote methods are `browsers()`, `bindBrowser(websiteId, browserId)`, and `addBrowser(id, kind, location)`, where kind is profile or cdp. `backlink_publish_many({ batches: [{ batchId, browserId?, itemIds? }], scope, mode })` returns per-batch results plus `pendingBatchIds`.

`BacklinkWebsiteAnchor.id?: number` is absent for a website-derived default. `pendingBatchItems(detail, attempted, scope, itemIds?)` selects explicit candidates before eligible-source deduplication. The consumer records `backlinks/attempt: { batchId: number; itemIds: number[] }` and awaits `ctx.sessions.flush(parent.session)` before model work. Native per-run exhaustion returns `SubagentResult.stopReason = 'budget-exhausted'`.

## Contracts

The [publication sidebar](../../../packages/client/ui-backlinks-console/README.md) starts with compact batch rows that retain batch selection and single/bulk publication. Concurrent reveals only browser assignment and binding controls; its value survives sidebar remounts within the client plugin instance. Toggling preserves selected batches and browser overrides without submitting a request. The console component test and assembled Web snapshot cover both modes and responsive remounts.

Explicit anchors take precedence. An empty list uses the saved website name and absolute HTTP(S) siteUrl; other submission-pack fields remain unchanged. Invalid explicit anchors fail, and unusable defaults leave an empty list for preflight to stop without pages, leases or model calls.

Attempt history comes from the append-only parent log, including records outside the current model surface. A saved result prevents further browser input and navigation. Unknown submissions cannot be closed or retried. live/submitted require a declared final submission; live also requires an assigned publishing hostname, a different target hostname and an observed matching href. Source-wide published exclusions cover the full batch even during manual selection.

Publication children expose only browser and backlinks. Other tools, including Bash, are denied by the executor before their bodies run. Required local upload files are prepared outside publication. Scoped ToolDefinition parameters are JSON Schema: submission, receipt and verificationSelector belong inside properties, preserving inherited properties and leaving the global definitions unchanged. submission remains a boolean; strings such as "True" and "False" are rejected before browser input.

Local budget or output-token stops reconcile the item and continue unrelated work. Earlier pending attempts and item reconciliation failures are excluded from further dispatch and listed in unresolvedItemIds without rewriting backend outcomes. remaining=0 with stoppedReason=null finishes the selected execution and reports these items for manual review. Model, checkpoint, lease and backend authorization failures stop admissions and drain active work. A terminal provider error must not be replaced by a local budget diagnostic.

## Validation & Error Matrix

| Input or event | Required result |
|---|---|
| Empty explicit anchors, usable saved website | Default name/URL pair without synthetic id |
| Invalid explicit anchor | BACKLINKS_API_ERROR |
| Missing usable website/defaults | No page, claim or model request |
| Failed attempt checkpoint | No first model request |
| Cancellation plus unknown backend outcome | Restored attempt stays excluded; other sources continue |
| Per-item reconciliation transport failure | Continue queue; list unresolvedItemIds; preserve unknown page |
| Input after a saved result | Reject before browser dispatch |
| Unrelated or self-hosted live URL | Reject before result write |
| Local budget reached | Reconcile item; continue queue |
| Quota/authentication failure | Stop new admissions |
| Unknown selected browser | BROWSER_PROVIDER_CONFIGURED_MISSING; no page or lease |
| Duplicate profile directory or equivalent CDP origin | Reject settings write; retain prior registration |
| Changing an open profile | Reject settings write; retain its pages |
| Competing profile additions from the same revision | Reject stale settings write; do not lose the first addition |
| Child names another browser | Reject before dispatch |
| Child calls Bash | UNKNOWN_TOOL before shell execution |
| Model request contains publication fields | Valid object schema with fields under properties |
| click/press uses a string submission flag | Reject before browser dispatch |
| Batches share a browser or website | Wait for all earlier batches sharing either resource |

## Good / Base / Bad Cases

Base: an explicit approved anchor is used unchanged. Good: website 67 with name voloshow, siteUrl https://voloshow.com and no anchor rows resolves to voloshow → https://voloshow.com/. Bad: item 2 is silently discarded because an unselected item 1 shares its source; manual selection must happen before deduplication.

Base: an omitted browser uses the saved website binding, then the deployment default. Good: `(browser A, website 1)`, `(browser B, website 1)`, `(browser B, website 2)` execute in that order. Bad: admitting the third batch while the second waits on website 1 overtakes the second batch on browser B.

## Tests Required

Use the existing provider/publisher specs and backlink Loader snapshots. Verify model requests remain at zero while checkpoint flushing is pending or failed, then prove cancellation/replay preserves attempt ids. Exercise terminal writes, live-origin rejection, selected duplicates, local budget continuation and terminal quota preservation through the real tool executor. Both SDK snapshots must retain backlinks/attempt payloads. Generated known event types and bilingual catalogs must stay synchronized.

Inspect the actual child request/header tool schemas, including inherited fields, boolean submission and string receipt/verificationSelector. Test a fabricated Bash call against a registered global shell, and assert the shell body never runs. The guarded-tools Chrome scenario records that denial and still verifies local form publication through the allowed browser tool.

## Wrong vs Correct

Wrong: infer safety from a final tool-result metadata field or a saved skipped status alone. Correct: persist admission before model work and combine the saved result with current submission certainty. The [decision record](../../../.agents/notes/implemented/bug-fix/2026-09-07-backlinks-publication-checkpoints.md) owns rationale and limitations.

Wrong: check only currently running resources and let a later batch bypass an earlier pending dependency. Correct: chain each batch after the preceding promise for both its browser and website. Re-read the batch before claiming, and reject a changed website assignment.

Wrong: spread a resolved ToolDefinition.parameters and append submission beside type/properties. Correct: copy the existing properties and add submission there; validate the schema captured from a real child request.

## Browser assignment

Browser ids name configured independent resources. `browser.resolve(id?)` rejects unavailable explicit selections; `browser.act(command, signal?, browserId?)` and `closeSession(browserId?)` operate on that browser only. Playwright named profiles persist in its settings section; browser ids, normalized directories and local CDP origins must be distinct. Open profiles cannot be reconfigured; attached sessions disconnect without closing operator tabs.

`backlink_publish` resolves explicit browser id, website binding, then the deployment default once per batch. `backlink_publish_many` validates all browser selections before allocating pages or leases, runs distinct browser/website pairs concurrently, and queues shared resources in input order. Reservations apply across callers. Every child action, result verification and cleanup preserves its assignment. Bindings affect future calls, not admitted work. Tests must exercise invalid-selection rejection, child browser escape denial, shared-resource ordering, persistent binding writes, real profile cookie isolation and attached-tab preservation.
