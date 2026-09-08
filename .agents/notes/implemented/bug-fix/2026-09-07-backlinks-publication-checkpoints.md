# Agent Note: Publication checkpoints and website defaults

Status: implemented

English | [中文](2026-09-07-backlinks-publication-checkpoints.zh.md)

## Problem

A foreground batch result arrives too late to protect unfinished submissions after cancellation or a process restart. Saved skipped/failed outcomes also need to prevent later browser input. Checking any visible target href cannot establish that the assigned source published it, and deduplicating before a manual selection can silently remove the selected item. Treating every local budget stop as a batch-wide failure leaves unrelated work untouched.

## Decision

The backlinks consumer appends log-only `backlinks/attempt` records and awaits the session flush before handing claimed items to a model. The parent log retains each admitted item independently of the final tool result. Cancellation and compaction preserve the exclusion; an attempted item still pending requires reconciliation. A failed checkpoint prevents the child's first request. The runtime invariant rejects a repeated admission in one session. This extends the durable-result guard in [request budgets](2026-09-05-backlinks-request-budgets.md), whose request accounting and native child ownership remain active.

A saved item result blocks further browser input and navigation. Closing a page requires submission certainty in addition to its saved status. live and submitted require a declared final submission; an existing backlink is skipped. A live URL must use an assigned source or submission hostname, ignoring a leading www, and cannot use the promoted website or target hostname. The provider still verifies the actual href. Manual item selection precedes eligible-source deduplication, while already-published sources remain excluded across the full batch.

Supermanager uses explicit anchors when present. Otherwise, saved website name and siteUrl provide the default text and URL, with no fabricated backend anchor id or website write. This replaces mandatory separate-anchor setup in [page retention and preflight](2026-09-07-backlinks-retained-pages.md). Invalid explicit anchors still fail; absent usable defaults still stop before pages, claims or model calls.

The native driver reports per-run exhaustion as budget-exhausted. The publisher reconciles local budget and output-token stops, then continues unrelated items. A previously attempted source without a saved result, or an item whose reconciliation fails, is excluded from dispatch and reported in unresolvedItemIds without rewriting its backend status. Unknown submissions retain their pages. Empty remaining work with no stoppedReason finishes the selected execution; unresolved items are listed for manual review. Terminal model errors, checkpoint failures, lost leases and backend authorization failures stop new admissions. Request-time budget checks include retries without replacing a terminal provider error with a local budget diagnostic.

## Alternatives considered

**Depend on final result metadata.** Cancellation replaces tool results and crashes can prevent a result entirely. The pre-request checkpoint preserves the admitted item while its outcome is still unknown.

**Infer success from any matching link.** A self-link on the promoted homepage satisfies href equality but is not a backlink from the assigned source. Source ownership and a declared submission are separate required facts.

**Require an extra anchor row for every website.** The user-approved website profile already supplies the default name and URL. Reusing that authoritative data avoids duplicate setup; inventing text from page copy or silently replacing invalid explicit anchors remains disallowed.

**Stop every batch at any child budget or unresolved item.** A local limit or missing result cannot establish that another source is unavailable. Persistent attempt exclusion prevents resubmission without blocking unrelated sources. Backend skipped is reserved for a conclusive skip outcome; unresolvedItemIds preserves uncertainty separately. Global resource and storage errors retain their stop behavior.

## Consequences

A checkpoint adds storage work, not model context or another model request. Correctness depends on the configured persistence backend honoring session flush; an in-memory composition cannot survive process loss. Legacy result metadata remains readable, but earlier interrupted calls without attempt records still need backend and child-log review. Exact hostname matching does not infer unrelated redirect domains; an authorized publication domain belongs in source data.

Public-boundary regressions cover cancellation with failed backend reconciliation, checkpoint failures, terminal input denial, unrelated live URLs, manual selection, local budget continuation and quota preservation. The assembled publisher scenario exercises the real Supermanager parser, Chrome, native children and persisted parent attempts. Tests do not establish production token savings, anonymous link accessibility or third-party acceptance rates.
