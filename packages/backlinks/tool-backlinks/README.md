# @deepseek-ai/dsh-tool-backlinks

English | [中文](README.zh.md)

Consumer for the backlinks capability seam: the model-facing `backlinks` tool over `ctx.backlinks`. One tool with an `action` discriminant — the publish-batch workflow is one coherent verb set, mirroring the browser tool's single-surface shape.

| Package | Role | ctx key |
|---|---|---|
| `dsh-backlinks` | Service Definition | `ctx.backlinks` |
| `dsh-backlinks-supermanager` | Service Provider: supermanager HTTP batch source | registers on `ctx.backlinks` |
| `dsh-backlinks-cloud-mail` | Service Provider: cloud-mail mailboxes | registers on `ctx.backlinks` |
| `dsh-tool-backlinks` (this) | Consumer: the model-facing `backlinks` tool | `ctx.tools` |

## Tool

`backlinks(action, …)` — actions `batch_list`, `batch_get`, `batch_claim`, `lease_heartbeat`, `lease_release`, `item_result`, `badge_add`, `mailbox_create`, `mail_wait`. Results carry a one-line `summary` plus the structured `data` payload; the per-call timeout (`timeoutMs`, default 300 000) is deployment policy. The tool stays visible when no provider exists and fails with a structured error at execution.

`batch_get` defaults to counts, `eligibleCount`, and `nextItemIds`. `view: items` returns a complete small page with website data and anchors; use explicit `itemIds` or the returned `nextAfterItemId` cursor. `view: all` explicitly requests full detail. `maxBatchItems` defaults to 6 and `maxBatchViewBytes` to 16384 UTF-8 bytes; oversized small views fail with an actionable error instead of dropping fields.

`batch_claim` validates the selection against fresh batch detail, excludes published sources and manual-required failures, then deduplicates within the selected candidates. It returns only `leaseId`, opaque `leaseExpiresAt`, and `itemIds`. Claimed ids are appended to the log-only `backlinks/attempt` event and flushed before returning the claim; a failed checkpoint releases the lease and fails the call. Attempts remain excluded for that agent session after cancellation, compaction and replay. Reopening a failed item requires backend review and a fresh session.

`scope` applies to both `batch_get` and `batch_claim`: `pending` selects pending items, `retryable` selects retryable failures, and the default `all` selects both. Summary and item views echo that scope and count only its eligible work. Explicit item reads remain available for checking completed results; claims reject ids outside the chosen scope. Keep the user-confirmed scope across pages; one page is not the completion condition for an entire batch.

`leaseHeartbeatMs` defaults to 60000. The tool description directs the model to omit `lease_heartbeat` for claimed work. The runtime renews without LLM calls, using an interval independent of the server clock. Renewal stops and drains before release, when the owner becomes idle or is disposed, and when the plugin is disposed. A renewal failure cancels the active owner with a recorded reason. Teardown does not release remote leases or infer publication outcomes; the backend expiry remains authoritative.

## Foreground batch publication

Configuring `publisher` registers `backlink_publish(batchId, scope, mode, itemIds?, browserId?)`. Its provider, concurrency, persona and maxTokens are explicit settings; browser, agents and subagents services are required. The provider must create fresh in-process children supporting persona, tool restrictions and depth limits. Confirm the selection before calling; mode is smart or all, and scope is pending, retryable or all.

One call holds one lease over the selected eligible sources and refills up to concurrency slots, serializing each target hostname. The provider supplies configured anchors or defaults from saved website details; unusable website data stops the call before any page, lease or child is created. Explicit itemIds are selected before eligible-source deduplication. Each child receives only its item, website, anchors, mode, leaseId and reserved page; persona delivers fixed discipline. Before its first model request, the publisher appends and flushes a parent `backlinks/attempt` record. Recovery does not depend on the final tool result surviving cancellation. Checkpoint failures stop admission; occupied page capacity leaves unstarted items untouched.

A child model or infrastructure error stops new admissions, drains active children and releases the lease; unstarted items remain pending. Per-item budget, reconciliation and page-cleanup failures skip the affected work and continue the queue. Previously attempted sources still pending without a published record are excluded from dispatch and listed in unresolvedItemIds. This does not write a skipped outcome or permit resubmission. Quota, authentication, checkpoint and lease failures still stop the batch; stoppedReason retains their diagnostic. When remaining is zero and stoppedReason is null, the selected execution is finished, with unresolved items reported separately for manual review.

Child tool executors enforce their assigned page and itemId/leaseId, constrain source_tags and badge_add targets, and reject batch or lease operations. Omitted page selects the assigned tab; another ref is rejected. Every click/press declares submission: false for navigation/account work, true for the single final publication. After dispatch, only verification, navigation, surfacing and safe closure are allowed. A saved result blocks further browser input and navigation; an unknown submission cannot be closed even when an earlier result exists. Purpose declarations cannot detect implicit submission by site scripts. Children expose only browser and backlinks; shell calls are rejected before execution. Required local upload files must be prepared before publication.

Both live and submitted require a declared final submission; a pre-existing backlink is skipped. A live result revisits an http(s) publicUrl on the assigned sourceUrl or submitUrl hostname, ignoring only a leading www, and checks the actual target href. The publishing page cannot be on the promoted website or target hostname. verificationSelector may narrow the page. submitted requires receipt text present on the current page. This checks text presence, not its meaning or anonymous accessibility. Dispatched but unconfirmed submissions remain manual_required. Lost write acknowledgements trigger a backend read before any fallback result.

Cancellation drains children and reconciles outcomes. An interruption without a declared final submission or uncertain input can be retryable; unknown submissions and uncertain input retain their pages. A saved failure before any final submission releases its page even when backend review is required. Only owned pages with conclusive outcomes and unassigned blank reservations are closed, then renewals stop and the lease is released. This long call has no low-level tool timeout; provider-owned child budgets still apply. Results return attempted, remaining, counts, stoppedReason and unresolvedItemIds; empty unresolved lists are omitted from model text. Live, submitted and unresolved outcomes remain distinct.

`backlink_publish_many(batches, scope, mode)` accepts ordered `{batchId, browserId?, itemIds?}` assignments. Browser selection resolves as explicit id, saved website binding, then deployment default; all ids are checked before pages or leases. Different browser/website pairs run concurrently, while batches sharing either run in input order. Each browser runs up to `concurrency` items; total concurrency can therefore reach that value times the number of selected browsers. Active publications reserve both browser and website across callers. A stopped batch halts new batch admissions and drains active work. Results identify each batch and browser; `pendingBatchIds` records unstarted batches. Each child is restricted to its browser as well as its page, including result verification and cleanup.

## Model Experience

### System prompt

#### What the model sees

The backlinks tool contributes the guidance below at registration time.

##### Backlinks tool guidance

```markdown
Use the backlinks tool to run the publish-batch workflow against the backlink management backend: batch_list → batch_get (counts by default; view=items returns only a small pending page) → batch_claim (grants a bounded lease) → per item: browser publishes on the target site, then item_result reports live/submitted/failed/skipped → lease_release when done. Keep lease renewal in the runtime; never use model calls to sleep or poll subagents. mailbox_create + mail_wait receive site verification codes (returns code and first link). badge_add installs a reciprocal footer badge when a site requires exchange. source_tags attaches tags to the target site by name after a publish attempt (免徽章/要徽章/可复用/有盾…); idempotent add-only. Verify before publishing: an item whose publishStatus is submitted or live, or whose publishedUrl is set, is already published — never claim or re-submit it, and a source with such a record on any item of the batch is done too; an existing link to the promoted website found on the target site also means already published — report skipped with the reason. Never re-submit an item whose outcome is unknown: report failed with failureMode manual_required instead.
```

#### Token effect

Fixed guidance cost per request while the tool is registered, plus the bounded batch/lease/mail summaries each call returns.

#### KV Cache effect

Stable tool schema and prompt section; no request-prefix churn across calls.

### Foreground publisher

#### What the model sees

The opt-in `backlink_publish` schema is listed in the [tool catalog](../../../docs/tool-catalog.md#deepseek-aidsh-tool-backlinks). It returns counts and a stop reason to the parent. Children receive assigned task data, the configured persona and scoped browser/backlinks guidance; their ordinary tool calls and results remain in child session logs.

#### Token effect

One parent call coordinates the selected queue without polling or copying task prompts. Fixed discipline appears once per child context. Verification reads run in code; reported child usage and provider budgets retain their existing meanings.

#### KV Cache effect

Child persona and tool schemas are stable across items; item and page identifiers appear in task data rather than changing the schema prefix.

## Known Limitations and Deferred Work

- **No batch progress events** — progress is observed per call; a lease/progress event stream is deferred.
- **Mail wait is tool-call-length** — bounded by the tool's `timeoutMs`; longer waits mean repeated `mail_wait` calls.
