/**
 * Service Provider for the backlinks mailbox seam: a cloud-mail Open-API client. Creates verification
 * addresses and polls received mail with backend-extracted codes. The entry's config section is the
 * settings surface: `baseUrl` and `token` resolve per use from the settings user layer over the
 * composition entry, then `CLOUDMAIL_TOKEN`, in that order; the provider reads them through a
 * resolver, so a settings change applies without a restart.
 * @module @deepseek-ai/dsh-backlinks-cloud-mail
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import type {} from '@deepseek-ai/dsh-backlinks'
import { CloudMailMailbox, type ResolvedCloudMailConfig } from './provider.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'backlinks-cloud-mail'
/** The backlinks seam this provider registers into. */
export const inject = ['backlinks']

/** Settings namespace this provider surfaces in configuration UIs. */
export const BACKLINKS_CLOUD_MAIL_SETTINGS_NAMESPACE = 'backlinks-cloud-mail'

/** Configuration for the cloud-mail mailbox provider. */
export interface Config {
  /** Base URL of the worker API, for example `https://mail.example.org/api`. */
  readonly baseUrl: Volatile<string>
  /** Open-API token, redacted on configuration surfaces; `CLOUDMAIL_TOKEN` is the environment fallback. */
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
    throw new Error(`backlinks-cloud-mail: baseUrl must be an http(s) URL, got ${baseUrl}`)
  }
}

export function apply(ctx: Context, config: Config): void {
  const resolve = (): ResolvedCloudMailConfig => {
    const requestTimeoutMs = config.requestTimeoutMs.get()
    if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs <= 0) {
      throw new Error(`backlinks-cloud-mail: requestTimeoutMs must be a positive integer, got ${requestTimeoutMs}`)
    }
    const baseUrl = config.baseUrl.get()
    assertHttpBaseUrl(baseUrl)
    const declared = config.token.get()
    const token = declared !== undefined && declared.length > 0
      ? declared
      : launchEnvironmentOf(ctx).get('CLOUDMAIL_TOKEN')?.value ?? ''
    return { baseUrl, token, requestTimeoutMs }
  }
  ctx.effect(() => ctx.backlinks.registerMailboxProvider(new CloudMailMailbox(resolve)), 'backlinks-cloud-mail: provider')
}

export { CLOUD_MAIL_MAILBOX_ID } from './provider.ts'
