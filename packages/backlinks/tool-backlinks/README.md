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

## Model Experience

### System prompt

#### What the model sees

The backlinks tool contributes the guidance below at registration time.

##### Backlinks tool guidance

```markdown
Use the backlinks tool to run the publish-batch workflow against the backlink management backend: batch_list → batch_get (pick a batch) → batch_claim (grants a lease; heartbeat every ~30s while working) → per item: browser publishes on the target site, then item_result reports live/submitted/failed/skipped → lease_release when done. mailbox_create + mail_wait receive site verification codes (returns code and first link). badge_add installs a reciprocal footer badge when a site requires exchange. Never re-submit an item whose outcome is unknown: report failed with failureMode manual_required instead.
```

#### Token effect

Fixed guidance cost per request while the tool is registered, plus the bounded batch/lease/mail summaries each call returns.

#### KV Cache effect

Stable tool schema and prompt section; no request-prefix churn across calls.

## Known Limitations and Deferred Work

- **No batch progress events** — progress is observed per call; a lease/progress event stream is deferred.
- **Mail wait is tool-call-length** — bounded by the tool's `timeoutMs`; longer waits mean repeated `mail_wait` calls.
