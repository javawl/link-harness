# Agent Note: Backlinks capability seam — one workflow, two backends

Status: implemented

English | [中文](2026-08-25-backlinks-capability-seam.zh.md)

## Problem

The backlink-publishing workflow needs two external backends to work: the backlink management system (supermanager) owns the publish batches, leases, and result write-back; the mail system (cloud-mail) owns the verification addresses that unblock site registrations. Both are HTTP APIs with their own credentials, error shapes, and operational rules (lease conflicts with `Retry-After`, the "never re-submit an unknown outcome" write-back rule). Without a seam, the first consumer would inline both clients, own credential handling and error mapping in tool code, and every backend change would become a model-contract change.

The write-back contract itself also needed one owner: the workflow's safety rules (closed result statuses, retryable vs manual_required failure modes, timeout/lease discipline) must be vocabulary, not prose repeated across call sites.

## Decision

Backlinks is a capability seam following the shared doctrine, with **two registries on one service** (`ctx.backlinks`), the same shape `ctx.web` uses for search+fetch:

1. `@deepseek-ai/dsh-backlinks` (`packages/backlinks/backlinks`) owns `ctx.backlinks`, both provider registries with execution-time selection, the `BacklinkItemResult` closed union, and the `BacklinksError` taxonomy.
2. `@deepseek-ai/dsh-backlinks-supermanager` implements the batch work source over `/api/agent/*`: batches, lease claim/heartbeat/release, item write-back, reciprocal badges. HTTP statuses map onto the taxonomy; `Retry-After` survives as `retryAfterSeconds`.
3. `@deepseek-ai/dsh-backlinks-cloud-mail` implements the mailbox over the Open API: address creation and bounded mail polling with the backend-extracted verification code and first body link.
4. `@deepseek-ai/dsh-tool-backlinks` owns the model-facing `backlinks` tool — one tool with an `action` discriminant mirroring the browser tool's single-surface shape — including the prompt guidance that encodes the workflow's safety rules (heartbeat cadence, unknown-outcome discipline).

Providers register capabilities, never tools. Tokens resolve through config or the `SUPERMANAGER_TOKEN` / `CLOUDMAIL_TOKEN` environment fallback; `available()` is a local presence check.

## Consequences

- `BacklinkItemResult` is compile-closed: adding a status breaks providers and the consumer until handled, and lands together with the matching backend contract change.
- Lease and item state live in the backend; the seam is stateless, so a crashed consumer loses nothing — the lease expires server-side and items return to claimable.
- The model-facing verb set is stable across backend swaps; supermanager- or cloud-mail-specific behavior cannot leak into the tool schema.
- Verification mail is first-class vocabulary (`VerificationMail.code`/`link`), so the workflow's human-intervention points shrink to browser challenges only.

## Alternatives considered

- **One provider package per backend with its own tools** — rejected: model-visible schemas would depend on whichever backend packages load, and provider-specific fields would leak into the model contract.
- **Two seams (batch + mail)** — rejected for now: two selection owners, two error taxonomies, and two config surfaces for one workflow; revisit if an independent mail consumer appears.
- **Typed result structs instead of a closed union** — rejected: the write-back statuses are a backend contract; a closed union makes every addition a deliberate, compile-visible change.
- **Provider-side lease auto-heartbeat** — rejected: cadence is consumer policy; the provider exposes the primitive so different runners can choose their own rhythm.
