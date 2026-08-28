# backlink-agent — autonomous backlink publishing operator

English | [中文](README.zh.md)

backlink-agent is a backlink publishing operator that runs on your own machine: it pulls publish batches from the supermanager backend, drives each target site in one shared persistent Chrome (registration/login/submission), receives verification mail through cloud-mail and extracts the codes, verifies public listing pages, and honestly writes every item's outcome back to the backend. You only pick the batch, do first-time site logins, and clear the occasional CAPTCHA — everything else is automatic.

## How a run works

A typical publish run: the agent lists pending batches over the backend's agent open API, you pick a batch and scope, and it claims a lease (90-minute mutual exclusion — several machines publishing concurrently never double-submit an item). It then drives the shared browser item by item, choosing the playbook for each site type. On a CAPTCHA or first login the item parks as `manual_required` with the browser window held open; once a human clears it once, the session in the persistent profile lets later items on the same site pass fully automatically. Every result writes back under the status model: `live` (verified publicly visible), `submitted` (awaiting the site's review), `failed` (manual-required or retryable), `skipped` (paid/eligibility mismatch). An unknown outcome is never resubmitted — the item parks for a human instead, so publish records stay honest.

## Onboarding another machine (three steps)

1. **Install (once per machine)**: `bash examples/backlink-agent/setup.sh <repo-url>` — installs Node 24 and pnpm, clones the repo, and installs dependencies. Publishing needs a local Google Chrome; the script checks and points you to it.
2. **Start**: `bash examples/backlink-agent/start.sh`. Launch depends only on node; the browser opens `http://127.0.0.1:8787` automatically.
3. **Configure tokens (web settings page, effective on save)**: after first launch fill three tokens and the backend URL in the web settings page — no file editing. `NEWAPI_API_KEY` (model-gateway key, shared across the team), `SUPERMANAGER_TOKEN` (created per machine at supermanager 系统设置 → Agent 接口; audit records attribute by token), `CLOUDMAIL_TOKEN` (verification mail, shared); set the supermanager base URL to `https://link.screwdom.org` for production (the default is a local dev address).

Resolution order: web settings page > composition presets > environment variables and the repo-root `.env` (template in [`.env.example`](.env.example), kept for bulk machine provisioning). Editing a token or URL in the settings page takes effect immediately, without a restart.

## Daily use

Typing `/` in the web composer opens the skill trigger picker; a `/name` token in any message injects that skill's full body:

- `/backlink-publish` — start the flow with clickable batch cards; a second card picks the run mode — smart-match (publish only recognized site types, skip unknown) or try-all (attempt every item regardless of type)
- `/backlink-publish 176` — publish batch 176 directly
- `/google-session` — seed or check the shared browser's Google session

A headless one-shot also works: `pnpm dsh --patch examples/backlink-agent/cordis.yml "发外链"`. Say "执行批次 176" to skip the picker; `manual_required` items re-enter the run automatically after a human clears the browser challenge.

## Composition

| Entry | Role |
|---|---|
| `llm-deepseek` (disabled) + `llm-pi-ai` | model adapter over an OpenAI-compatible gateway (key from the settings page or `.env`) |
| `agent-spine` | one `main` agent per run, session persisted under `./.sessions` |
| `skills` (`dsh-skill-filesystem`) | the six-playbook `backlink-publish` skill from `./skills` |
| `browser` + `browser-playwright` + `tool-browser` | shared persistent Chrome, headed by default, human can step in anytime |
| `backlinks` + two providers + `tool-backlinks` | batch work source (supermanager) and mailboxes (cloud-mail); tokens and URLs configurable in the settings page |

Site-type playbooks live in [`skills/backlink-publish/references/`](skills/backlink-publish/references/); the status model and write-back contract mirror the backend's `/api/agent/*` surface.

## Google-login sites

Many directory sites only offer "Continue with Google". Say **"初始化谷歌会话"** once: the agent parks the shared browser on `accounts.google.com`, you finish the login (2FA included) by hand in the popped-up Chrome window, and the session cookie persists in the shared profile for every later batch. From then on the agent completes the OAuth hop (account picker → Allow → back to the site) fully automatically; if the session ever expires, the item parks as `manual_required` asking you to re-seed. Use a dedicated Google account — directory sites receive its profile grant. Details: [`references/google-session.md`](skills/backlink-publish/references/google-session.md).

## Security notes

An agent token is a data write capability: one per machine, never share it or commit it to git; if one leaks, revoke and re-create it at supermanager 系统设置 → Agent 接口. Token fields render redacted on the settings page and are stored under the local `~/.dsh/` directory — they never enter session records.
