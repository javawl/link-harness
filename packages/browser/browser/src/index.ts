/**
 * Service Definition for the browser automation capability seam (`ctx.browser`): a provider registry and
 * a serialized one-session command dispatch. Duplicate provider ids are rejected. The session opens lazily
 * on the first command and is reused until `closeSession()` or context disposal, so a persistent browser
 * profile outlives individual tool calls. Provider selection happens at call time and never depends on
 * registration order.
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
  BrowserClickCommand,
  BrowserClosePageCommand,
  BrowserCommand,
  BrowserErrorCode,
  BrowserFillCommand,
  BrowserNavigateCommand,
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
  private session: BrowserSession | undefined
  private sessionDisposer: (() => void) | undefined
  private queue: Promise<unknown> = Promise.resolve()

  constructor(ctx: Context, config: BrowserRuntimeConfig = {}) {
    super(ctx, 'browser')
    this.providerId = config.provider ?? process.env.DSH_BROWSER_PROVIDER
  }

  /**
   * Register a browser automation provider. Throws {@link BrowserError}
   * `BROWSER_DUPLICATE_PROVIDER` if its id is already registered. Returns a
   * disposer; disposed with the calling fiber.
   * @param provider - the provider; its `id` is the registry key.
   * @returns the disposer that unregisters the provider.
   */
  registerProvider(provider: BrowserAutomationProvider): () => void {
    if (this.providers.has(provider.id)) {
      throw new BrowserError(`a browser provider with id "${provider.id}" is already registered`, 'BROWSER_DUPLICATE_PROVIDER')
    }
    const store = this.providers
    const dispose = this.ctx.effect(function* () {
      store.set(provider.id, provider)
      yield () => store.delete(provider.id)
    }, 'browser.registerProvider()')
    // ctx.effect's disposer returns Promise<void>; our disposer API is
    // synchronous fire-and-forget — discard the (always-resolved) promise.
    return () => void dispose()
  }

  /**
   * Perform one command on the shared session, opening it lazily through the
   * selected provider on first use. Commands serialize: each dispatch observes
   * the previous one's settled state. Provider selection and session open
   * throw {@link BrowserError} before any page work runs.
   * @param command - the closed-union command to execute.
   * @param signal - optional cancellation signal checked before dispatch.
   * @returns the closed-union outcome for the command kind.
   */
  act(command: BrowserCommand, signal?: AbortSignal): Promise<BrowserResult> {
    const run = async (): Promise<BrowserResult> => {
      const session = await this.ensureSession(signal)
      if (signal?.aborted) throw new BrowserError('browser command aborted before dispatch', 'BROWSER_ABORTED')
      try {
        return await session.act(command, signal)
      } catch (error) {
        if (error instanceof BrowserError) {
          if (error.message.includes('has been closed') || error.message.includes('session is closed')) {
            await this.discardSession()
          }
          throw error
        }
        // A provider that leaks a raw failure loses the session: its browser
        // state is unknown and the next command must relaunch, not reuse it.
        await this.discardSession()
        throw new BrowserError(
          `browser command "${command.kind}" failed: ${String(error instanceof Error ? error.message : error)}`,
          'BROWSER_ACTION_FAILED',
          { cause: error },
        )
      }
    }
    const next = this.queue.then(run, run)
    this.queue = next.catch(() => {})
    return next
  }

  /**
   * Close the shared session (and its browser). Safe when no session is open;
   * the next `act()` opens a fresh one.
   * @returns when the session is closed or none existed.
   */
  async closeSession(): Promise<void> {
    await this.queue
    await this.discardSession()
  }

  private async ensureSession(signal?: AbortSignal): Promise<BrowserSession> {
    if (this.session) return this.session
    const provider = resolveProvider({
      providers: this.providers,
      ...this.providerId !== undefined ? { configuredId: this.providerId } : {},
    })
    if (signal?.aborted) throw new BrowserError('browser launch aborted', 'BROWSER_ABORTED')
    let session: BrowserSession
    try {
      session = await provider.open(signal)
    } catch (error) {
      if (error instanceof BrowserError) throw error
      throw new BrowserError(
        `browser provider "${provider.id}" failed to open a session: ${String(error instanceof Error ? error.message : error)}`,
        'BROWSER_LAUNCH_FAILED',
        { cause: error },
      )
    }
    const dispose = this.ctx.effect(function* () {
      yield () => {
        void session.close().catch(() => undefined)
      }
    }, 'browser.session')
    this.session = session
    this.sessionDisposer = () => void dispose()
    return session
  }

  private async discardSession(): Promise<void> {
    this.sessionDisposer?.()
    this.sessionDisposer = undefined
    const session = this.session
    this.session = undefined
    // Close errors must not break the relaunch path; the browser process is
    // provider-owned and a failed close surfaces on the next open at worst.
    try {
      await session?.close()
    } catch {
      // swallow: closing an already-dead browser
    }
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
