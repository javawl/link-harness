/**
 * Service Provider for the browser automation seam: a Playwright-backed persistent Chromium
 * context. Headed by default over a persistent profile directory, so cookie sessions and
 * human-solved challenges survive across harness runs — the operational stance the backlink
 * publishing workflow depends on.
 * @module @deepseek-ai/dsh-browser-playwright
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-browser'
import { PlaywrightBrowserProvider, type ResolvedPlaywrightConfig } from './provider.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'browser-playwright'
/** The browser seam this provider registers into. */
export const inject = ['browser']

/** A named browser with its own profile directory or an existing Chromium debugging endpoint. */
export interface BrowserProfile {
  /** User-facing identifier used for browser selection. */
  readonly id: string
  /** Dedicated persistent directory; required unless cdpEndpoint is supplied. */
  readonly userDataDir?: string
  /** HTTP endpoint of an existing local Chromium browser, for example http://127.0.0.1:9222. */
  readonly cdpEndpoint?: string
  /** Installed Chromium channel override, for example chrome or msedge. */
  readonly channel?: string
}

const BrowserProfile: z<BrowserProfile> = z.object({
  id: z.string().required(),
  userDataDir: z.string(),
  cdpEndpoint: z.string(),
  channel: z.string(),
})

/** Configuration for the Playwright browser provider. */
export interface Config {
  /** Additional browsers selectable independently of the default playwright browser. */
  readonly profiles?: BrowserProfile[]
  /** Persistent profile directory; logins, cookies, and challenge solutions survive runs. */
  readonly userDataDir?: string
  /** Launch headless; default false so a human can step into the same browser. */
  readonly headless?: boolean
  /** Chromium distribution channel; default `chrome` (installed Google Chrome). Empty = bundled Chromium. */
  readonly channel?: string
  /** Default per-operation timeout in milliseconds. */
  readonly defaultTimeoutMs?: number
  /** Timeout for navigation, independent of locator and snapshot waits. */
  readonly navigationTimeoutMs?: number
  /** Readiness required by navigations that do not specify waitUntil. */
  readonly navigationWaitUntil?: 'load' | 'domcontentloaded' | 'networkidle'
  /** Live-page ceiling for tool-requested page creation; zero disables it. Existing pages remain usable. */
  readonly maxOpenPages?: number
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
  profiles: z.array(BrowserProfile).default([]),
  userDataDir: z.string().default('.browser-profile'),
  headless: z.boolean().default(false),
  channel: z.string().default('chrome'),
  defaultTimeoutMs: z.number().default(15_000),
  navigationTimeoutMs: z.number().default(20_000),
  navigationWaitUntil: z.union(['load', 'domcontentloaded', 'networkidle'] as const).default('domcontentloaded'),
  maxOpenPages: z.number().default(16),
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
  for (const key of ['navigationTimeoutMs', 'maxOpenPages'] as const) {
    const minimum = key === 'maxOpenPages' ? 0 : 1
    if (!Number.isSafeInteger(resolved[key]) || resolved[key] < minimum) {
      throw new Error(`browser-playwright: ${key} must be an integer >= ${minimum}`)
    }
  }
  const defaultProvider = new PlaywrightBrowserProvider(resolved)
  ctx.browser.registerProvider(defaultProvider)
  const installed = new Map<string, { signature: string; dispose: () => void }>()
  const Section = z.object({ profiles: z.array(BrowserProfile).default([]) })
  const entry = { profiles: config.profiles ?? [] }
  let source = () => entry
  const providersFor = (profiles: BrowserProfile[]) => profiles.map((profile) => {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(profile.id) || profile.id === defaultProvider.id) {
      throw new Error('browser-playwright: profile id must be unique, use letters/digits/_/-, and cannot be playwright')
    }
    if ((profile.userDataDir === undefined) === (profile.cdpEndpoint === undefined)
      || profile.userDataDir?.trim() === '') {
      throw new Error(`browser-playwright: ${profile.id} needs exactly one userDataDir or cdpEndpoint`)
    }
    return new PlaywrightBrowserProvider({ ...resolved,
      ...profile.userDataDir === undefined ? {} : { userDataDir: profile.userDataDir },
      ...profile.channel === undefined ? {} : { channel: profile.channel },
      ...profile.cdpEndpoint === undefined ? {} : { cdpEndpoint: profile.cdpEndpoint },
    }, profile.id)
  })
  const validate = (section: typeof entry): void => {
    const providers = [defaultProvider, ...providersFor(section.profiles)]
    if (new Set(providers.map(provider => provider.id)).size !== providers.length
      || new Set(providers.map(provider => provider.resourceKey)).size !== providers.length) {
      throw new Error('browser-playwright: browser ids, profile directories and debugging endpoints must be distinct')
    }
    for (const [id, previous] of installed) {
      if (ctx.browser.hasSession(id)
        && JSON.stringify(section.profiles.find(profile => profile.id === id)) !== previous.signature) {
        throw new Error(`browser-playwright: ${id} has retained pages; close its session before changing or removing it`)
      }
    }
  }
  const install = (): void => {
    const section = source()
    validate(section)
    const providers = providersFor(section.profiles)
    for (const [id, previous] of installed) {
      if (!providers.some(provider => provider.id === id)
        || JSON.stringify(section.profiles.find(profile => profile.id === id)) !== previous.signature) {
        previous.dispose()
        installed.delete(id)
      }
    }
    for (const provider of providers) {
      if (!installed.has(provider.id)) installed.set(provider.id, {
        signature: JSON.stringify(section.profiles.find(profile => profile.id === provider.id)),
        dispose: ctx.browser.registerProvider(provider),
      })
    }
  }
  install()
  installSettingsSection(ctx, settingsNamespace('browser-playwright'), Section, entry, {
    validate, setSource: (current) => { source = current }, onChange: install,
  })
}

export { PLAYWRIGHT_BROWSER_PROVIDER_ID } from './provider.ts'
