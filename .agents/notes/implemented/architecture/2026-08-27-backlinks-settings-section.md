# Agent Note: backlinks tokens and endpoints join the settings web configuration

Status: implemented

English | [中文](2026-08-27-backlinks-settings-section.zh.md)

## Problem

Deploying backlink-agent onto operator machines left the supermanager and cloud-mail tokens reachable only through cordis.yml config or environment variables (the repo-root `.env`). Non-technical users fumble files and variable formats — "missing .env" is a real onboarding ticket. The harness already has the settings capability (`$DSH_HOME/settings.yaml`, hot reload, UI redaction, configuration UIs rendering forms per namespace) and `llm-pi-ai` already uses it; these two providers were the only model-visible capability still forcing file-based configuration. The configuration surface was the wrong choice, not the capability.

## Decision

Each provider registers a settings namespace (`backlinks-supermanager`, `backlinks-cloud-mail`) hooked through `installSettingsSection` with the composition entry as `base`:

1. The section carries only what a user must touch: `baseUrl` and `token` (`token` is `role('secret')` — write-only on configuration surfaces). `requestTimeoutMs` stays in composition and out of user settings.
2. Per-field resolution order: settings user layer > composition preset > `SUPERMANAGER_TOKEN` / `CLOUDMAIL_TOKEN` environment fallback. A settings change disposes and re-registers the same provider id — effective on save, no restart; with the settings service absent (a minimal headless composition) or detached, behavior falls back to the composition entry exactly as before integration.
3. The `validate` hook refuses a non-http(s) `baseUrl` write (refused at write time, not stored-then-broken); apply keeps the same check on the entry as load-time fail-loud. With an empty token the provider reports `available() === false`, so the process may boot first and be configured in the web page afterwards — breaking the "no token → cannot boot → cannot reach the settings page" deadlock.
4. Onboarding scripts follow: the `start.sh` token gate downgrades from hard failure to a missing-token hint; `setup.sh` no longer generates `.env`, and the Chrome check downgrades from blocking to advisory.

## Consequences

- Operators onboard in three steps: setup.sh installs, start.sh boots, the web settings page takes three tokens and the production endpoint. `.env`/environment variables demote to a bulk-provisioning path that still sits inside the resolution chain.
- Tokens live only in the local `$DSH_HOME/settings.yaml`, render redacted in the UI, and never enter session records.
- The standing convention survives: one `SUPERMANAGER_TOKEN` per machine, audit records attribute by token.

## Alternatives considered

- **Document the .env flow better** — does not address the root cause: non-technical users hunting files, editing formats, or dropping the file in the wrong directory.
- **Put tokens into the composition file (cordis.yml config)** — per-machine file edits and a real risk of tokens landing in git.
- **Reuse the credential store (`$DSH_HOME/.credentials.yaml`)** — that layer serves model keys and the Models page; backend service tokens fit the settings namespace, matching the existing "configuration UIs render per namespace" mechanism without mixing layers.
