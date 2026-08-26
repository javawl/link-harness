/**
 * Service Provider for the backlinks batch work-source seam: a Bearer-token HTTP client for the supermanager
 * `/api/agent/*` surface (batch listing/detail, lease claim/heartbeat/release, per-item result write-back,
 * reciprocal badges). The token resolves from config or `SUPERMANAGER_TOKEN`.
 * @module @deepseek-ai/dsh-backlinks-supermanager
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import type {} from '@deepseek-ai/dsh-backlinks'
import { SupermanagerBatchSource, type ResolvedSupermanagerConfig } from './provider.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'backlinks-supermanager'
/** The backlinks seam this provider registers into. */
export const inject = ['backlinks']

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

export function apply(ctx: Context, config: Config): void {
  const resolved = config as ResolvedSupermanagerConfig
  if (resolved.baseUrl.length > 0 && !/^https?:\/\//u.test(resolved.baseUrl)) {
    throw new Error(`backlinks-supermanager: baseUrl must be an http(s) URL, got ${resolved.baseUrl}`)
  }
  if (!Number.isSafeInteger(resolved.requestTimeoutMs) || resolved.requestTimeoutMs <= 0) {
    throw new Error(`backlinks-supermanager: requestTimeoutMs must be a positive integer, got ${resolved.requestTimeoutMs}`)
  }
  const token = resolved.token.length > 0
    ? resolved.token
    : launchEnvironmentOf(ctx).get('SUPERMANAGER_TOKEN')?.value ?? ''
  ctx.backlinks.registerBatchSourceProvider(new SupermanagerBatchSource({
    ...resolved,
    token,
  }))
}

export { SUPERMANAGER_BATCH_SOURCE_ID } from './provider.ts'
