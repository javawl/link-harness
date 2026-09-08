# Link Harness — Backlink Publishing Agent Platform

English | [中文](README.zh.md)

A specialized fork of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) — an open-source agent harness powered by [Cordis](https://github.com/cordiverse/cordis) — extended into a **professional backlink publishing agent platform**. The agent reads publish batches from a backlink management backend (supermanager), drives a real Chrome browser across directory/blog/forum/content/gaming/tools sites, verifies public listings, and writes every outcome back with automatic tagging.

## What it does

```
Click a batch in the sidebar "Publish Batches" tab → pick scope + mode
  → Agent claims the lease, fans out parallel workers (one Chrome tab per domain)
      → surveys each site (aria snapshots + semantic selectors)
      → registers with throwaway mailboxes (cloud-mail) when needed
      → passes Google OAuth sites with the seeded session
      → fills forms from the curated website profile pack
      → submits → verifies the public listing → writes back honestly
      → auto-tags: 免徽章 / 要徽章 / 可复用 / 有盾
  → releases the lease → per-item summary
  CAPTCHAs surface the browser window for one manual pass; sessions persist
```

Three systems, one pipeline: **supermanager** (data & batches), **link-harness** (this repo — agent, skills, console), **cloud-mail** (verification mailboxes).

## Platform capabilities beyond upstream

| Capability | What it adds |
|---|---|
| **Browser seam** (`packages/browser/`) | Persistent real Chrome, multi-tab page-ref addressing with per-tab locking (parallel tabs, shared cookie jar), semantic element selectors (`role:`, `label:`, `placeholder:`, `text:`, `xy:` coordinates, iframe chains), aria snapshots, anti-automation flags, offscreen silent window with `bringToFront` recall |
| **Backlinks seam** (`packages/backlinks/`) | Batch work source (supermanager) + mailbox provider (cloud-mail) + model-facing tool: claim/lease/heartbeat/release, per-item result write-back, reciprocal badge flow with footer-refresh verification, automatic source tagging, website submission profile pack |
| **Publish console** (`packages/client/ui-backlinks-console/`) | Sidebar tab with batch cards, status chips, executing pulse, inline item details, search, 30s auto-refresh, one-click publish into a fresh session |
| **Publish skill** (`examples/backlink-agent/skills/`) | Six site-type playbooks (directory/blog/forum/article/gaming/tools), dual execution mode (smart-match / try-all), parallel topology grouped per domain, Google session management |
| **Console Remote** (`packages/backlinks/console/`) | Read-only Remote service exposing batch data to the Web console |

## Quick start

### Prerequisites

- Node.js ≥24, pnpm 9+, Google Chrome

### One-time setup

```sh
git clone https://github.com/javawl/link-harness.git
cd link-harness
pnpm install
pnpm run build
```

Create `.env` in the repo root:

```sh
NEWAPI_API_KEY=sk-…          # model gateway (any OpenAI-compatible endpoint)
SUPERMANAGER_TOKEN=smag_…    # from supermanager → Settings → Agent API
CLOUDMAIL_TOKEN=uuid         # from cloud-mail Open API
# SUPERMANAGER_BASE_URL=https://link.screwdom.org  # uncomment to use production
```

### Run

```sh
pnpm dsh web --patch examples/backlink-agent/cordis.yml --port 8787
```

Open `http://127.0.0.1:8787` — the sidebar has a **Publish Batches** tab.

### New machine onboarding

```sh
bash examples/backlink-agent/setup.sh    # installs Node 24/pnpm, clones, generates .env template
bash examples/backlink-agent/start.sh    # daily start
```

### Daily usage

| Action | How |
|---|---|
| Publish a batch | Sidebar → Publish Batches tab → click [Publish] on a batch row |
| Publish via chat | `/backlink-publish` (picks via card) or `/backlink-publish 176` (direct) |
| Seed Google session | `/google-session` — log in by hand once in the popped Chrome, OAuth sites pass automatically afterwards |
| One-shot CLI | `pnpm dsh --profile headless --patch examples/backlink-agent/cordis.yml "发布批次 176"` |

## Website submission profile pack

Edit a website in supermanager and fill the "submission profile" section: one-liner, long description, logo URL (1:1), screenshot URL (16:9), key features, pricing type. The agent prefers these on every submission (cropping copy to each site's length limit, downloading and cropping images), self-discovers only missing fields, and records the source in its evidence.

## Automatic source tagging

After every publish attempt the agent tags the target site in supermanager: `免徽章` (no badge required), `要徽章` (badge required), `可复用` (published successfully), `有盾` (Cloudflare challenge encountered). Tags resolve by name per workspace, attach idempotently, and never detach.

## Architecture

DeepSeek Harness's everything-is-a-plugin architecture is preserved; the backlink capabilities are proper Cordis capability seams:

```
packages/browser/     browser + browser-playwright + tool-browser + console Remote
packages/backlinks/   backlinks + backlinks-supermanager + backlinks-cloud-mail + tool-backlinks
packages/client/      ui-backlinks-console (sidebar tab + publish console)
examples/backlink-agent/  runnable composition + skills (backlink-publish, google-session)
```

See [docs/architecture.md](docs/architecture.md) for the harness core and [examples/backlink-agent/README.md](examples/backlink-agent/README.md) for the publishing agent.

## Development

Start with the [development guide](docs/development.md) and [architecture documentation](docs/architecture.md). For agents, follow [AGENTS.md](AGENTS.md).

```sh
pnpm run test      # vitest unit tests
pnpm run typecheck
pnpm run lint
pnpm run build
```

## Upstream attribution

This repository is a fork of [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) at commit `b150a551b8`. The upstream project is in developer preview and iterating rapidly; this fork specializes it for backlink publishing and diverges in `packages/browser/`, `packages/backlinks/`, `packages/client/ui-backlinks-console/`, and `examples/backlink-agent/`.

## License

[MIT](LICENSE)

Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
