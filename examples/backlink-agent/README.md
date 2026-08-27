# backlink-agent — autonomous backlink publishing operator

English | [中文](README.zh.md)

Runs the supermanager publish-batch workflow end to end: pick a batch, drive each target site in one shared persistent Chromium, receive verification mail through cloud-mail, verify public listings, and write every item's outcome back. CAPTCHAs and first logins park the item as `manual_required` while the headed browser stays open for a human to solve once; the persistent profile then carries the session forward.

## Prerequisites

- supermanager running and an agent token created at 系统设置 → Agent 接口 → `SUPERMANAGER_TOKEN`
- cloud-mail Open-API token → `CLOUDMAIL_TOKEN`
- local Google Chrome (the Playwright provider's default channel)

## Run

```sh
SUPERMANAGER_TOKEN=smag_… CLOUDMAIL_TOKEN=… \
  pnpm dsh --patch examples/backlink-agent/cordis.yml "发外链"
```

The agent lists batches, asks you to pick one and a scope, claims the lease, and reports a per-item summary. Say "执行批次 176" to skip the picker; manual_required items re-enter the run automatically after a human clears the browser challenge.

## Onboarding another machine

One-time setup on a new Mac: `bash examples/backlink-agent/setup.sh <repo-url>` (installs Node 24/pnpm, clones, installs deps, writes an `.env` from `.env.example`). Daily start: `bash examples/backlink-agent/start.sh`. The supermanager endpoint comes from `SUPERMANAGER_BASE_URL` in `.env` (production domain or a local dev instance), so the composition itself needs no per-machine edits; create a separate agent token per machine in the backend so audit records stay attributable.

## Quick entries

Typing `/` in the web composer opens the skill trigger picker; a `/name` token in any message injects that skill's full body:

- `/backlink-publish` — start the flow with clickable batch cards; a second card picks the run mode — smart-match (publish only recognized site types, skip unknown) or try-all (attempt every item regardless of type)
- `/backlink-publish 176` — publish batch 176 directly
- `/google-session` — seed or check the shared browser's Google session

## Composition

| Entry | Role |
|---|---|
| `llm-deepseek` (disabled) + `llm-pi-ai` | model adapter over an OpenAI-compatible gateway (key from the root `.env`) |
| `agent-spine` | one `main` agent per run, session persisted under `./.sessions` |
| `skills` (`dsh-skill-filesystem`) | the six-playbook `backlink-publish` skill from `./skills` |
| `browser` + `browser-playwright` + `tool-browser` | shared persistent Chromium, headed by default |
| `backlinks` + two providers + `tool-backlinks` | batch work source (supermanager) and mailboxes (cloud-mail) |

Site-type playbooks live in [`skills/backlink-publish/references/`](skills/backlink-publish/references/); the status model and write-back contract mirror the backend's `/api/agent/*` surface.

## Google-login sites

Many directory sites only offer "Continue with Google". Say **"初始化谷歌会话"** once: the agent parks the shared browser on `accounts.google.com`, you finish the login (2FA included) by hand in the popped-up Chrome window, and the session cookie persists in the shared profile for every later batch. From then on the agent completes the OAuth hop (account picker → Allow → back to the site) fully automatically; if the session ever expires, the item parks as `manual_required` asking you to re-seed. Use a dedicated Google account — directory sites receive its profile grant. Details: [`references/google-session.md`](skills/backlink-publish/references/google-session.md).
