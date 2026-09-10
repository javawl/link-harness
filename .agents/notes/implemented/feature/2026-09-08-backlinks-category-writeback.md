# Agent Note: Category write-back on successful publication

Status: implemented

English | [中文](2026-09-08-backlinks-category-writeback.zh.md)

## Problem

Many supermanager sources have an empty `category`; the publisher judges the site type during reconnaissance anyway (the six playbooks). That judgment was discarded, so sources stayed uncategorized until a human filled them in.

## Decision

Successful publication now back-fills the source category when — and only when — it is empty. The judged type travels with the item result instead of a separate call, so no extra request or ordering window exists.

The [seam](../../../../packages/backlinks/backlinks/README.md) extends `BacklinkItemResult`: `live`/`submitted` may carry an optional `category`, sent only when the item's own `category` is null. The [consumer](../../../../packages/tool-backlinks/README.md) parses it, documents it in the tool schema and prompt guidance, and the [publication runtime](../../../../packages/backlinks/tool-backlinks/README.md) rejects a `category` reported for an already-categorized item (loud local guard; the failed call does not consume the item result, so the child re-reports without it). The [supermanager provider](../../../../packages/backlinks/backlinks-supermanager/README.md) forwards the field on the existing `/api/agent/items/:id/result` call.

The backend (separate supermanager deployment) resolves the name against active workspace `source_categories` and fills `sources.category_id` in one guarded statement — `category_id IS NULL`, matched by exact name, active only. An unknown name is a no-op recorded in the audit metadata (`category`, `categoryFilled`), never a failed publish. The write shares the result transaction.

The publisher persona instructs children to attach the category (导航站/博客/论坛/内容站/游戏站/工具站) on live/submitted when the assigned item is uncategorized, and to omit it rather than guess.

## Alternatives considered

- A dedicated `setSourceCategory` endpoint keeps payloads pure but adds a second request, a race window against human edits, and failure handling for a secondary effect.
- Overwriting the category whenever judged would clobber human curation; the empty-only guard is server-authoritative, not client-polite.
- Restricting the tool schema to an enum of six would bake supermanager's seeded vocabulary into the generic seam; the free string with prompt-level discipline supports workspace-defined categories.

## Consequences

Provider tests cover the wire flattening; publisher tests cover the passthrough and the loud rejection; the publisher fixture enforces both directions as backend invariants and the Chrome snapshots assert the judged category in child `tool/call` events. Server-side tests cover name matching, the submitted variant, the unknown-name no-op, and omission. Deploying the harness change before the backend accepts `category` is harmless: the backend ignores unknown body fields, so old deployments just never fill the category.
