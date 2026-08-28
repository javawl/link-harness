import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apply, Config } from '@deepseek-ai/dsh-backlinks-supermanager/src/index.ts'
import {
  SupermanagerBatchSource,
  SUPERMANAGER_BATCH_SOURCE_ID,
  type ResolvedSupermanagerConfig,
} from '@deepseek-ai/dsh-backlinks-supermanager/src/provider.ts'
import { BacklinksError } from '@deepseek-ai/dsh-backlinks'

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

function ok(body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers })
}

function resolved(overrides: Partial<ResolvedSupermanagerConfig> = {}): ResolvedSupermanagerConfig {
  return {
    baseUrl: 'http://127.0.0.1:3000',
    token: 'smag_test',
    requestTimeoutMs: 2_000,
    ...overrides,
  }
}

const batchRow = {
  id: 176,
  name: 'PB-1',
  websiteId: 82,
  websiteName: 'site',
  websiteHost: 'site.test',
  plannedAt: '2026-08-25T02:00:00.000Z',
  counts: { pending: 12, executed: 3, skipped: 1, failed: 2, total: 18 }, executing: false,
}

const itemRow = {
  id: 1258,
  sourceId: 45,
  sourceName: 'dir',
  sourceUrl: 'https://dir.test',
  sourceHost: 'dir.test',
  submitUrl: 'https://dir.test/submit',
  sourceNotes: null,
  category: '导航站',
  tags: ['免费'],
  paymentType: 'free',
  linkType: 'dofollow',
  status: 'pending',
  failureMode: null,
  failureReason: null,
  publishedUrl: null,
  publishStatus: null,
  plannedAt: '2026-08-25T02:00:00.000Z',
}

describe('SupermanagerBatchSource', () => {
  it('is available only with baseUrl and token configured', () => {
    const provider = new SupermanagerBatchSource(resolved())
    expect(provider.id).toBe(SUPERMANAGER_BATCH_SOURCE_ID)
    expect(provider.available()).toBe(true)
    expect(new SupermanagerBatchSource(resolved({ token: '' })).available()).toBe(false)
    expect(new SupermanagerBatchSource(resolved({ baseUrl: '' })).available()).toBe(false)
  })

  it('lists batches with the bearer token', async () => {
    fetchMock.mockResolvedValueOnce(ok({ ok: true, batches: [batchRow] }))
    const provider = new SupermanagerBatchSource(resolved())

    const batches = await provider.listBatches()
    expect(batches).toEqual([{
      id: 176, name: 'PB-1', websiteId: 82, websiteName: 'site', websiteHost: 'site.test',
      plannedAt: '2026-08-25T02:00:00.000Z',
      counts: { pending: 12, executed: 3, skipped: 1, failed: 2, total: 18 }, executing: false,
    }])
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:3000/api/agent/batches')
    expect(init.headers).toMatchObject({ authorization: 'Bearer smag_test' })
  })

  it('maps batch detail rows including anchors and items', async () => {
    fetchMock.mockResolvedValueOnce(ok({
      ok: true,
      batch: batchRow,
      website: { id: 82, name: 'site', siteUrl: 'https://site.test', siteHost: 'site.test' },
      anchors: [{ id: 1, anchorText: 'Site', targetUrl: 'https://site.test/' }],
      items: [itemRow],
    }))
    const provider = new SupermanagerBatchSource(resolved())

    const detail = await provider.getBatch(176)
    expect(detail.website.siteUrl).toBe('https://site.test')
    expect(detail.anchors).toEqual([{ id: 1, anchorText: 'Site', targetUrl: 'https://site.test/' }])
    expect(detail.items[0]).toMatchObject({ id: 1258, submitUrl: 'https://dir.test/submit', tags: ['免费'] })
  })

  it('claims with the default rule or an explicit item list', async () => {
    fetchMock.mockResolvedValueOnce(ok({
      ok: true, leaseId: 900, leaseExpiresAt: '2026-08-25T10:57:18Z', items: [itemRow],
    }))
    const provider = new SupermanagerBatchSource(resolved())

    const claim = await provider.claim(176)
    expect(claim).toMatchObject({ leaseId: 900, leaseExpiresAt: '2026-08-25T10:57:18Z' })
    expect(claim.items[0]?.id).toBe(1258)
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].body).toBe('{}')

    fetchMock.mockResolvedValueOnce(ok({ ok: true, leaseId: 901, leaseExpiresAt: '', items: [] }))
    await provider.claim(176, [1258])
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[1].body).toBe('{"itemIds":[1258]}')
  })

  it('heartbeats and releases leases', async () => {
    fetchMock.mockResolvedValueOnce(ok({ ok: true, leaseId: 900, leaseExpiresAt: 't2' }))
    fetchMock.mockResolvedValueOnce(ok({ ok: true, leaseId: 900, released: true }))
    const provider = new SupermanagerBatchSource(resolved())

    await expect(provider.heartbeat(900)).resolves.toEqual({ leaseId: 900, leaseExpiresAt: 't2' })
    await expect(provider.release(900)).resolves.toBeUndefined()
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe('http://127.0.0.1:3000/api/agent/leases/900/release')
  })

  it('flattens every item-result variant onto the wire shape', async () => {
    const provider = new SupermanagerBatchSource(resolved())
    const cases: Array<[Parameters<SupermanagerBatchSource['reportItemResult']>[1], Record<string, unknown>]> = [
      [{ status: 'live', publicUrl: 'https://d/l', anchorText: 'A', targetUrl: 'https://t/', evidence: 'E' },
        { status: 'live', publicUrl: 'https://d/l', anchorText: 'A', targetUrl: 'https://t/', evidenceZh: 'E' }],
      [{ status: 'submitted', anchorText: 'A', targetUrl: 'https://t/' },
        { status: 'submitted', anchorText: 'A', targetUrl: 'https://t/' }],
      [{ status: 'failed', failureMode: 'manual_required', failureReason: 'captcha' },
        { status: 'failed', failureMode: 'manual_required', failureReason: 'captcha' }],
      [{ status: 'skipped', skipReason: 'gone' }, { status: 'skipped', skipReason: 'gone' }],
    ]
    for (const [result, wire] of cases) {
      fetchMock.mockResolvedValueOnce(ok({ ok: true, itemStatus: 'executed', publishRecordId: 917 }))
      await expect(provider.reportItemResult(1, result)).resolves.toEqual({
        itemStatus: 'executed', publishRecordId: 917,
      })
      expect(jsonBody((fetchMock.mock.calls.at(-1) as [string, RequestInit])[1].body)).toEqual(wire)
    }
  })

  it('adds badges and reports callback state', async () => {
    fetchMock.mockResolvedValueOnce(ok({ ok: true, backlinkId: 643, callbackTriggered: false }))
    const provider = new SupermanagerBatchSource(resolved())

    await expect(provider.addBadge(82, { name: 'P', html: '<b>P</b>' })).resolves.toEqual({
      backlinkId: 643, callbackTriggered: false,
    })
    expect(jsonBody((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))
      .toEqual({ name: 'P', html: '<b>P</b>' })
  })

  it('attaches source tags by name and returns the resolution', async () => {
    fetchMock.mockResolvedValueOnce(ok({
      ok: true,
      sourceId: 156,
      attached: [
        { id: 95, name: '可复用', created: false },
        { id: 99, name: '有盾', created: true },
      ],
    }))
    const provider = new SupermanagerBatchSource(resolved())

    await expect(provider.tagSource(156, ['可复用', '有盾'])).resolves.toEqual({
      sourceId: 156,
      attached: [
        { id: 95, name: '可复用', created: false },
        { id: 99, name: '有盾', created: true },
      ],
    })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:3000/api/agent/sources/156/tags')
    expect(jsonBody(init.body)).toEqual({ tags: ['可复用', '有盾'] })
  })

  it('maps HTTP statuses onto the error taxonomy with Retry-After preserved', async () => {
    const provider = new SupermanagerBatchSource(resolved())

    fetchMock.mockResolvedValueOnce(new Response('{"ok":false}', { status: 400 }))
    await expect(provider.listBatches()).rejects.toThrow(expect.objectContaining({ code: 'BACKLINKS_INVALID_REQUEST' }))

    fetchMock.mockResolvedValueOnce(new Response('{"ok":false}', { status: 401 }))
    await expect(provider.listBatches()).rejects.toThrow(expect.objectContaining({ code: 'BACKLINKS_UNAUTHORIZED' }))

    fetchMock.mockResolvedValueOnce(new Response('{"ok":false}', { status: 404 }))
    await expect(provider.getBatch(1)).rejects.toThrow(expect.objectContaining({ code: 'BACKLINKS_NOT_FOUND' }))

    fetchMock.mockResolvedValueOnce(new Response('{"ok":false}', { status: 409, headers: { 'retry-after': '77' } }))
    const conflict = await provider.claim(1).then(
      () => { throw new Error('expected the conflict to reject') },
      (error: unknown) => error as BacklinksError,
    )
    expect(conflict).toMatchObject({ code: 'BACKLINKS_CONFLICT' })
    expect(conflict.retryAfterSeconds).toBe(77)

    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 502 }))
    await expect(provider.listBatches()).rejects.toThrow(expect.objectContaining({ code: 'BACKLINKS_API_ERROR' }))
  })

  it('wraps transport and timeout failures', async () => {
    const provider = new SupermanagerBatchSource(resolved())

    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    await expect(provider.listBatches()).rejects.toThrow(expect.objectContaining({ code: 'BACKLINKS_TRANSPORT' }))

    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>{  reject(new DOMException('aborted', 'AbortError')) })
      }))
    await expect(provider.listBatches()).rejects.toThrow(expect.objectContaining({ code: 'BACKLINKS_TIMEOUT' }))
  })

  it('rejects an already-aborted signal without calling the network', async () => {
    const provider = new SupermanagerBatchSource(resolved())
    const aborted = new AbortController()
    aborted.abort()
    await expect(provider.listBatches(aborted.signal))
      .rejects.toThrow(expect.objectContaining({ code: 'BACKLINKS_ABORTED' }))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('surfaces outer cancellation during a request', async () => {
    const provider = new SupermanagerBatchSource(resolved())
    const outer = new AbortController()
    fetchMock.mockImplementationOnce(() => new Promise((_resolve, reject) => {
      setTimeout(() => {
        outer.abort()
        reject(new DOMException('aborted', 'AbortError'))
      }, 1)
    }))
    await expect(provider.listBatches(outer.signal))
      .rejects.toThrow(expect.objectContaining({ code: 'BACKLINKS_ABORTED' }))
  })
})

describe('backlinks-supermanager plugin apply', () => {
  it('registers the provider with defaults and env token fallback', () => {
    const registerBatchSourceProvider = vi.fn()
    const defaulted = Config({ baseUrl: 'http://127.0.0.1:3000' }) as ResolvedSupermanagerConfig & { token?: string }
    expect(defaulted.requestTimeoutMs).toBe(15_000)

    process.env.SUPERMANAGER_TOKEN = 'smag_env'
    try {
      apply({
        backlinks: { registerBatchSourceProvider },
        get: () => undefined,
        inject: () => {},
        effect: () => () => {},
      } as never, defaulted)
    } finally {
      delete process.env.SUPERMANAGER_TOKEN
    }
    const registered = registerBatchSourceProvider.mock.calls[0]?.[0] as unknown as {
      id: string
      config: { token: string }
    }
    expect(registered.id).toBe('supermanager')
    expect(registered.config.token).toBe('smag_env')
  })

  it('rejects a non-http baseUrl and non-positive timeout', () => {
    const ctx = { backlinks: { registerBatchSourceProvider: vi.fn() }, get: () => undefined }
    expect(() =>{  apply(ctx as never, { baseUrl: 'ftp://x' }) }).toThrow(/baseUrl/u)
    expect(() =>{  apply(ctx as never, { baseUrl: 'http://x', requestTimeoutMs: -1 }) }).toThrow(/requestTimeoutMs/u)
  })
})
