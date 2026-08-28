import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apply, Config } from '@deepseek-ai/dsh-backlinks-cloud-mail/src/index.ts'
import {
  CloudMailMailbox,
  CLOUD_MAIL_MAILBOX_ID,
  type ResolvedCloudMailConfig,
} from '@deepseek-ai/dsh-backlinks-cloud-mail/src/provider.ts'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Parse a request body the tests always send as a JSON string. */
function jsonBody(body: BodyInit | null | undefined): Record<string, unknown> {
  if (typeof body !== 'string') throw new TypeError('expected a stringified JSON body')
  return JSON.parse(body) as Record<string, unknown>
}

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 })
}

function resolved(overrides: Partial<ResolvedCloudMailConfig> = {}): ResolvedCloudMailConfig {
  return {
    baseUrl: 'https://mail.test/api',
    token: 'uuid-token',
    requestTimeoutMs: 2_000,
    ...overrides,
  }
}

const mailRow = {
  subject: 'Verify your directory submission',
  sendEmail: 'noreply@dir.test',
  text: 'Your code is 778899. Open https://dir.test/verify?t=1',
  code: '778899',
  createTime: '2026-08-25 10:00:00',
}

describe('CloudMailMailbox', () => {
  it('is available only with baseUrl and token configured', () => {
    const mailbox = new CloudMailMailbox(resolved())
    expect(mailbox.id).toBe(CLOUD_MAIL_MAILBOX_ID)
    expect(mailbox.available()).toBe(true)
    expect(new CloudMailMailbox(resolved({ token: '' })).available()).toBe(false)
  })

  it('creates a mailbox through the open API', async () => {
    fetchMock.mockResolvedValueOnce(ok({ code: 200, message: 'success', data: {} }))
    const mailbox = new CloudMailMailbox(resolved())

    await expect(mailbox.createMailbox({ localPart: 'agent7', domain: 'mail.test' }))
      .resolves.toEqual({ email: 'agent7@mail.test' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://mail.test/api/public/addUser')
    expect(init.headers).toMatchObject({ authorization: 'uuid-token' })
    expect(jsonBody(init.body)).toEqual({ list: [{ email: 'agent7@mail.test' }] })
  })

  it('returns the first matching mail with code and first link', async () => {
    fetchMock.mockResolvedValueOnce(ok({ code: 200, data: { list: [{ subject: 'other' }, mailRow] } }))
    const mailbox = new CloudMailMailbox(resolved())

    const mail = await mailbox.pollMail(
      { email: 'agent7@mail.test' },
      { subjectContains: 'verify', timeoutMs: 100, intervalMs: 1 },
    )
    expect(mail).toMatchObject({
      subject: 'Verify your directory submission',
      from: 'noreply@dir.test',
      code: '778899',
      link: 'https://dir.test/verify?t=1',
    })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(jsonBody(init.body)).toMatchObject({ toEmail: 'agent7@mail.test', type: 0 })
  })

  it('reads rows from a deployment whose data is the row array itself', async () => {
    fetchMock.mockResolvedValueOnce(ok({ code: 200, data: [mailRow] }))
    const mailbox = new CloudMailMailbox(resolved())

    const mail = await mailbox.pollMail({ email: 'agent7@mail.test' }, { timeoutMs: 100, intervalMs: 1 })
    expect(mail).toMatchObject({ code: '778899', link: 'https://dir.test/verify?t=1' })
  })

  it('falls back to html content for text and reports absent code/link', async () => {
    fetchMock.mockResolvedValueOnce(ok({
      code: 200,
      data: { list: [{ subject: 'welcome', sendEmail: 'a@b.test', content: '<p>plain body</p>', createTime: 't' }] },
    }))
    const mailbox = new CloudMailMailbox(resolved())

    const mail = await mailbox.pollMail({ email: 'x@y.test' }, { timeoutMs: 100, intervalMs: 1 })
    expect(mail).toMatchObject({ text: '<p>plain body</p>', code: null, link: null })
  })

  it('keeps polling until a match arrives, then stops', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ code: 200, data: { list: [] } }))
      .mockResolvedValueOnce(ok({ code: 200, data: { list: [] } }))
      .mockResolvedValueOnce(ok({ code: 200, data: { list: [mailRow] } }))
    const mailbox = new CloudMailMailbox(resolved())

    const mail = await mailbox.pollMail(
      { email: 'x@y.test' },
      { fromContains: 'dir.test', timeoutMs: 5_000, intervalMs: 1 },
    )
    expect(mail?.code).toBe('778899')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('returns null when the deadline elapses without a match', async () => {
    fetchMock.mockImplementation(async () => ok({ code: 200, data: { list: [] } }))
    const mailbox = new CloudMailMailbox(resolved())

    await expect(mailbox.pollMail({ email: 'x@y.test' }, { timeoutMs: 10, intervalMs: 5 }))
      .resolves.toBeNull()
  })

  it('applies subject and sender filters case-insensitively', async () => {
    fetchMock.mockResolvedValueOnce(ok({
      code: 200,
      data: { list: [{ subject: 'Welcome!', sendEmail: 'nope@other.test' }] },
    })).mockResolvedValueOnce(ok({ code: 200, data: { list: [mailRow] } }))
    const mailbox = new CloudMailMailbox(resolved())

    const mail = await mailbox.pollMail(
      { email: 'x@y.test' },
      { subjectContains: 'VERIFY', fromContains: 'DIR.TEST', timeoutMs: 1_000, intervalMs: 1 },
    )
    expect(mail?.code).toBe('778899')
  })

  it('rejects when the outer signal aborts between polls', async () => {
    fetchMock.mockResolvedValue(ok({ code: 200, data: { list: [] } }))
    const mailbox = new CloudMailMailbox(resolved())
    const outer = new AbortController()
    setTimeout(() =>{  outer.abort() }, 3)

    await expect(mailbox.pollMail(
      { email: 'x@y.test' },
      { timeoutMs: 10_000, intervalMs: 5 },
      outer.signal,
    )).rejects.toThrow(expect.objectContaining({ code: 'BACKLINKS_ABORTED' }))
  })

  it('maps HTTP and transport failures', async () => {
    const mailbox = new CloudMailMailbox(resolved())

    fetchMock.mockResolvedValueOnce(new Response('denied', { status: 401 }))
    await expect(mailbox.createMailbox({ localPart: 'a', domain: 'b.test' }))
      .rejects.toThrow(expect.objectContaining({ code: 'BACKLINKS_UNAUTHORIZED' }))

    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }))
    await expect(mailbox.createMailbox({ localPart: 'a', domain: 'b.test' }))
      .rejects.toThrow(expect.objectContaining({ code: 'BACKLINKS_API_ERROR' }))

    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    await expect(mailbox.createMailbox({ localPart: 'a', domain: 'b.test' }))
      .rejects.toThrow(expect.objectContaining({ code: 'BACKLINKS_TRANSPORT' }))
  })
})

describe('backlinks-cloud-mail plugin apply', () => {
  it('registers the provider with env token fallback', () => {
    const registerMailboxProvider = vi.fn()
    const defaulted = Config({ baseUrl: 'https://mail.test/api' }) as ResolvedCloudMailConfig & { token?: string }
    process.env.CLOUDMAIL_TOKEN = 'env-token'
    try {
      apply({
        backlinks: { registerMailboxProvider },
        get: () => undefined,
        inject: () => {},
        effect: () => () => {},
      } as never, defaulted)
    } finally {
      delete process.env.CLOUDMAIL_TOKEN
    }
    const registered = registerMailboxProvider.mock.calls[0]?.[0] as unknown as {
      id: string
      config: { token: string }
    }
    expect(registered.id).toBe('cloud-mail')
    expect(registered.config.token).toBe('env-token')
  })

  it('rejects a non-http baseUrl and non-positive timeout', () => {
    const ctx = { backlinks: { registerMailboxProvider: vi.fn() }, get: () => undefined }
    expect(() =>{  apply(ctx as never, { baseUrl: 'x://y' }) }).toThrow(/baseUrl/u)
    expect(() =>{  apply(ctx as never, { baseUrl: 'http://y', requestTimeoutMs: 0 }) }).toThrow(/requestTimeoutMs/u)
  })
})
