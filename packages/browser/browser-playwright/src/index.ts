/**
 * Service Provider for the browser automation seam: a Playwright-backed persistent Chromium
 * context. Headed by default over a persistent profile directory, so cookie sessions and
 * human-solved challenges survive across harness runs — the operational stance the backlink
 * publishing workflow depends on.
 * @module @deepseek-ai/dsh-browser-playwright
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-browser'
import { PlaywrightBrowserProvider, type ResolvedPlaywrightConfig } from './provider.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'browser-playwright'
/** The browser seam this provider registers into. */
export const inject = ['browser']

/** Configuration for the Playwright browser provider. */
export interface Config {
  /** Persistent profile directory; logins, cookies, and challenge solutions survive runs. */
  readonly userDataDir?: string
  /** Launch headless; default false so a human can step into the same browser. */
  readonly headless?: boolean
  /** Chromium distribution channel; default `chrome` (installed Google Chrome). Empty = bundled Chromium. */
  readonly channel?: string
  /** Default per-operation timeout in milliseconds. */
  readonly defaultTimeoutMs?: number
  /** Extra Chromium launch arguments (proxy, window size, …). */
  readonly launchArgs?: string[]
  /**
   * Initial window position `x,y` for Chrome. Offscreen values (for example
   * `-32000,-32000`) keep the headed browser invisible while a human can still
   * surface a tab with the `bringToFront` browser action.
   */
  readonly windowPosition?: string
  /**
   * Playwright default launch arguments to omit, by exact flag. Omitting
   * `--enable-automation` keeps automation-hostile pages (notably the Google
   * account login) from rejecting the browser as unsafe.
   */
  readonly ignoreDefaultArgs?: string[]
}

export const Config: z<Config> = z.object({
  userDataDir: z.string().default('.browser-profile'),
  headless: z.boolean().default(false),
  channel: z.string().default('chrome'),
  defaultTimeoutMs: z.number().default(15_000),
  launchArgs: z.array(z.string()).default([]),
  ignoreDefaultArgs: z.array(z.string()).default([]),
  windowPosition: z.string(),
})

export function apply(ctx: Context, config: Config): void {
  const resolved = config as ResolvedPlaywrightConfig
  if (resolved.userDataDir.trim().length === 0) {
    throw new Error('browser-playwright: userDataDir must not be empty')
  }
  if (!Number.isSafeInteger(resolved.defaultTimeoutMs) || resolved.defaultTimeoutMs <= 0) {
    throw new Error(`browser-playwright: defaultTimeoutMs must be a positive integer, got ${resolved.defaultTimeoutMs}`)
  }
  ctx.browser.registerProvider(new PlaywrightBrowserProvider(resolved))
}

export { PLAYWRIGHT_BROWSER_PROVIDER_ID } from './provider.ts'
