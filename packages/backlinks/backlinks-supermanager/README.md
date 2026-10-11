---
description: "Service Provider for the backlinks batch work-source seam: a Bearer-token HTTP client over the supermanager agent API."
kind: "package-reference"
---

# @deepseek-ai/dsh-backlinks-supermanager

English | [中文](README.zh.md)

<a id="summary"></a>
## Summary

Service Provider for the backlinks batch work-source seam: a Bearer-token HTTP client over the supermanager `/api/agent/*` surface (batch listing/detail, lease claim/heartbeat/release, closed-union item write-back, reciprocal badges). HTTP statuses map onto the seam taxonomy; lease-conflict `Retry-After` survives as `retryAfterSeconds`.

<a id="table-of-contents"></a>
## Table of Contents

- [Configuration](#configuration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

| Package | Role | ctx key |
|---|---|---|
| `dsh-backlinks` | Service Definition | `ctx.backlinks` |
| `dsh-backlinks-supermanager` (this) | Service Provider: supermanager HTTP batch source | registers on `ctx.backlinks` |
| `dsh-tool-backlinks` | Consumer: the model-facing `backlinks` tool | `ctx.tools` |

<a id="configuration"></a>
## Configuration

| Field | Default | Purpose |
|---|---|---|
| `baseUrl` | (empty) | Deployment base URL, for example `http://127.0.0.1:3000`; empty = provider unavailable |
| `token` | `SUPERMANAGER_TOKEN` env | Bearer agent token from the backend's Agent 接口 settings page |
| `requestTimeoutMs` | `15000` | Per-request timeout |

<a id="model-experience"></a>
## Model Experience

Indirectly, through `dsh-tool-backlinks`; this provider contributes no prompt or schema of its own.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No pagination on `listBatches`** — the backend returns the full workspace list; fine for current scale.
- **Lease heartbeats are caller-driven** — the provider exposes the operation; cadence belongs to the consumer.

-----

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
