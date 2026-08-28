/**
 * Service Provider for the backlinks batch work-source seam: a Bearer-token HTTP client for the supermanager
 * `/api/agent/*` surface (batch listing/detail, lease claim/heartbeat/release, per-item result write-back,
 * reciprocal badges). The base URL and token resolve per-field from the settings user section, the
 * composition entry, then `SUPERMANAGER_TOKEN`, in that order; a settings change re-registers the
 * provider without a restart.
 * @module @deepseek-ai/dsh-backlinks-supermanager
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-backlinks'
import { SupermanagerBatchSource, type ResolvedSupermanagerConfig } from './provider.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'backlinks-supermanager'
/** The backlinks seam this provider registers into. */
export const inject = ['backlinks']

/** Settings namespace this provider surfaces in configuration UIs. */
const NS = settingsNamespace('backlinks-supermanager')

/** Configuration for the supermanager batch work-source provider. */
export interface Config {
  /** Base URL of the deployment, for example `http://127.0.0.1:3000`. */
  readonly baseUrl?: string
  /** Bearer agent token; `SUPERMANAGER_TOKEN` is the environment fallback. */
  readonly token?: string
  /** Per-request timeout in milliseconds. */
  readonly requestTimeoutMs?: number
}

export const Config: z<Config> = z.object({
  baseUrl: z.string().default(''),
  token: z.string().default(''),
  requestTimeoutMs: z.number().default(15_000),
})

/** User-editable settings section layered over the composition entry's `baseUrl`/`token`. */
interface Section {
  /** Base URL of the deployment; the composition entry's value applies when unset. */
  readonly baseUrl: string
  /** Bearer agent token, redacted on configuration surfaces; falls back to the environment. */
  readonly token?: string
}

const Section: z<Section> = z.object({
  baseUrl: z.string().default(''),
  token: z.string().role('secret'),
})

/**
 * Reject a non-empty base URL that is not an http(s) URL.
 * @param baseUrl - candidate base URL; the empty string passes (the field is simply unconfigured).
 */
function assertHttpBaseUrl(baseUrl: string): void {
  if (baseUrl.length > 0 && !/^https?:\/\//u.test(baseUrl)) {
    throw new Error(`backlinks-supermanager: baseUrl must be an http(s) URL, got ${baseUrl}`)
  }
}

export function apply(ctx: Context, config: Config): void {
  const resolved = config as ResolvedSupermanagerConfig
  assertHttpBaseUrl(resolved.baseUrl)
  if (!Number.isSafeInteger(resolved.requestTimeoutMs) || resolved.requestTimeoutMs <= 0) {
    throw new Error(`backlinks-supermanager: requestTimeoutMs must be a positive integer, got ${resolved.requestTimeoutMs}`)
  }
  const entry: Section = {
    baseUrl: resolved.baseUrl,
    ...resolved.token.length > 0 ? { token: resolved.token } : {},
  }
  let source: () => Section = () => entry
  let dispose: (() => void) | undefined
  const install = (): void => {
    const section = source()
    const token = section.token !== undefined && section.token.length > 0
      ? section.token
      : launchEnvironmentOf(ctx).get('SUPERMANAGER_TOKEN')?.value ?? ''
    dispose?.()
    dispose = ctx.backlinks.registerBatchSourceProvider(new SupermanagerBatchSource({
      baseUrl: section.baseUrl,
      token,
      requestTimeoutMs: resolved.requestTimeoutMs,
    }))
  }
  install()
  installSettingsSection(ctx, NS, Section, entry, {
    validate: (section) => {
      assertHttpBaseUrl(section.baseUrl)
    },
    setSource: (current) => {
      source = current
    },
    onChange: install,
  })
  ctx.effect(() => () => dispose?.())
}

export { SUPERMANAGER_BATCH_SOURCE_ID } from './provider.ts'
