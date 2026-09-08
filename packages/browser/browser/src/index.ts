/**
 * Service Definition for the browser automation capability seam (`ctx.browser`): a provider registry and
 * independent browser sessions with dispatch ordered per addressed tab. Duplicate provider ids are rejected. Each
 * session opens lazily on the first command (single-flight) and is reused until `closeSession()` or
 * context disposal, so a persistent browser profile outlives individual tool calls. Commands naming the
 * same tab serialize; commands naming different tabs run concurrently inside the provider. Provider
 * selection happens at call time and never depends on registration order.
 * @module @deepseek-ai/dsh-browser
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {
  BrowserAutomationProvider,
  BrowserCommand,
  BrowserResult,
  BrowserSession,
} from './types.ts'
import { BrowserError } from './types.ts'

export { BrowserError } from './types.ts'
export type {
  BrowserAckedResult,
  BrowserAutomationProvider,
  BrowserBringToFrontCommand,
  BrowserClickCommand,
  BrowserClosePageCommand,
  BrowserCommand,
  BrowserErrorCode,
  BrowserFillCommand,
  BrowserFillField,
  BrowserNavigateCommand,
  BrowserNewPageCommand,
  BrowserPageResult,
  BrowserPressCommand,
  BrowserResult,
  BrowserScreenshotCommand,
  BrowserScreenshotResult,
  BrowserSelectCommand,
  BrowserSession,
  BrowserSnapshotCommand,
  BrowserUploadCommand,
  BrowserWaitForCommand,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    browser: BrowserRuntime
  }
}

/**
 * Config for the browser seam. `provider` pins which provider wins; omitted
 * auto-selects when exactly one usable provider is registered. Operational
 * overrides feed the same field rather than a hidden priority chain.
 */
export interface BrowserRuntimeConfig {
  /** Explicit browser provider id. Omitted = auto-select when exactly one usable. */
  readonly provider?: string
}

/**
 * The browser automation service. Registered as `ctx.browser` (one instance
 * per context).
 *
 * Selection semantics (resolved at execution time, never order-dependent):
 * - A configured id that is registered and `available()` → that provider.
 * - A configured id not registered → `BROWSER_PROVIDER_CONFIGURED_MISSING`.
 * - A configured id registered but unavailable →
 *   `BROWSER_PROVIDER_CONFIGURED_UNAVAILABLE`.
 * - No id configured, exactly one registered usable provider → that provider.
 * - No id configured, multiple usable providers → `BROWSER_PROVIDER_AMBIGUOUS`.
 * - No id configured, no usable provider → `BROWSER_PROVIDER_UNAVAILABLE`.
 */
export class BrowserRuntime extends Service {
  /** Provider selection config; `$DSH_BROWSER_PROVIDER` is equivalent to `provider`. */
  static Config: z<BrowserRuntimeConfig> = z.object({
    provider: z.string(),
  })

  private providers = new Map<string, BrowserAutomationProvider>()
  private readonly providerId: string | undefined
  private readonly sessions = new Map<string, {
    opening: Promise<BrowserSession>
    closing?: Promise<void>
  }>()
  private closed = false

  constructor(ctx: Context, config: BrowserRuntimeConfig = {}) {
    super(ctx, 'browser')
    this.providerId = config.provider ?? process.env.DSH_BROWSER_PROVIDER
    ctx.effect(() => async () => {
      this.closed = true
      await Promise.allSettled([...this.sessions.keys()].map(id => this.closeSession(id)))
    })
  }

  /**
   * Register one independently addressable browser. A resource cannot have two ids.
   * @param provider - backend owning this browser's login state and tabs.
   * @returns disposer that unregisters and closes only this browser.
   */
  registerProvider(provider: BrowserAutomationProvider): () => void {
    if (this.providers.has(provider.id) || (provider.resourceKey !== undefined
      && [...this.providers.values()].some(value => value.resourceKey === provider.resourceKey))) {
      throw new BrowserError(`browser id or resource "${provider.id}" is already registered`, 'BROWSER_DUPLICATE_PROVIDER')
    }
    const store = this.providers
    const close = () => this.closeSession(provider.id)
    const dispose = this.ctx.effect(function* () {
      store.set(provider.id, provider)
      yield async () => {
        store.delete(provider.id)
        await close()
      }
    }, 'browser.registerProvider()')
    return () => void dispose()
  }

  /**
   * List configured browser ids without launching or connecting to them.
   * @returns browser ids and their local availability; no credentials or page contents.
   */
  list(): { id: string; available: boolean }[] {
    return [...this.providers.values()].map(provider => ({ id: provider.id, available: provider.available() }))
  }

  /**
   * Resolve an explicit browser or the configured default before starting work.
   * @param browserId - registered id; omitted uses the service's provider selection.
   * @returns selected browser id; an unknown or ambiguous selection throws before launch.
   */
  resolve(browserId?: string): string {
    const configuredId = browserId ?? this.providerId
    return resolveProvider({ providers: this.providers,
      ...configuredId === undefined ? {} : { configuredId } }).id
  }

  /**
   * Check whether a browser has a live or opening session.
   * @param browserId - registered browser id.
   * @returns whether changing its configuration would affect retained pages.
   */
  hasSession(browserId: string): boolean {
    return this.sessions.has(browserId)
  }

  /**
   * Execute in the selected browser's lazy session. Tab refs are local to that browser.
   * @param command - closed-union command; parallel callers must address a page.
   * @param signal - cancellation forwarded to the provider.
   * @param browserId - explicit browser; omitted uses the configured default.
   * @returns the command outcome. Failure discards only the affected browser session.
   */
  async act(command: BrowserCommand, signal?: AbortSignal, browserId?: string): Promise<BrowserResult> {
    if (this.closed) throw new BrowserError('browser service is closed', 'BROWSER_SESSION_CLOSED')
    const id = this.resolve(browserId)
    if (signal?.aborted) throw new BrowserError('browser command aborted before dispatch', 'BROWSER_ABORTED')
    let entry = this.sessions.get(id)
    if (entry?.closing !== undefined) {
      await entry.closing
      return this.act(command, signal, id)
    }
    if (entry === undefined) {
      const provider = resolveProvider({ providers: this.providers, configuredId: id })
      const opening = Promise.resolve().then(async () => {
        try {
          return await provider.open(signal)
        } catch (error) {
          if (error instanceof BrowserError) throw error
          throw new BrowserError(`browser "${id}" failed to open: ${String(error instanceof Error ? error.message : error)}`,
            'BROWSER_LAUNCH_FAILED', { cause: error })
        }
      })
      entry = { opening }
      this.sessions.set(id, entry)
      void opening.catch(() => { if (this.sessions.get(id) === entry) this.sessions.delete(id) })
    }
    const session = await entry.opening
    if (!this.providers.has(id) || this.sessions.get(id)?.closing !== undefined) throw new BrowserError('browser session is closing', 'BROWSER_SESSION_CLOSED')
    if (signal?.aborted) throw new BrowserError('browser command aborted before dispatch', 'BROWSER_ABORTED')
    try {
      return await session.act(command, signal)
    } catch (error) {
      if (!(error instanceof BrowserError) || error.code === 'BROWSER_SESSION_CLOSED') {
        if (this.sessions.get(id) === entry) await this.closeSession(id)
      }
      if (error instanceof BrowserError) throw error
      throw new BrowserError(`browser command "${command.kind}" failed: ${String(error instanceof Error ? error.message : error)}`,
        'BROWSER_ACTION_FAILED', { cause: error })
    }
  }

  /**
   * Close one selected browser, awaiting a pending launch. Other browsers remain usable.
   * @param browserId - explicit id; omitted closes the configured default, if any session exists.
   * @returns when its provider cleanup settles; a dead browser's close error is ignored.
   */
  async closeSession(browserId?: string): Promise<void> {
    if (this.sessions.size === 0) return
    const id = browserId ?? this.resolve()
    const entry = this.sessions.get(id)
    if (entry === undefined) return
    entry.closing ??= (async () => {
      try {
        const session = await entry.opening
        await session.close()
      } catch {
        // Failed launches and dead-browser close failures leave no reusable session.
      } finally {
        if (this.sessions.get(id) === entry) this.sessions.delete(id)
      }
    })()
    await entry.closing
  }
}

interface ResolvableProvider {
  readonly id: string
  available(): boolean
}

interface Selection<P> {
  /** The configured provider id for this capability, if any. */
  readonly configuredId?: string
  /** Providers registered for this capability kind. */
  readonly providers: ReadonlyMap<string, P>
}

/** Resolve the selected provider or throw the matching {@link BrowserError}. */
function resolveProvider<P extends ResolvableProvider>(selection: Selection<P>): P {
  const { configuredId, providers } = selection
  if (configuredId !== undefined) {
    const provider = providers.get(configuredId)
    if (!provider) {
      throw new BrowserError(`configured browser provider "${configuredId}" is not registered`, 'BROWSER_PROVIDER_CONFIGURED_MISSING')
    }
    if (!provider.available()) {
      throw new BrowserError(`configured browser provider "${configuredId}" is registered but unavailable`, 'BROWSER_PROVIDER_CONFIGURED_UNAVAILABLE')
    }
    return provider
  }
  const usable = [...providers.values()].filter(provider => provider.available())
  const [single] = usable
  if (single === undefined) {
    throw new BrowserError('no usable browser provider is registered', 'BROWSER_PROVIDER_UNAVAILABLE')
  }
  if (usable.length > 1) {
    const ids = usable.map(provider => provider.id).join(', ')
    throw new BrowserError(`multiple usable browser providers are registered (${ids}); configure one explicitly`, 'BROWSER_PROVIDER_AMBIGUOUS')
  }
  return single
}

export default BrowserRuntime
