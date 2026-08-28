/**
 * Service Provider for the backlinks mailbox seam: a cloud-mail Open-API client. Creates verification
 * addresses and polls received mail with backend-extracted codes. The base URL and token resolve
 * per-field from the settings user section, the composition entry, then `CLOUDMAIL_TOKEN`, in that
 * order; a settings change re-registers the provider without a restart.
 * @module @deepseek-ai/dsh-backlinks-cloud-mail
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-backlinks'
import { CloudMailMailbox, type ResolvedCloudMailConfig } from './provider.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'backlinks-cloud-mail'
/** The backlinks seam this provider registers into. */
export const inject = ['backlinks']

/** Settings namespace this provider surfaces in configuration UIs. */
const NS = settingsNamespace('backlinks-cloud-mail')

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

/** User-editable settings section layered over the composition entry's `baseUrl`/`token`. */
interface Section {
  /** Base URL of the worker API; the composition entry's value applies when unset. */
  readonly baseUrl: string
  /** Open-API token, redacted on configuration surfaces; falls back to the environment. */
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
    throw new Error(`backlinks-cloud-mail: baseUrl must be an http(s) URL, got ${baseUrl}`)
  }
}

export function apply(ctx: Context, config: Config): void {
  const resolved = config as ResolvedCloudMailConfig
  assertHttpBaseUrl(resolved.baseUrl)
  if (!Number.isSafeInteger(resolved.requestTimeoutMs) || resolved.requestTimeoutMs <= 0) {
    throw new Error(`backlinks-cloud-mail: requestTimeoutMs must be a positive integer, got ${resolved.requestTimeoutMs}`)
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
      : launchEnvironmentOf(ctx).get('CLOUDMAIL_TOKEN')?.value ?? ''
    dispose?.()
    dispose = ctx.backlinks.registerMailboxProvider(new CloudMailMailbox({
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

export { CLOUD_MAIL_MAILBOX_ID } from './provider.ts'
