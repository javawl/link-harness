# Agent Note: backlinks duplicate-publish guard — verify records before re-submitting

Status: implemented

English | [中文](2026-09-01-backlinks-duplicate-publish-guard.zh.md)

## Problem

Re-running a publish batch could re-submit a source that was already successfully published. The backend lease makes execution mutually exclusive per batch and `batch_claim` only accepts `pending`/`failed` items, but an already-published source can still reach the browser: supermanager clears `executed_publish_record_id` whenever an item returns to `pending`/`failed` (a record edited to `recorded`/`failed` reopens its linked item), and the model had no standing rule to consult publish records before submitting. A second submission of the same website on the same target site reads as spam to the site owner and pollutes the publish history.

## Decision

One rule — an already-published source is skipped, never re-submitted — carried on three surfaces:

1. The `backlinks` tool prompt section ([`tool-backlinks`](../../../../packages/backlinks/tool-backlinks/src/backlinks.ts)) states the verify-before-publish rule: an item whose `publishStatus` is `submitted` or `live`, or whose `publishedUrl` is set, is already published; a source with such a record on any item of the batch is done; an existing link to the promoted website found on the target site means skip too. Skips report `skipped` with the reason. An integration test pins the sentences.
2. The `backlink-publish` skill partitions already-published items out during `batch_get` (before any claim or ask-user card), applies the same check as step 1 of the per-item loop, and searches the target site for the promoted website's link during recon. A `submitted` item whose public page now shows the link may be re-verified and written back as `live` using the existing `publishedUrl` — verification only, never a new submission. Subagent prompts carry `publishStatus`/`publishedUrl` and the verify-first instruction; run summaries list skipped-as-published items separately.
3. The seam vocabulary ([`dsh-backlinks`](../../../../packages/backlinks/backlinks/src/types.ts)) documents `publishedUrl`/`publishStatus` as the already-published predicate on `BacklinkBatchItem`.

## Alternatives considered

- **Filter claimed items in the provider or the tool's `batch_claim` path** — claimable items are exactly `pending`/`failed`, and the backend clears the executed-record link on both paths back to executability, so the claim payload carries no already-published signal to filter on; executed items are already rejected by the backend claim.
- **Query supermanager publish records per item before publishing** — needs a new `/api/agent/*` endpoint in the backend, outside this repo; the batch detail already exposes every item's record, and the on-site link check covers records the agent API cannot see.
- **Rely on the on-site check alone** — record checks stop a duplicate before the browser opens the site (cheaper, no site contact); the on-site check catches backend-invisible duplicates. Both are kept; they are complementary.

## Consequences

- Re-runs are idempotent per source and website: an already-published source costs one `batch_get` inspection, not a second site submission, and the skip reason lands in the batch page.
- A `submitted` record whose site never lists the link is not auto-resubmitted. The operator marks the record `recorded`/`failed` in supermanager — which reopens the linked item — and the next run publishes again. Honesty over volume; the human owns the retry decision the agent cannot verify.
- The guard is prompt-and-skill guidance, not a runtime gate: the prompt sentences are pinned by `packages/backlinks/tool-backlinks/tests/integration.spec.ts`, so silent removal fails a test, but a model ignoring guidance can still submit; the backend lease and claim rules remain the hard bounds.
