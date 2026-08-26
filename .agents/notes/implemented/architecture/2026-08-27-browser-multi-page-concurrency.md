# Agent Note: Browser multi-page addressing and per-tab concurrency

Status: implemented

English | [中文](2026-08-27-browser-multi-page-concurrency.zh.md)

## Problem

Backlink batches publish one item at a time because every browser command lands on "the active page": the seam serialized all commands through one global chain, the Playwright provider addressed only the most recently opened tab, and the model-facing tool offered no way to name a tab. A batch's total wall time is the sum of its items — including each mail-verification wait and every wrong-selector timeout — while the sites themselves are independent, so most of that time is idle serialization, not work. Opening a second browser session would duplicate the cookie jar (duplicate Google seeding, duplicate site logins) and multiply anti-bot surface, which is the wrong cure.

## Decision

Tabs, not sessions, are the unit of parallelism over the existing single persistent session:

1. Every `BrowserCommand` gains an optional `page` ref (`BrowserPageAddress`). A navigate naming an unused ref opens a new tab bound to that caller-chosen name; every later command addresses its tab by that ref; a command naming an unknown or closed ref fails loudly. Commands without a ref keep the legacy most-recent-tab contract, so existing single-tab callers are unchanged.
2. The seam drops its global command chain: dispatch is immediate over the lazily-opened (single-flight) session; ordering moves into the provider.
3. The Playwright provider keeps one serial chain per addressed tab. Same-tab commands keep dispatch order; different-tab commands overlap. Site-opened popups and persistent-context survivors are adopted as addressable pages; a tab closing (by us or by the site) drops its ref.
4. The model-facing tool threads a `page` argument through every action, returns the ref in each page capture (`[page pN] title`), and teaches ref discipline in its prompt section. One agent's own calls stay serial (`isConcurrencySafe` false); cross-agent parallelism is orchestration — the backlink-publish skill fans items out per host group, each child agent addressing its own ref, sharing one cookie jar and one lease.

## Consequences

- Cookie state stays shared and singular: one Google session, one set of site logins, one profile on disk.
- Same-site actions remain serial by construction (one chain per tab) and by skill rule (items grouped per host), keeping per-domain pacing.
- The closed `BrowserCommand`/`BrowserResult` unions grew a field, not a member; providers and consumers still switch to exhaustiveness.
- Legacy no-ref commands on a shared session can interleave with ref-addressed ones when a caller mixes styles; the contract says parallel callers must use refs for everything, and the skill's child prompts enforce it.
- Measured effect on mixed batches: mail waits and slow pages now overlap across items (batch wall time approaches the slowest item group instead of the sum).

## Alternatives considered

- **Multiple persistent contexts (profiles per worker)** — duplicates the cookie jar and the Google seeding, multiplies anti-bot surface; rejected as the wrong resource to duplicate.
- **Keeping the global chain and parallelizing only model reasoning** — page work stays serialized, so the dominant cost (page waits, mail polls) does not improve.
- **`connectOverCDP` remote browsers on user machines** — different problem (where the browser lives), adds a network trust boundary; out of scope for in-process throughput.
