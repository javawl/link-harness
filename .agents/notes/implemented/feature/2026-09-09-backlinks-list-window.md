# Agent Note: Bound publication-list rendering and refresh work

Status: implemented

English | [中文](2026-09-09-backlinks-list-window.zh.md)

## Problem

Every batch row subscribes to console state. Rendering the full history multiplies work on refresh and panel remount, while repeated reads delay returning to a recently opened list. The upstream batch API has no pagination.

## Decision

The client retains fetched summaries but renders 50 matches initially, adding 50 per explicit Load more click. Filtering precedes slicing so old batches remain searchable. Select visible receives rendered ids only; selected ids remain independent of the display window. The [selection decision](2026-09-05-backlinks-batch-selection.md) continues to own submission and session targeting.

The store shares in-flight refreshes and reuses successful results within the caller's maximum age. The panel uses its 30-second polling interval as that age, skips hidden-tab polling, and checks freshness on visibility return. Manual refresh forces a read; failures retain prior data and permit retry.

## Alternatives considered

**Slice only the server response.** The provider would still download the whole upstream list, and searching older batches would require another API design. End-to-end pagination requires upstream support.

**Virtualize every row.** Explicit paging bounds initial rendering without introducing scroll geometry or focus bookkeeping. It also gives Select visible an explicit, testable set.

## Consequences

Initial rendering is bounded; response size and cold upstream latency are not. An operator can still reveal the whole history. Reopening the panel resets the display window, while selections survive. The [console README](../../../../packages/client/ui-backlinks-console/README.md) owns the user behavior.

## Verification

Component checks cover page boundaries, cross-window search and selection, refresh sharing, freshness expiry, forced retry, visibility changes and cleanup. The real Web scenario covers 50/100/125 rows, cached panel return, and desktop/narrow controls without external publication.
