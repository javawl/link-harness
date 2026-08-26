/**
 * Service Definition for the backlinks capability seam (`ctx.backlinks`): two provider registries — batch work
 * sources and mailboxes — each with execution-time selection identical in shape to `ctx.web`. Duplicate ids are
 * rejected; every method resolves its provider at call time and never depends on registration order.
 * @module @deepseek-ai/dsh-backlinks
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {
  BacklinkBadgeInput,
  BacklinkBadgeResult,
  BacklinkBatchDetail,
  BacklinkBatchSourceProvider,
  BacklinkBatchSummary,
  BacklinkHeartbeat,
  BacklinkItemOutcome,
  BacklinkItemResult,
  BacklinkLeaseClaim,
  MailboxAddress,
  MailboxProvider,
  MailPollOptions,
  VerificationMail,
} from './types.ts'
import { BacklinksError } from './types.ts'

export { BacklinksError } from './types.ts'
export type {
  BacklinkBadgeInput,
  BacklinkBadgeResult,
  BacklinkBatchDetail,
  BacklinkBatchItem,
  BacklinkBatchSourceProvider,
  BacklinkBatchSummary,
  BacklinkHeartbeat,
  BacklinkItemOutcome,
  BacklinkItemResult,
  BacklinkLeaseClaim,
  BacklinkWebsiteAnchor,
  BacklinksErrorCode,
  MailboxAddress,
  MailboxProvider,
  MailPollOptions,
  VerificationMail,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    backlinks: BacklinksRuntime
  }
}

/**
 * Config for the backlinks seam. `batchSourceProvider` / `mailboxProvider` pin
 * which provider wins for each registry; omitted auto-selects when exactly one
 * usable provider is registered.
 */
export interface BacklinksRuntimeConfig {
  /** Explicit batch-source provider id. Omitted = auto-select when exactly one usable. */
  readonly batchSourceProvider?: string
  /** Explicit mailbox provider id. Omitted = auto-select when exactly one usable. */
  readonly mailboxProvider?: string
}

/**
 * The backlinks service. Registered as `ctx.backlinks` (one instance per
 * context). Selection follows the shared execution-time rules: a configured id
 * must be registered and `available()`; without one, exactly one usable
 * provider is required.
 */
export class BacklinksRuntime extends Service {
  /** Provider selection config; `$DSH_BACKLINKS_BATCH_SOURCE` / `$DSH_BACKLINKS_MAILBOX` are equivalent fields. */
  static Config: z<BacklinksRuntimeConfig> = z.object({
    batchSourceProvider: z.string(),
    mailboxProvider: z.string(),
  })

  private batchSources = new Map<string, BacklinkBatchSourceProvider>()
  private mailboxes = new Map<string, MailboxProvider>()
  private readonly batchSourceId: string | undefined
  private readonly mailboxId: string | undefined

  constructor(ctx: Context, config: BacklinksRuntimeConfig = {}) {
    super(ctx, 'backlinks')
    this.batchSourceId = config.batchSourceProvider ?? process.env.DSH_BACKLINKS_BATCH_SOURCE
    this.mailboxId = config.mailboxProvider ?? process.env.DSH_BACKLINKS_MAILBOX
  }

  /**
   * Register a batch work source. Throws {@link BacklinksError}
   * `BACKLINKS_DUPLICATE_PROVIDER` on a duplicate id. Returns a disposer;
   * disposed with the calling fiber.
   * @param provider - the provider; its `id` is the registry key.
   * @returns the disposer that unregisters the provider.
   */
  registerBatchSourceProvider(provider: BacklinkBatchSourceProvider): () => void {
    return this.registerProvider(this.batchSources, provider, 'batch source')
  }

  /**
   * Register a mailbox provider. Throws {@link BacklinksError}
   * `BACKLINKS_DUPLICATE_PROVIDER` on a duplicate id. Returns a disposer;
   * disposed with the calling fiber.
   * @param provider - the provider; its `id` is the registry key.
   * @returns the disposer that unregisters the provider.
   */
  registerMailboxProvider(provider: MailboxProvider): () => void {
    return this.registerProvider(this.mailboxes, provider, 'mailbox')
  }

  private registerProvider<P extends { readonly id: string }>(
    store: Map<string, P>,
    provider: P,
    kind: string,
  ): () => void {
    if (store.has(provider.id)) {
      throw new BacklinksError(`a ${kind} provider with id "${provider.id}" is already registered`, 'BACKLINKS_DUPLICATE_PROVIDER')
    }
    const dispose = this.ctx.effect(function* () {
      store.set(provider.id, provider)
      yield () => store.delete(provider.id)
    }, 'backlinks.registerProvider()')
    // ctx.effect's disposer returns Promise<void>; our disposer API is
    // synchronous fire-and-forget — discard the (always-resolved) promise.
    return () => void dispose()
  }

  /**
   * List every batch in the workspace.
   * @param signal - optional cancellation forwarded to the provider.
   * @returns batch summaries with per-status counts.
   */
  async listBatches(signal?: AbortSignal): Promise<readonly BacklinkBatchSummary[]> {
    return this.resolveBatchSource().listBatches(signal)
  }

  /**
   * Fetch one batch's execution inputs.
   * @param batchId - the batch to detail.
   * @param signal - optional cancellation forwarded to the provider.
   * @returns batch, website, anchors, and items.
   */
  async getBatch(batchId: number, signal?: AbortSignal): Promise<BacklinkBatchDetail> {
    return this.resolveBatchSource().getBatch(batchId, signal)
  }

  /**
   * Claim a batch for execution.
   * @param batchId - the batch to claim.
   * @param itemIds - optional explicit plan-item subset.
   * @param signal - optional cancellation forwarded to the provider.
   * @returns the granted lease and claimed item payloads.
   */
  async claim(batchId: number, itemIds?: readonly number[], signal?: AbortSignal): Promise<BacklinkLeaseClaim> {
    return this.resolveBatchSource().claim(batchId, itemIds, signal)
  }

  /**
   * Extend a lease from the server clock.
   * @param leaseId - the lease granted by claim.
   * @param signal - optional cancellation forwarded to the provider.
   * @returns the renewed lease window.
   */
  async heartbeat(leaseId: number, signal?: AbortSignal): Promise<BacklinkHeartbeat> {
    return this.resolveBatchSource().heartbeat(leaseId, signal)
  }

  /**
   * Release a lease early.
   * @param leaseId - the lease to release.
   * @param signal - optional cancellation forwarded to the provider.
   */
  async release(leaseId: number, signal?: AbortSignal): Promise<void> {
    await this.resolveBatchSource().release(leaseId, signal)
  }

  /**
   * Report one item's terminal result.
   * @param itemId - the claimed plan item.
   * @param result - the closed-union outcome.
   * @param signal - optional cancellation forwarded to the provider.
   * @returns the server-side item status and created record id.
   */
  async reportItemResult(itemId: number, result: BacklinkItemResult, signal?: AbortSignal): Promise<BacklinkItemOutcome> {
    return this.resolveBatchSource().reportItemResult(itemId, result, signal)
  }

  /**
   * Add and activate a reciprocal footer badge.
   * @param websiteId - the promoted website.
   * @param badge - badge name and HTML.
   * @param signal - optional cancellation forwarded to the provider.
   * @returns the created badge id and whether the callback fired.
   */
  async addBadge(websiteId: number, badge: BacklinkBadgeInput, signal?: AbortSignal): Promise<BacklinkBadgeResult> {
    return this.resolveBatchSource().addBadge(websiteId, badge, signal)
  }

  /**
   * Create one mailbox address.
   * @param options - the desired local part and domain.
   * @param signal - optional cancellation forwarded to the provider.
   * @returns the created address.
   */
  async createMailbox(options: { readonly localPart: string; readonly domain: string }, signal?: AbortSignal): Promise<MailboxAddress> {
    return this.resolveMailbox().createMailbox(options, signal)
  }

  /**
   * Poll one address until a matching mail arrives or the timeout elapses.
   * @param address - the mailbox to poll.
   * @param options - match filters and the bounded wait.
   * @param signal - optional cancellation for the whole wait.
   * @returns the first matching mail, or `null` on timeout.
   */
  async pollMail(address: MailboxAddress, options: MailPollOptions, signal?: AbortSignal): Promise<VerificationMail | null> {
    return this.resolveMailbox().pollMail(address, options, signal)
  }

  private resolveBatchSource(): BacklinkBatchSourceProvider {
    return resolveProvider({
      providers: this.batchSources,
      ...this.batchSourceId !== undefined ? { configuredId: this.batchSourceId } : {},
    })
  }

  private resolveMailbox(): MailboxProvider {
    return resolveProvider({
      providers: this.mailboxes,
      ...this.mailboxId !== undefined ? { configuredId: this.mailboxId } : {},
    })
  }
}

interface ResolvableProvider {
  readonly id: string
  available(): boolean
}

interface Selection<P> {
  /** The configured provider id for this capability kind, if any. */
  readonly configuredId?: string
  /** Providers registered for this capability kind. */
  readonly providers: ReadonlyMap<string, P>
}

/** Resolve the selected provider or throw the matching {@link BacklinksError}. */
function resolveProvider<P extends ResolvableProvider>(selection: Selection<P>): P {
  const { configuredId, providers } = selection
  if (configuredId !== undefined) {
    const provider = providers.get(configuredId)
    if (!provider) {
      throw new BacklinksError(`configured backlinks provider "${configuredId}" is not registered`, 'BACKLINKS_PROVIDER_CONFIGURED_MISSING')
    }
    if (!provider.available()) {
      throw new BacklinksError(`configured backlinks provider "${configuredId}" is registered but unavailable`, 'BACKLINKS_PROVIDER_CONFIGURED_UNAVAILABLE')
    }
    return provider
  }
  const usable = [...providers.values()].filter(provider => provider.available())
  const [single] = usable
  if (single === undefined) {
    throw new BacklinksError('no usable backlinks provider is registered', 'BACKLINKS_PROVIDER_UNAVAILABLE')
  }
  if (usable.length > 1) {
    const ids = usable.map(provider => provider.id).join(', ')
    throw new BacklinksError(`multiple usable backlinks providers are registered (${ids}); configure one explicitly`, 'BACKLINKS_PROVIDER_AMBIGUOUS')
  }
  return single
}

export default BacklinksRuntime
