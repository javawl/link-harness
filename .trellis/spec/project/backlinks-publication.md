# Backlink publication

## Scope / Trigger

Apply when changing [Supermanager detail parsing](../../../packages/backlinks/backlinks-supermanager/src/provider.ts), [batch selection](../../../packages/backlinks/tool-backlinks/src/batch-view.ts), [publication](../../../packages/backlinks/tool-backlinks/src/publisher.ts), or [native child budgets](../../../packages/subagent/subagent-in-process-driver/src/work-budget.ts).

## Signatures

`BacklinkWebsiteAnchor.id?: number` is absent for a website-derived default. `pendingBatchItems(detail, attempted, scope, itemIds?)` selects explicit candidates before eligible-source deduplication. The consumer records `backlinks/attempt: { batchId: number; itemIds: number[] }` and awaits `ctx.sessions.flush(parent.session)` before model work. Native per-run exhaustion returns `SubagentResult.stopReason = 'budget-exhausted'`.

## Contracts

Explicit anchors take precedence. An empty list uses the saved website name and absolute HTTP(S) siteUrl; other submission-pack fields remain unchanged. Invalid explicit anchors fail, and unusable defaults leave an empty list for preflight to stop without pages, leases or model calls.

Attempt history comes from the append-only parent log, including records outside the current model surface. A saved result prevents further browser input and navigation. Unknown submissions cannot be closed or retried. live/submitted require a declared final submission; live also requires an assigned publishing hostname, a different target hostname and an observed matching href. Source-wide published exclusions cover the full batch even during manual selection.

Local budget or output-token stops reconcile the item and continue unrelated work. Model, checkpoint, lease or reconciliation failures stop new admission and drain active work. A terminal provider error must not be replaced by a local budget diagnostic.

## Validation & Error Matrix

| Input or event | Required result |
|---|---|
| Empty explicit anchors, usable saved website | Default name/URL pair without synthetic id |
| Invalid explicit anchor | BACKLINKS_API_ERROR |
| Missing usable website/defaults | No page, claim or model request |
| Failed attempt checkpoint | No first model request |
| Cancellation plus unknown backend outcome | Restored attempt remains excluded |
| Input after a saved result | Reject before browser dispatch |
| Unrelated or self-hosted live URL | Reject before result write |
| Local budget reached | Reconcile item; continue queue |
| Quota/authentication failure | Stop new admissions |

## Good / Base / Bad Cases

Base: an explicit approved anchor is used unchanged. Good: website 67 with name voloshow, siteUrl https://voloshow.com and no anchor rows resolves to voloshow → https://voloshow.com/. Bad: item 2 is silently discarded because an unselected item 1 shares its source; manual selection must happen before deduplication.

## Tests Required

Use the existing provider/publisher specs and backlink Loader snapshots. Verify model requests remain at zero while checkpoint flushing is pending or failed, then prove cancellation/replay preserves attempt ids. Exercise terminal writes, live-origin rejection, selected duplicates, local budget continuation and terminal quota preservation through the real tool executor. Both SDK snapshots must retain backlinks/attempt payloads. Generated known event types and bilingual catalogs must stay synchronized.

## Wrong vs Correct

Wrong: infer safety from a final tool-result metadata field or a saved skipped status alone. Correct: persist admission before model work and combine the saved result with current submission certainty. The [decision record](../../../.agents/notes/implemented/bug-fix/2026-09-07-backlinks-publication-checkpoints.md) owns rationale and limitations.
