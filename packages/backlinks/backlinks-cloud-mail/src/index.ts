/**
 * Service Provider for the backlinks mailbox seam: a cloud-mail Open-API client. Creates verification
 * addresses and polls received mail with backend-extracted codes. The token resolves from config or
 * `CLOUDMAIL_TOKEN`.
 * @module @deepseek-ai/dsh-backlinks-cloud-mail
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import type {} from '@deepseek-ai/dsh-backlinks'
import { CloudMailMailbox, type ResolvedCloudMailConfig } from './provider.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'backlinks-cloud-mail'
/** The backlinks seam this provider registers into. */
export const inject = ['backlinks']

/** Configuration for the cloud-mail mailbox provider. */
export interface Config {
  /** Base URL of the worker API, for example `https://mail.example.org/api`. */
  readonly baseUrl?: string
  /** Open-API token; `CLOUDMAIL_TOKEN` is the environment fallback. */
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
  const resolved = config as ResolvedCloudMailConfig
  if (resolved.baseUrl.length > 0 && !/^https?:\/\//u.test(resolved.baseUrl)) {
    throw new Error(`backlinks-cloud-mail: baseUrl must be an http(s) URL, got ${resolved.baseUrl}`)
  }
  if (!Number.isSafeInteger(resolved.requestTimeoutMs) || resolved.requestTimeoutMs <= 0) {
    throw new Error(`backlinks-cloud-mail: requestTimeoutMs must be a positive integer, got ${resolved.requestTimeoutMs}`)
  }
  const token = resolved.token.length > 0
    ? resolved.token
    : launchEnvironmentOf(ctx).get('CLOUDMAIL_TOKEN')?.value ?? ''
  ctx.backlinks.registerMailboxProvider(new CloudMailMailbox({
    ...resolved,
    token,
  }))
}

export { CLOUD_MAIL_MAILBOX_ID } from './provider.ts'
