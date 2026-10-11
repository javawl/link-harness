/**
 * Service Provider for the backlinks batch work-source seam: a Bearer-token HTTP client for the supermanager
 * `/api/agent/*` surface (batch listing/detail, lease claim/heartbeat/release, per-item result write-back,
 * reciprocal badges). The entry's config section is the settings surface: `baseUrl` and `token` resolve
 * per use from the settings user layer over the composition entry, then `SUPERMANAGER_TOKEN`, in that
 * order; the provider reads them through a resolver, so a settings change applies without a restart.
 * @module @deepseek-ai/dsh-backlinks-supermanager
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import type {} from '@deepseek-ai/dsh-backlinks'
import { SupermanagerBatchSource, type ResolvedSupermanagerConfig } from './provider.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'backlinks-supermanager'
/** The backlinks seam this provider registers into. */
export const inject = ['backlinks']

/** Settings namespace this provider surfaces in configuration UIs. */
export const BACKLINKS_SUPERMANAGER_SETTINGS_NAMESPACE = 'backlinks-supermanager'

/** Configuration for the supermanager batch work-source provider. */
export interface Config {
  /** Base URL of the deployment, for example `http://127.0.0.1:3000`. */
  readonly baseUrl: Volatile<string>
  /** Bearer agent token, redacted on configuration surfaces; `SUPERMANAGER_TOKEN` is the environment fallback. */
  readonly token: Volatile<string | undefined>
  /** Per-request timeout in milliseconds. */
  readonly requestTimeoutMs: Volatile<number>
}

export const Config = z.object({
  baseUrl: z.string().default('').volatile(),
  token: z.string().role('secret').volatile(),
  requestTimeoutMs: z.number().default(15_000).volatile(),
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
  const resolve = (): ResolvedSupermanagerConfig => {
    const requestTimeoutMs = config.requestTimeoutMs.get()
    if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs <= 0) {
      throw new Error(`backlinks-supermanager: requestTimeoutMs must be a positive integer, got ${requestTimeoutMs}`)
    }
    const baseUrl = config.baseUrl.get()
    assertHttpBaseUrl(baseUrl)
    const declared = config.token.get()
    const token = declared !== undefined && declared.length > 0
      ? declared
      : launchEnvironmentOf(ctx).get('SUPERMANAGER_TOKEN')?.value ?? ''
    return { baseUrl, token, requestTimeoutMs }
  }
  ctx.effect(() => ctx.backlinks.registerBatchSourceProvider(new SupermanagerBatchSource(resolve)), 'backlinks-supermanager: provider')
}

export { SUPERMANAGER_BATCH_SOURCE_ID } from './provider.ts'
