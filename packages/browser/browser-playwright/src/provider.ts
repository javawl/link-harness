/**
 * The Playwright implementation of the browser automation seam: one persistent Chromium context
 * (real Chrome by default, so logins and challenge solutions survive across runs) whose active
 * page serves every command. Failures wrap into the seam's `BrowserError` taxonomy.
 */

import { chromium } from 'playwright-core'
import type { BrowserContext, Page } from 'playwright-core'
import { assertNever } from '@deepseek-ai/dsh-llm'
import type {
  BrowserAutomationProvider,
  BrowserCommand,
  BrowserResult,
  BrowserSession,
} from '@deepseek-ai/dsh-browser'
import { BrowserError } from '@deepseek-ai/dsh-browser'

/** Registry id of this provider. */
export const PLAYWRIGHT_BROWSER_PROVIDER_ID = 'playwright'

/** Default bound on returned page text when a command sets none. */
export const DEFAULT_SNAPSHOT_MAX_CHARS = 60_000

/** Resolved launch configuration after schemastery defaults. */
export interface ResolvedPlaywrightConfig {
  /** Persistent profile directory; logins and cookies survive runs. */
  readonly userDataDir: string
  /** Headed by default: a human can step in to solve a challenge in the same profile. */
  readonly headless: boolean
  /** Chromium distribution; `chrome` uses the locally installed Google Chrome. */
  readonly channel: string
  /** Default per-operation timeout in milliseconds. */
  readonly defaultTimeoutMs: number
  /** Extra Chromium launch arguments (proxy, window size, …). */
  readonly launchArgs: readonly string[]
  /**
   * Playwright default launch arguments to omit. Playwright passes
   * `--enable-automation` by default, which automation-hostile pages such as
   * the Google account login detect and reject ("This browser or app may not
   * be secure"); naming it here removes that flag while everything else stays
   * default.
   */
  readonly ignoreDefaultArgs: readonly string[]
}

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`browser-playwright: ${name} must be a positive integer, got ${value}`)
  }
}

/** Truncate text at `maxChars` and flag the cut. */
function truncate(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false }
  return { text: text.slice(0, maxChars), truncated: true }
}

/** Fail fast on a cancellation signal without touching the browser. */
function throwIfAborted(signal: AbortSignal | undefined, commandKind: string): void {
  if (signal?.aborted) {
    throw new BrowserError(`browser ${commandKind} aborted`, 'BROWSER_ABORTED')
  }
}

class PlaywrightSession implements BrowserSession {
  private closed = false

  constructor(
    private readonly context: BrowserContext,
    private readonly defaultTimeoutMs: number,
    private readonly defaultMaxChars: number,
  ) {
    this.context.on('close', () => {
      this.closed = true
    })
  }

  async act(command: BrowserCommand, signal?: AbortSignal): Promise<BrowserResult> {
    throwIfAborted(signal, command.kind)
    if (this.closed) {
      throw new BrowserError('browser session is closed', 'BROWSER_ACTION_FAILED')
    }
    try {
      switch (command.kind) {
        case 'navigate': {
          const page = await this.activePage()
          await page.goto(command.url, {
            timeout: this.defaultTimeoutMs,
            ...command.waitUntil === undefined ? {} : { waitUntil: command.waitUntil },
          })
          return await this.pageResult(page, command.maxChars ?? this.defaultMaxChars)
        }
        case 'snapshot':
          return await this.pageResult(
            await this.activePage(),
            command.maxChars ?? this.defaultMaxChars,
            command.selector,
          )
        case 'click': {
          const page = await this.activePage()
          await page.click(command.selector, { timeout: this.defaultTimeoutMs })
          return { kind: 'acked' }
        }
        case 'fill': {
          const page = await this.activePage()
          await page.fill(command.selector, command.value, { timeout: this.defaultTimeoutMs })
          return { kind: 'acked' }
        }
        case 'select': {
          const page = await this.activePage()
          await page.selectOption(command.selector, command.value, { timeout: this.defaultTimeoutMs })
          return { kind: 'acked' }
        }
        case 'press': {
          const page = await this.activePage()
          await page.keyboard.press(command.key)
          return { kind: 'acked' }
        }
        case 'upload': {
          const page = await this.activePage()
          await page.setInputFiles(command.selector, [...command.files], {
            timeout: this.defaultTimeoutMs,
          })
          return { kind: 'acked' }
        }
        case 'screenshot': {
          const page = await this.activePage()
          const buffer = await page.screenshot({ type: 'png', timeout: this.defaultTimeoutMs })
          return { kind: 'screenshot', pngBase64: buffer.toString('base64') }
        }
        case 'waitFor': {
          if (command.selector === undefined && command.url === undefined) {
            throw new BrowserError('waitFor requires a selector or a url', 'BROWSER_ACTION_FAILED')
          }
          const page = await this.activePage()
          const timeout = command.timeoutMs ?? this.defaultTimeoutMs
          if (command.selector !== undefined) {
            await page.waitForSelector(command.selector, { timeout })
          } else {
            await page.waitForURL(command.url as string, { timeout })
          }
          return { kind: 'acked' }
        }
        case 'closePage': {
          const page = await this.activePage()
          await page.close()
          return { kind: 'acked' }
        }
        default:
          return assertNever(command, 'unhandled browser command kind')
      }
    } catch (error) {
      if (error instanceof BrowserError) throw error
      throw new BrowserError(
        `playwright ${command.kind} failed: ${String(error instanceof Error ? error.message : error)}`,
        'BROWSER_ACTION_FAILED',
        { cause: error },
      )
    }
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    try {
      await this.context.close()
    } catch {
      // swallow: closing an already-dead browser
    }
  }

  /** The most recently opened page, or a fresh tab when none is left. */
  private async activePage(): Promise<Page> {
    const pages = this.context.pages()
    const last = pages[pages.length - 1]
    if (last) return last
    return this.context.newPage()
  }

  /** Capture url/title/text (whole body or one selector's subtree), bounded. */
  private async pageResult(
    page: Page,
    maxChars: number,
    selector?: string,
  ): Promise<BrowserResult> {
    const [url, title, rawText] = await Promise.all([
      Promise.resolve(page.url()),
      page.title(),
      page.innerText(selector ?? 'body'),
    ])
    const { text, truncated } = truncate(rawText, maxChars)
    return { kind: 'page', url, title, text, truncated }
  }
}

/** Playwright-backed browser automation provider. */
export class PlaywrightBrowserProvider implements BrowserAutomationProvider {
  readonly id = PLAYWRIGHT_BROWSER_PROVIDER_ID

  constructor(private readonly config: ResolvedPlaywrightConfig) {}

  /** The playwright-core import succeeded, so launches are possible; no browser is started here. */
  available(): boolean {
    return true
  }

  async open(signal?: AbortSignal): Promise<BrowserSession> {
    throwIfAborted(signal, 'launch')
    assertPositiveInteger('defaultTimeoutMs', this.config.defaultTimeoutMs)
    let context: BrowserContext
    try {
      context = await chromium.launchPersistentContext(this.config.userDataDir, {
        headless: this.config.headless,
        timeout: this.config.defaultTimeoutMs,
        ...this.config.channel.length > 0 ? { channel: this.config.channel } : {},
        ...this.config.ignoreDefaultArgs.length > 0
          ? { ignoreDefaultArgs: [...this.config.ignoreDefaultArgs] }
          : {},
        args: [...this.config.launchArgs],
      })
    } catch (error) {
      throw new BrowserError(
        `failed to launch the persistent browser profile at ${this.config.userDataDir}: ${String(error instanceof Error ? error.message : error)}`,
        'BROWSER_LAUNCH_FAILED',
        { cause: error },
      )
    }
    return new PlaywrightSession(context, this.config.defaultTimeoutMs, DEFAULT_SNAPSHOT_MAX_CHARS)
  }
}
