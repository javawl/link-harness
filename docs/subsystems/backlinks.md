# Backlinks

English | [中文](backlinks.zh.md)

The backlinks seam — a capability seam with **two provider registries** on one `ctx.backlinks` service, split across packages: Service Definition ([dsh-backlinks](../../packages/backlinks/backlinks), `ctx.backlinks` + the registries and vocabulary), Service Providers ([dsh-backlinks-supermanager](../../packages/backlinks/backlinks-supermanager), the supermanager `/api/agent/*` batch work source; [dsh-backlinks-cloud-mail](../../packages/backlinks/backlinks-cloud-mail), the cloud-mail Open-API mailbox), and Consumer ([dsh-tool-backlinks](../../packages/backlinks/tool-backlinks), the `backlinks` tool schema). Backlinks is **one optional capability**, not part of the agent-loop spine — its vocabulary lives here, not in [core.md](core.md). Swapping either backend never changes how the model drives the publish-batch workflow.

Source: [`packages/backlinks/backlinks/src/types.ts`](../../packages/backlinks/backlinks/src/types.ts)

## Why one seam carries a work source and a mailbox

Batch execution and verification mail share no request schema, but they are deliberately one `ctx.backlinks` middle layer: one provider-selection policy owner, one abort/error vocabulary, and one product-facing "how this harness runs the publish workflow" configuration API. The cost is the parallel batch-source/mailbox method pairs on the service; that parallelism is intentional. Providers register **capabilities** (`BacklinkBatchSourceProvider` or `MailboxProvider`), not tools; the model-facing names, schemas, prompt guidance, and presentation all live in the single `dsh-tool-backlinks` consumer.

## Item-result vocabulary

`BacklinkItemResult` is a CLOSED union owned here — `live` (verified public URL + anchor snapshot), `submitted`, `failed` (with `retryable`/`manual_required` mode), `skipped` — mirroring the backend's write-back contract. The consumer `switch`es to exhaustiveness; the rule "never re-submit an item whose outcome is unknown" lives in the tool's prompt guidance and maps to `failed + manual_required`.

## Vocabulary

Batch: `BacklinkBatchSummary` → `BacklinkBatchDetail` (website, `anchors[]`, `items[]` with `submitUrl`/category/tags/failure mode) → `BacklinkLeaseClaim` (`leaseId`, server-clock `leaseExpiresAt`, claimed items) → `BacklinkHeartbeat` → `BacklinkItemOutcome`. Mail: `createMailbox(localPart, domain)` → `pollMail(address, { subjectContains?, fromContains?, timeoutMs, intervalMs })` → `VerificationMail` (`code` from the backend extractor, first body `link`). Cancellation is a direct optional `AbortSignal` argument on every method. See `src/types.ts` for the full contracts and the `BacklinksError` code taxonomy (HTTP statuses map onto `BACKLINKS_UNAUTHORIZED`/`NOT_FOUND`/`CONFLICT` with `retryAfterSeconds` preserved).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxbacklinks--backlinksruntime"></a>

### `ctx.backlinks` — `BacklinksRuntime`

The backlinks service. Registered as `ctx.backlinks` (one instance per context). Selection follows the shared execution-time rules: a configured id must be registered and `available()`; without one, exactly one usable provider is required.

```ts cordis-catalog
/**
 * Register a batch work source. Throws {@link BacklinksError}
 * `BACKLINKS_DUPLICATE_PROVIDER` on a duplicate id. Returns a disposer;
 * disposed with the calling fiber.
 * @param provider - the provider; its `id` is the registry key.
 * @returns the disposer that unregisters the provider.
 */
registerBatchSourceProvider(provider: BacklinkBatchSourceProvider): () => void

/**
 * Register a mailbox provider. Throws {@link BacklinksError}
 * `BACKLINKS_DUPLICATE_PROVIDER` on a duplicate id. Returns a disposer;
 * disposed with the calling fiber.
 * @param provider - the provider; its `id` is the registry key.
 * @returns the disposer that unregisters the provider.
 */
registerMailboxProvider(provider: MailboxProvider): () => void

/**
 * List every batch in the workspace.
 * @param signal - optional cancellation forwarded to the provider.
 * @returns batch summaries with per-status counts.
 */
async listBatches(signal?: AbortSignal): Promise<readonly BacklinkBatchSummary[]>

/**
 * Fetch one batch's execution inputs.
 * @param batchId - the batch to detail.
 * @param signal - optional cancellation forwarded to the provider.
 * @returns batch, website, anchors, and items.
 */
async getBatch(batchId: number, signal?: AbortSignal): Promise<BacklinkBatchDetail>

/**
 * Claim a batch for execution.
 * @param batchId - the batch to claim.
 * @param itemIds - optional explicit plan-item subset.
 * @param signal - optional cancellation forwarded to the provider.
 * @returns the granted lease and claimed item payloads.
 */
async claim(batchId: number, itemIds?: readonly number[], signal?: AbortSignal): Promise<BacklinkLeaseClaim>

/**
 * Extend a lease from the server clock.
 * @param leaseId - the lease granted by claim.
 * @param signal - optional cancellation forwarded to the provider.
 * @returns the renewed lease window.
 */
async heartbeat(leaseId: number, signal?: AbortSignal): Promise<BacklinkHeartbeat>

/**
 * Release a lease early.
 * @param leaseId - the lease to release.
 * @param signal - optional cancellation forwarded to the provider.
 */
async release(leaseId: number, signal?: AbortSignal): Promise<void>

/**
 * Report one item's terminal result.
 * @param itemId - the claimed plan item.
 * @param result - the closed-union outcome.
 * @param signal - optional cancellation forwarded to the provider.
 * @returns the server-side item status and created record id.
 */
async reportItemResult(itemId: number, result: BacklinkItemResult, signal?: AbortSignal): Promise<BacklinkItemOutcome>

/**
 * Add and activate a reciprocal footer badge.
 * @param websiteId - the promoted website.
 * @param badge - badge name and HTML.
 * @param signal - optional cancellation forwarded to the provider.
 * @returns the created badge id and whether the callback fired.
 */
async addBadge(websiteId: number, badge: BacklinkBadgeInput, signal?: AbortSignal): Promise<BacklinkBadgeResult>

/**
 * Attach source tags by name on the batch work source.
 * @param sourceId - the target source's backend id.
 * @param names - tag names to attach; the backend creates missing ones.
 * @param signal - optional cancellation forwarded to the provider.
 * @returns the source id and each attached tag's id, name, and whether this call created it.
 */
async tagSource(sourceId: number, names: readonly string[], signal?: AbortSignal): Promise<BacklinkTagResult>

/**
 * Create one mailbox address.
 * @param options - the desired local part and domain.
 * @param signal - optional cancellation forwarded to the provider.
 * @returns the created address.
 */
async createMailbox(options: { readonly localPart: string; readonly domain: string }, signal?: AbortSignal): Promise<MailboxAddress>

/**
 * Poll one address until a matching mail arrives or the timeout elapses.
 * @param address - the mailbox to poll.
 * @param options - match filters and the bounded wait.
 * @param signal - optional cancellation for the whole wait.
 * @returns the first matching mail, or `null` on timeout.
 */
async pollMail(address: MailboxAddress, options: MailPollOptions, signal?: AbortSignal): Promise<VerificationMail | null>
```

Source: [`packages/backlinks/backlinks/src/index.ts`](../../packages/backlinks/backlinks/src/index.ts)
<!-- END GENERATED cordis-surface -->
