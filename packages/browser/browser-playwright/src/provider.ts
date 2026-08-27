/**
 * The Playwright implementation of the browser automation seam: one persistent Chromium context
 * (real Chrome by default, so logins and challenge solutions survive across runs) whose active
 * page serves every command. Failures wrap into the seam's `BrowserError` taxonomy.
 */

import { chromium } from 'playwright-core'
import type { BrowserContext, Locator, Page } from 'playwright-core'
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
  /**
   * Initial window position as `x,y` passed to Chrome. Heading the browser
   * offscreen (for example `-32000,-32000`) keeps a real headed fingerprint
   * while the window never covers the operator's desktop; the `bringToFront`
   * command surfaces a tab when a human must step in.
   */
  readonly windowPosition: string | undefined
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

/** How one `selector` addresses an element, parsed from its prefix. */
type Addressing =
  | { mode: 'css'; frames: readonly string[]; value: string }
  | { mode: 'role'; frames: readonly string[]; value: string; name?: string }
  | { mode: 'label' | 'placeholder' | 'text'; frames: readonly string[]; value: string }
  | { mode: 'xy'; frames: readonly string[]; x: number; y: number }

/**
 * Parse one selector: optional `frame(<css>)>>` chains, then one of
 * `role:<role>[|<name>]`, `label:<text>`, `placeholder:<text>`, `text:<text>`,
 * `xy:<x>,<y>` (click only), or bare CSS.
 * @param raw - the model-facing selector string.
 * @returns the parsed addressing for locator construction.
 */
function parseSelector(raw: string): Addressing {
  let rest = raw
  const frames: string[] = []
  while (true) {
    const frame = /^frame\((.+)\)>>/u.exec(rest)
    if (frame === null) break
    frames.push(frame[1] as string)
    rest = rest.slice(frame[0].length)
  }
  const prefixed = /^(role|label|placeholder|text|xy):(.*)$/su.exec(rest)
  if (prefixed === null) return { mode: 'css', frames, value: rest }
  const kind = prefixed[1] as string
  const body = prefixed[2] as string
  if (kind === 'xy') {
    const xy = /^(\d+),(\d+)$/u.exec(body)
    if (xy === null) {
      throw new BrowserError(`browser xy selector must be xy:<x>,<y> with non-negative integers, got "${raw}"`, 'BROWSER_ACTION_FAILED')
    }
    return { mode: 'xy', frames, x: Number(xy[1]), y: Number(xy[2]) }
  }
  if (kind === 'role') {
    const split = body.indexOf('|')
    if (split < 0) return { mode: 'role', frames, value: body }
    const role = body.slice(0, split)
    const name = body.slice(split + 1)
    if (role.length === 0 || name.length === 0) {
      throw new BrowserError(`browser role selector must be role:<role>|<name> with both non-empty, got "${raw}"`, 'BROWSER_ACTION_FAILED')
    }
    return { mode: 'role', frames, value: role, name }
  }
  if (body.length === 0) {
    throw new BrowserError(`browser ${kind} selector must be ${kind}:<text> with non-empty text`, 'BROWSER_ACTION_FAILED')
  }
  return { mode: kind as 'label' | 'placeholder' | 'text', frames, value: body }
}

/**
 * Build the Playwright locator for one addressing, drilling through any frame
 * chain. Coordinate addressing answers `undefined` only for the click path;
 * every other command rejects it instead of silently no-oping.
 */
function buildLocator(page: Page, addressing: Addressing): Locator | undefined {
  if (addressing.mode === 'xy') return undefined
  let root: Locator | { getByRole: Locator['getByRole']; getByLabel: Locator['getByLabel']; getByPlaceholder: Locator['getByPlaceholder']; getByText: Locator['getByText']; locator: Locator['locator'] } = page
  for (const frame of addressing.frames) {
    root = (root as Page).frameLocator(frame)
  }
  switch (addressing.mode) {
    case 'css':
      return (root as Page).locator(addressing.value)
    case 'role':
      return (root as Page).getByRole(addressing.value as never,
        ...addressing.name === undefined ? [] : [{ name: addressing.name }])
    case 'label':
      return (root as Page).getByLabel(addressing.value)
    case 'placeholder':
      return (root as Page).getByPlaceholder(addressing.value)
    case 'text':
      return (root as Page).getByText(addressing.value)
    /* v8 ignore start -- closed-union default only defends future source widening */
    default:
      return assertNever(addressing, 'unhandled selector addressing')
    /* v8 ignore stop */
  }
}

/** The locator for any command except click; coordinate addressing is click-only. */
function elementLocator(page: Page, addressing: Addressing): Locator {
  const locator = buildLocator(page, addressing)
  if (locator === undefined) {
    throw new BrowserError('browser xy addressing supports click only', 'BROWSER_ACTION_FAILED')
  }
  return locator
}

/** Fail fast on a cancellation signal without touching the browser. */
function throwIfAborted(signal: AbortSignal | undefined, commandKind: string): void {
  if (signal?.aborted) {
    throw new BrowserError(`browser ${commandKind} aborted`, 'BROWSER_ABORTED')
  }
}

class PlaywrightSession implements BrowserSession {
  private closed = false
  /** Live tabs by ref; the ref is the parallel caller's tab identity. */
  private readonly pages = new Map<string, Page>()
  /** Per-tab serial chains: same tab orders, different tabs overlap. */
  private readonly chains = new Map<string, Promise<unknown>>()
  /** Chain for commands that address no ref (the legacy single-tab path). */
  private legacyTail: Promise<unknown> = Promise.resolve()
  /** Most recently adopted tab; the no-ref addressing target. */
  private lastRef: string | undefined
  private refSeq = 0

  constructor(
    private readonly context: BrowserContext,
    private readonly defaultTimeoutMs: number,
    private readonly defaultMaxChars: number,
  ) {
    this.context.on('close', () => {
      this.closed = true
    })
    // A persistent context may reopen with surviving tabs; adopt them so
    // no-ref addressing lands on a real page instead of opening a spare one.
    for (const existing of this.context.pages()) {
      this.adopt(existing)
    }
  }

  async act(command: BrowserCommand, signal?: AbortSignal): Promise<BrowserResult> {
    throwIfAborted(signal, command.kind)
    if (this.closed) {
      throw new BrowserError('browser session is closed', 'BROWSER_ACTION_FAILED')
    }
    return await (command.page === undefined
      ? this.chained(this.legacyTail, (tail) => { this.legacyTail = tail }, command, signal)
      : this.chained(
        this.chains.get(command.page) ?? Promise.resolve(),
        (tail) => { this.chains.set(command.page as string, tail) },
        command,
        signal,
      ))
  }

  /** Run one command after the addressed tab's previous command settles. */
  private chained(
    previous: Promise<unknown>,
    store: (tail: Promise<unknown>) => void,
    command: BrowserCommand,
    signal?: AbortSignal,
  ): Promise<BrowserResult> {
    // Stored tails swallow their errors, so `previous` always settles; a
    // failed command rejects only the caller's `next`, not the tab's chain.
    const next = previous.then(() => this.execute(command, signal))
    store(next.catch(() => undefined))
    return next
  }

  private async execute(command: BrowserCommand, signal?: AbortSignal): Promise<BrowserResult> {
    throwIfAborted(signal, command.kind)
    try {
      switch (command.kind) {
        case 'navigate': {
          const { page, ref } = await this.resolveForNavigate(command.page)
          await page.goto(command.url, {
            timeout: this.defaultTimeoutMs,
            ...command.waitUntil === undefined ? {} : { waitUntil: command.waitUntil },
          })
          return await this.pageResult(page, ref, command.maxChars ?? this.defaultMaxChars)
        }
        case 'snapshot': {
          const { page, ref } = await this.requirePage(command.page)
          if (command.format === 'aria') {
            const tree = await page.locator(command.selector ?? 'body').ariaSnapshot()
            const { text, truncated } = truncate(tree, command.maxChars ?? this.defaultMaxChars)
            return { kind: 'page', page: ref, url: page.url(), title: await page.title(), text, truncated }
          }
          return await this.pageResult(page, ref, command.maxChars ?? this.defaultMaxChars, command.selector)
        }
        case 'click': {
          const { page } = await this.requirePage(command.page)
          const addressing = parseSelector(command.selector)
          if (addressing.mode === 'xy') {
            await page.mouse.click(addressing.x, addressing.y)
            return { kind: 'acked' }
          }
          await buildLocator(page, addressing)?.click({ timeout: this.defaultTimeoutMs })
          return { kind: 'acked' }
        }
        case 'fill': {
          const { page } = await this.requirePage(command.page)
          const locator = elementLocator(page, parseSelector(command.selector))
          await locator.fill(command.value, { timeout: this.defaultTimeoutMs })
          return { kind: 'acked' }
        }
        case 'select': {
          const { page } = await this.requirePage(command.page)
          const locator = elementLocator(page, parseSelector(command.selector))
          await locator.selectOption(command.value, { timeout: this.defaultTimeoutMs })
          return { kind: 'acked' }
        }
        case 'press': {
          const { page } = await this.requirePage(command.page)
          await page.keyboard.press(command.key)
          return { kind: 'acked' }
        }
        case 'upload': {
          const { page } = await this.requirePage(command.page)
          const locator = elementLocator(page, parseSelector(command.selector))
          await locator.setInputFiles([...command.files], { timeout: this.defaultTimeoutMs })
          return { kind: 'acked' }
        }
        case 'screenshot': {
          const { page } = await this.requirePage(command.page)
          const buffer = await page.screenshot({ type: 'png', timeout: this.defaultTimeoutMs })
          return { kind: 'screenshot', pngBase64: buffer.toString('base64') }
        }
        case 'waitFor': {
          if (command.selector === undefined && command.url === undefined) {
            throw new BrowserError('waitFor requires a selector or a url', 'BROWSER_ACTION_FAILED')
          }
          const { page } = await this.requirePage(command.page)
          const timeout = command.timeoutMs ?? this.defaultTimeoutMs
          if (command.selector !== undefined) {
            const locator = elementLocator(page, parseSelector(command.selector))
            await locator.waitFor({ state: 'visible', timeout })
          } else {
            await page.waitForURL(command.url as string, { timeout })
          }
          return { kind: 'acked' }
        }
        case 'bringToFront': {
          const { page } = await this.requirePage(command.page)
          await page.bringToFront()
          return { kind: 'acked' }
        }
        case 'closePage': {
          const { page, ref } = await this.requirePage(command.page)
          await page.close()
          this.pages.delete(ref)
          this.chains.delete(ref)
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

  /**
   * Register one tab under a fresh ref; a tab closed by the page itself or by
   * the site drops out of the map so later ref addressing fails loudly.
   */
  private adopt(page: Page): string {
    const ref = `p${++this.refSeq}`
    this.pages.set(ref, page)
    this.lastRef = ref
    page.on('close', () => {
      this.pages.delete(ref)
    })
    return ref
  }

  /**
   * The tab a command addresses, with its ref. Without a ref that is the most
   * recently adopted tab (the legacy single-tab contract); a named ref must be
   * live. Every return path leaves `lastRef` naming the returned tab.
   */
  private async requirePage(ref: string | undefined): Promise<{ page: Page; ref: string }> {
    if (ref === undefined) {
      const pages = this.context.pages()
      const last = pages[pages.length - 1]
      if (last) {
        if (this.pages.get(this.lastRef ?? '') !== last) {
          this.adopt(last)
        }
        return { page: last, ref: this.lastRef as string }
      }
      const page = await this.context.newPage()
      return { page, ref: this.adopt(page) }
    }
    const page = this.pages.get(ref)
    if (page === undefined || page.isClosed()) {
      throw new BrowserError(`browser page "${ref}" is not open`, 'BROWSER_ACTION_FAILED')
    }
    this.lastRef = ref
    return { page, ref }
  }

  /** A navigate either reuses its named tab or opens a new one bound to that name. */
  private async resolveForNavigate(ref: string | undefined): Promise<{ page: Page; ref: string }> {
    if (ref !== undefined) {
      const existing = this.pages.get(ref)
      if (existing !== undefined && !existing.isClosed()) {
        this.lastRef = ref
        return { page: existing, ref }
      }
      // The caller's name IS the tab identity: bind the fresh tab to it so
      // every later command can keep addressing it by the same ref.
      const page = await this.context.newPage()
      this.pages.set(ref, page)
      this.lastRef = ref
      page.on('close', () => {
        this.pages.delete(ref)
      })
      return { page, ref }
    }
    return await this.requirePage(undefined)
  }

  /** Capture url/title/text (whole body or one selector's subtree), bounded. */
  private async pageResult(
    page: Page,
    ref: string,
    maxChars: number,
    selector?: string,
  ): Promise<BrowserResult> {
    const [url, title, rawText] = await Promise.all([
      Promise.resolve(page.url()),
      page.title(),
      page.innerText(selector ?? 'body'),
    ])
    const { text, truncated } = truncate(rawText, maxChars)
    return { kind: 'page', page: ref, url, title, text, truncated }
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
        args: [
          ...this.config.windowPosition === undefined
            ? []
            : [`--window-position=${this.config.windowPosition}`],
          ...this.config.launchArgs,
        ],
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
