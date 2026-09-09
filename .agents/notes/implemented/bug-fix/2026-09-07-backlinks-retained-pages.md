# Agent Note: Backlink page retention and publication preflight

Status: implemented

English | [中文](2026-09-07-backlinks-retained-pages.zh.md)

## Problem

Completed manual-required failures occupy browser slots even when no final submission occurred. A small total-page ceiling then stops unrelated pending work. Missing website anchors cause repeated paid attempts and item failures, while relative destinations cannot pass absolute-URL verification.

## Decision

Page retention follows submission certainty and [manual browser control](2026-09-09-background-publication.md). A saved retryable failure releases its owned page only when no final publication was declared and no input became uncertain. Manual-required failures and unknown submissions retain both their review status and page. Foreign pages are never reclaimed.

The backlink deployment uses `maxOpenPages: 0`, which disables the browser's total-page ceiling; three active publisher slots and per-host serialization still bound active work. Positive browser ceilings remain available to other deployments. This extends the page policy in [request budgets](2026-09-05-backlinks-request-budgets.md); its native budgets, request accounting and verification requirements remain active.

Anchor resolution follows [publication checkpoints and website defaults](2026-09-07-backlinks-publication-checkpoints.md). Supermanager prefers configured anchors and otherwise uses the saved website name and URL; missing usable data stops before pages, claims or model work. Relative explicit destinations resolve against the website URL, and invalid explicit anchors still fail at JSON parsing.

## Alternatives considered

- Raising the ceiling postpones the same stop as review pages accumulate.
- Closing every failed page can discard an unknown submission; backend failure status alone does not establish whether closing is safe.
- Fabricating a default anchor inside publication bypasses the approved website data and conceals a configuration error.

## Consequences

Retained pages can grow browser memory; supervision must measure resources and preserve uncertain work. Reopening a manual-required item still needs backend review and the existing session exclusion rules. [Publisher snapshots](../../../../examples/backlink-agent/tests/publisher.snapshot.ts) cover a batch rejected without children, and [browser snapshots](../../../../examples/backlink-agent/tests/browser-capacity.snapshot.ts) cover positive ceilings and seven retained pages with the ceiling disabled. Focused regressions cover terminal-page reuse and relative URL parsing.
