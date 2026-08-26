/**
 * The cloud-mail implementation of the mailbox seam: an Open-API client that creates addresses
 * (`POST /public/addUser`) and polls received mail (`POST /public/emailList`) until a match arrives or the
 * bounded wait elapses. The backend's AI-extracted `code` field and the first body URL surface as
 * `VerificationMail.code` / `.link`.
 */

import type {
  MailboxAddress,
  MailboxProvider,
  MailPollOptions,
  VerificationMail,
} from '@deepseek-ai/dsh-backlinks'
import { BacklinksError } from '@deepseek-ai/dsh-backlinks'

/** Registry id of this provider. */
export const CLOUD_MAIL_MAILBOX_ID = 'cloud-mail'

/** First URL in a body, when present. */
const FIRST_URL = /https?:\/\/[^\s<>"')]+/u

/** Resolved client configuration after schemastery defaults. */
export interface ResolvedCloudMailConfig {
  /** Base URL of the worker API, for example `https://mail.example.org/api`. */
  readonly baseUrl: string
  /** Open-API token; resolves from `CLOUDMAIL_TOKEN` when omitted from config. */
  readonly token: string
  /** Per-request timeout in milliseconds. */
  readonly requestTimeoutMs: number
}

/** @param value - a JSON value asserted by the caller to be an object.
 * @returns the value as a mutable record. */
function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>
}

/** Coerce one wire field to text without invoking an object's default stringification.
 * @param value - the wire value.
 * @returns the field as text, or the empty string for non-strings. */
function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function toVerificationMail(row: Record<string, unknown>): VerificationMail {
  const text = typeof row.text === 'string' && row.text.length > 0 ? row.text : str(row.content)
  const link = text.match(FIRST_URL)?.[0] ?? null
  return {
    subject: str(row.subject),
    from: str(row.sendEmail),
    text,
    code: typeof row.code === 'string' && row.code.length > 0 ? row.code : null,
    link,
    receivedAt: str(row.createTime),
  }
}

/** Wait between polls; rejects immediately when the caller aborts. */
function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new BacklinksError('mailbox wait aborted', 'BACKLINKS_ABORTED'))
    }, { once: true })
  })
}

/** cloud-mail-backed mailbox provider. */
export class CloudMailMailbox implements MailboxProvider {
  readonly id = CLOUD_MAIL_MAILBOX_ID

  constructor(private readonly config: ResolvedCloudMailConfig) {}

  /** Usable once a base URL and token are configured; no network is touched. */
  available(): boolean {
    return this.config.baseUrl.length > 0 && this.config.token.length > 0
  }

  async createMailbox(options: { readonly localPart: string; readonly domain: string }, signal?: AbortSignal): Promise<MailboxAddress> {
    const email = `${options.localPart}@${options.domain}`
    await this.requestJson('/public/addUser', {
      method: 'POST',
      payload: { list: [{ email }] },
    }, signal)
    return { email }
  }

  async pollMail(address: MailboxAddress, options: MailPollOptions, signal?: AbortSignal): Promise<VerificationMail | null> {
    const deadline = Date.now() + options.timeoutMs
    // Poll immediately, then on the interval, until the deadline.
    while (true) {
      const rows = await this.fetchMailRows(address, signal)
      const match = rows.find(row => this.matches(row, options))
      if (match !== undefined) return toVerificationMail(match)
      if (Date.now() + options.intervalMs >= deadline) return null
      await sleep(options.intervalMs, signal)
    }
  }

  /** One page of received mail for the address, newest first. */
  private async fetchMailRows(address: MailboxAddress, signal?: AbortSignal): Promise<readonly Record<string, unknown>[]> {
    const body = await this.requestJson('/public/emailList', {
      method: 'POST',
      payload: { toEmail: address.email, size: 20, num: 1, type: 0, isDel: 0 },
    }, signal)
    // The open API wraps payloads as { code, message, data } where `data` is
    // the row array itself; some deployments wrap once more as { list }.
    // Accept both so a payload in neither shape simply yields no rows.
    const data = asRecord(body).data ?? body
    const rows = Array.isArray(data) ? data : asRecord(data).list
    return Array.isArray(rows) ? rows.map(asRecord) : []
  }

  /** Apply the caller's subject/sender filters. */
  private matches(row: Record<string, unknown>, options: MailPollOptions): boolean {
    if (options.subjectContains !== undefined
      && !str(row.subject).toLowerCase().includes(options.subjectContains.toLowerCase())) {
      return false
    }
    if (options.fromContains !== undefined
      && !str(row.sendEmail).toLowerCase().includes(options.fromContains.toLowerCase())) {
      return false
    }
    return true
  }

  /** One JSON request against the open API with typed error mapping. */
  private async requestJson(path: string, init: { method: 'POST'; payload: Record<string, unknown> }, signal?: AbortSignal): Promise<unknown> {
    if (signal?.aborted) throw new BacklinksError('request aborted', 'BACKLINKS_ABORTED')
    const timeout = new AbortController()
    const timer = setTimeout(() =>{  timeout.abort() }, this.config.requestTimeoutMs)
    const onOuterAbort = () =>{  timeout.abort() }
    signal?.addEventListener('abort', onOuterAbort, { once: true })
    try {
      let response: Response
      try {
        response = await fetch(`${this.config.baseUrl}${path}`, {
          method: init.method,
          headers: { authorization: this.config.token, 'content-type': 'application/json' },
          body: JSON.stringify(init.payload),
          signal: timeout.signal,
        })
      } catch (error) {
        if (signal?.aborted) throw new BacklinksError('request aborted', 'BACKLINKS_ABORTED')
        if (timeout.signal.aborted) {
          throw new BacklinksError(`cloud-mail ${path} timed out after ${this.config.requestTimeoutMs}ms`, 'BACKLINKS_TIMEOUT')
        }
        throw new BacklinksError(
          `cloud-mail ${path} transport failure: ${String(error instanceof Error ? error.message : error)}`,
          'BACKLINKS_TRANSPORT',
          null,
          { cause: error },
        )
      }
      const bodyText = await response.text()
      if (!response.ok) {
        throw new BacklinksError(
          `cloud-mail ${path} failed (HTTP ${response.status}): ${bodyText.slice(0, 300)}`,
          response.status === 401 || response.status === 403 ? 'BACKLINKS_UNAUTHORIZED' : 'BACKLINKS_API_ERROR',
        )
      }
      return JSON.parse(bodyText) as unknown
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onOuterAbort)
    }
  }
}
