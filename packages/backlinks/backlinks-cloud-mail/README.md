# @deepseek-ai/dsh-backlinks-cloud-mail

English | [中文](README.zh.md)

Service Provider for the backlinks mailbox seam: a cloud-mail Open-API client. Creates verification addresses (`/public/addUser`) and polls received mail (`/public/emailList`) under the caller's bounded wait; the backend's AI-extracted `code` and the first body URL surface on `VerificationMail`.

| Package | Role | ctx key |
|---|---|---|
| `dsh-backlinks` | Service Definition | `ctx.backlinks` |
| `dsh-backlinks-cloud-mail` (this) | Service Provider: cloud-mail mailboxes | registers on `ctx.backlinks` |
| `dsh-tool-backlinks` | Consumer: the model-facing `backlinks` tool | `ctx.tools` |

## Configuration

| Field | Default | Purpose |
|---|---|---|
| `baseUrl` | (empty) | Worker API base, for example `https://mail.example.org/api`; empty = provider unavailable |
| `token` | `CLOUDMAIL_TOKEN` env | Open-API token (admin-generated) |
| `requestTimeoutMs` | `15000` | Per-request timeout |

## Model Experience

Indirectly, through `dsh-tool-backlinks`; this provider contributes no prompt or schema of its own.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

- **Polling only** — cloud-mail has no webhook; `pollMail` polls at the caller's interval until the deadline.
- **No mailbox cleanup** — created addresses persist in cloud-mail; lifecycle pruning is a backend concern.
