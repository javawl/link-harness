---
description: "Service Definition for the backlinks capability seam: two provider registries, the closed-union item-result vocabulary, and the error taxonomy."
kind: "package-reference"
---

# @deepseek-ai/dsh-backlinks

English | [中文](README.zh.md)

<a id="summary"></a>
## Summary

Service Definition for the backlinks capability seam (`ctx.backlinks`): two provider registries — batch work sources and mailboxes — each with web-seam-shaped execution-time selection, plus the closed-union `BacklinkItemResult` vocabulary and the `BacklinksError` taxonomy.

<a id="table-of-contents"></a>
## Table of Contents

- [Service API (ctx.backlinks)](#service-api)
- [Selection](#selection)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

| Package | Role | ctx key |
|---|---|---|
| `dsh-backlinks` (this) | Service Definition | `ctx.backlinks` |
| `dsh-backlinks-supermanager` | Service Provider: supermanager HTTP batch source | registers on `ctx.backlinks` |
| `dsh-backlinks-cloud-mail` | Service Provider: cloud-mail mailboxes | registers on `ctx.backlinks` |
| `dsh-tool-backlinks` | Consumer: the model-facing `backlinks` tool | `ctx.tools` |


<a id="service-api"></a>
## Service API (ctx.backlinks)

| Member | Purpose |
|---|---|
| `registerBatchSourceProvider` / `registerMailboxProvider` | Register a provider; duplicate ids throw `BACKLINKS_DUPLICATE_PROVIDER`; fiber-scoped disposers |
| `listBatches` / `getBatch` | Batch listing and detail (website, anchors, items) |
| `claim` / `heartbeat` / `release` | Lease lifecycle over one batch |
| `reportItemResult` | Closed-union write-back: live/submitted/failed/skipped |
| `addBadge` | Reciprocal footer badge |
| `createMailbox` / `pollMail` | Verification address creation and bounded mail wait |

<a id="selection"></a>
## Selection

Configured id must be registered and `available()`; otherwise exactly one usable provider per registry. `$DSH_BACKLINKS_BATCH_SOURCE` / `$DSH_BACKLINKS_MAILBOX` equal the config fields.

<a id="model-experience"></a>
## Model Experience

Indirectly, through `dsh-tool-backlinks`, which returns bounded batch/lease/mail summaries and the exact provider-selection failures while this registry contributes no prompt or schema itself.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No observation surface** — no batch-progress events; callers observe outcomes per call.
- **One workspace per provider instance** — the backend binds identity to the configured token; multi-workspace fan-out means multiple provider configs.
- **`pollMail` matching is substring-only** — subject/sender filters are case-insensitive substrings; structured sender parsing is deferred.

-----

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
