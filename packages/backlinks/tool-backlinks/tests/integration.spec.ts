/**
 * Integration: the real seam (`dsh-backlinks`) + the model tool (`dsh-tool-backlinks`) + scripted providers,
 * exercised through `ctx.tools.execute()` — nothing bypasses the tool registry.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import BacklinksRuntime from '@deepseek-ai/dsh-backlinks'
import type {
  BacklinkBatchDetail,
  BacklinkItemResult,
  MailPollOptions,
  VerificationMail,
} from '@deepseek-ai/dsh-backlinks'
import * as ToolBacklinks from '@deepseek-ai/dsh-tool-backlinks'

const testToolSignal = new AbortController().signal

const mail: VerificationMail = {
  subject: 'Verify',
  from: 'noreply@dir.test',
  text: 'code 123456 https://dir.test/verify',
  code: '123456',
  link: 'https://dir.test/verify',
  receivedAt: 't',
}

let transformDetail: (detail: BacklinkBatchDetail) => BacklinkBatchDetail
let heartbeatCount = 0
let heartbeatEffect: () => Promise<void>
let ctx: Context
let receivedResults: Array<{ itemId: number; result: BacklinkItemResult }> = []
let disposeMailbox: () => void

beforeEach(async () => {
  transformDetail = detail => detail
  heartbeatCount = 0
  heartbeatEffect = async () => {}
  receivedResults = []
  ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(BacklinksRuntime)
  ctx.backlinks.registerBatchSourceProvider({
    id: 'scripted',
    available: () => true,
    listBatches: async () => [{
      id: 176, name: 'PB-1', websiteId: 82, websiteName: 'site', websiteHost: 'site.test',
      plannedAt: 't', counts: { pending: 2, executed: 0, skipped: 0, failed: 0, total: 2 }, executing: false,
    }],
    getBatch: async id => transformDetail({
      batch: {
        id, name: 'PB-1', websiteId: 82, websiteName: 'site', websiteHost: 'site.test',
        plannedAt: 't', counts: { pending: 2, executed: 0, skipped: 0, failed: 0, total: 2 }, executing: false,
      },
      website: { id: 82, name: 'site', siteUrl: 'https://site.test', siteHost: 'site.test' },
      anchors: [{ id: 1, anchorText: 'Site', targetUrl: 'https://site.test/' }],
      items: [{ id: 1258, sourceId: 45, sourceName: 'dir', sourceUrl: 'https://dir.test', sourceHost: 'dir.test',
        submitUrl: 'https://dir.test/submit', sourceNotes: null, category: null, tags: [], paymentType: 'free',
        linkType: 'dofollow', status: 'pending', failureMode: null, failureReason: null, publishedUrl: null,
        publishStatus: null, plannedAt: 't' }],
    }),
    claim: async (_batchId, itemIds) => ({
      leaseId: 900, leaseExpiresAt: 't1',
      items: itemIds === undefined ? [] : [{ id: itemIds[0] ?? 0, sourceId: 45, sourceName: 'dir',
        sourceUrl: 'https://dir.test', sourceHost: 'dir.test', submitUrl: null, sourceNotes: null,
        category: null, tags: [], paymentType: 'free', linkType: 'dofollow', status: 'pending',
        failureMode: null, failureReason: null, publishedUrl: null, publishStatus: null, plannedAt: 't' }],
    }),
    heartbeat: async (leaseId) => { await heartbeatEffect(); heartbeatCount++; return { leaseId, leaseExpiresAt: 't2' } },
    release: async () => {},
    reportItemResult: async (itemId, result) => {
      receivedResults.push({ itemId, result })
      return { itemStatus: 'executed', publishRecordId: 917 }
    },
    addBadge: async websiteId => ({ backlinkId: 643, callbackTriggered: websiteId > 50 }),
    tagSource: async (sourceId, names) => ({ sourceId, attached: names.map((name, i) => ({ id: 90 + i, name, created: false })) }),
  })
  disposeMailbox = ctx.backlinks.registerMailboxProvider({
    id: 'scripted',
    available: () => true,
    createMailbox: async input => ({ email: `${input.localPart}@${input.domain}` }),
    pollMail: async (_address, options: MailPollOptions) => {
      if (options.subjectContains === 'none') return null
      if (options.subjectContains === 'blank') return { ...mail, subject: '' }
      return mail
    },
  })
  await ctx.plugin(ToolBacklinks, { timeoutMs: 5_000 })
})

afterEach(async () => {
  await ctx.fiber.dispose()
  vi.useRealTimers()
})

let counter = 0
function call(args: unknown): Promise<ToolExecutionResult> {
  return ctx.tools.execute({
    signal: testToolSignal,
    callId: CallId(`call-${++counter}`),
    name: 'backlinks',
    arguments: args,
  })
}

describe('backlinks tool integration over the real seam', () => {
  it('claims an explicitly selected item before deduplicating its source', async () => {
    transformDetail = detail => ({ ...detail, items: [detail.items[0]!, { ...detail.items[0]!, id: 1259 }] })
    expect((await call({ action: 'batch_claim', batchId: 176, itemIds: [1259] })).value)
      .toMatchObject({ data: { itemIds: [1259] } })
  })

  it('keeps pending-only pages and claims inside the confirmed scope', async () => {
    transformDetail = detail => ({ ...detail, items: [
      { ...detail.items[0]!, id: 1, sourceId: 1, status: 'failed', failureMode: 'retryable' },
      { ...detail.items[0]!, id: 2, sourceId: 1 },
      { ...detail.items[0]!, id: 3, sourceId: 3 },
      { ...detail.items[0]!, id: 4, sourceId: 4, status: 'failed', failureMode: 'manual_required' },
      { ...detail.items[0]!, id: 5, sourceId: 5, publishStatus: 'live' },
    ] })
    expect((await call({ action: 'batch_get', batchId: 176 })).value)
      .toMatchObject({ data: { scope: 'all', nextItemIds: [1, 3] } })
    expect((await call({ action: 'batch_get', batchId: 176, scope: 'pending' })).value)
      .toMatchObject({ data: { scope: 'pending', eligibleCount: 2, nextItemIds: [2, 3] } })
    expect((await call({ action: 'batch_get', batchId: 176, scope: 'retryable' })).value)
      .toMatchObject({ data: { eligibleCount: 1, nextItemIds: [1] } })
    expect((await call({ action: 'batch_get', batchId: 176, scope: 'pending', view: 'items', afterItemId: 2 })).value)
      .toMatchObject({ data: { items: [{ id: 3 }], nextAfterItemId: null } })
    expect((await call({ action: 'batch_claim', batchId: 176, scope: 'pending', itemIds: [1] })).isError).toBe(true)
    expect((await call({ action: 'batch_claim', batchId: 176, scope: 'pending', itemIds: [2] })).value)
      .toMatchObject({ data: { itemIds: [2] } })
    expect((await call({ action: 'batch_get', batchId: 176, scope: 'retryable' })).value)
      .toMatchObject({ data: { eligibleCount: 0, nextItemIds: [] } })
    expect((await call({ action: 'batch_get', batchId: 176, scope: 'pending', view: 'items', itemIds: [5] })).isError).toBe(false)
    for (const action of ['batch_get', 'batch_claim']) {
      expect((await call({ action, batchId: 176, scope: 'unknown' })).isError).toBe(true)
    }
  })

  it('pages a 725-item batch, excludes published sources, and claims each source once', async () => {
    transformDetail = detail => ({ ...detail, items: Array.from({ length: 725 }, (_, index) => ({
      ...detail.items[0]!, id: index + 1, sourceId: index + 1,
      ...index === 0 ? { publishStatus: 'submitted' as const } : {},
      ...index === 1 ? { sourceId: 1 } : {},
    })) })
    const summary = await call({ action: 'batch_get', batchId: 176 })
    expect(summary.value).toMatchObject({ data: { eligibleCount: 723, nextItemIds: [3, 4, 5, 6, 7, 8] } })
    expect(JSON.stringify(summary.value).length).toBeLessThan(1000)
    const page = await call({ action: 'batch_get', batchId: 176, view: 'items', afterItemId: 8 })
    expect(page.value).toMatchObject({
      data: { items: [{ id: 9 }, { id: 10 }, { id: 11 }, { id: 12 }, { id: 13 }, { id: 14 }], nextAfterItemId: 14 },
    })
    expect((await call({ action: 'batch_claim', batchId: 176, itemIds: [2] })).isError).toBe(true)
    expect((await call({ action: 'batch_claim', batchId: 176, itemIds: [3] })).value)
      .toMatchObject({ data: { itemIds: [3] } })
    expect((await call({ action: 'batch_claim', batchId: 176, itemIds: [3] })).isError).toBe(true)
    expect((await call({ action: 'batch_get', batchId: 176, itemIds: [3], view: 'items' })).isError).toBe(false)
    for (const itemIds of [[], [0], ['3'], [1, 2, 3, 4, 5, 6, 7]]) {
      expect((await call({ action: 'batch_claim', batchId: 176, itemIds })).isError).toBe(true)
    }
  })

  it('rejects oversized UTF-8 views without dropping item fields', async () => {
    transformDetail = detail => ({ ...detail, items: [{ ...detail.items[0]!, sourceNotes: '证'.repeat(6000) }] })
    expect((await call({ action: 'batch_get', batchId: 176 })).isError).toBe(false)
    expect((await call({ action: 'batch_get', batchId: 176, view: 'items' })).isError).toBe(true)
    expect((await call({ action: 'batch_get', batchId: 176, view: 'all' })).isError).toBe(false)
  })

  it('renews with a runtime timer and quiesces before release or disposal', async () => {
    vi.useFakeTimers()
    await call({ action: 'batch_claim', batchId: 176, itemIds: [1258] })
    await vi.advanceTimersByTimeAsync(60_001)
    expect(heartbeatCount).toBe(1)
    await call({ action: 'lease_release', leaseId: 900 })
    await vi.advanceTimersByTimeAsync(180_000)
    expect(heartbeatCount).toBe(1)
  })

  it('waits for an in-flight heartbeat before releasing the lease', async () => {
    vi.useFakeTimers()
    const heartbeat = Promise.withResolvers<undefined>()
    heartbeatEffect = () => heartbeat.promise
    await call({ action: 'batch_claim', batchId: 176, itemIds: [1258] })
    await vi.advanceTimersByTimeAsync(60_001)
    let released = false
    const release = call({ action: 'lease_release', leaseId: 900 }).then((result) => { released = true; return result })
    await vi.advanceTimersByTimeAsync(0)
    expect(released).toBe(false)
    heartbeat.resolve(undefined)
    expect((await release).isError).toBe(false)
    await vi.advanceTimersByTimeAsync(180_000)
    expect(heartbeatCount).toBe(1)
  })

  it('pins the duplicate-publish guard in its prompt section', async () => {
    const assembly = await ctx.systemPrompt.assemble()
    const section = assembly.sections.find(s => s.name === 'tool:backlinks')
    expect(section?.text).toContain('Verify before publishing')
    expect(section?.text).toContain('already published — never claim or re-submit it')
    expect(section?.text).toContain('report skipped with the reason')
    expect(section?.text).toContain('Never re-submit an item whose outcome is unknown')
  })

  it('lists batches through the resolved provider', async () => {
    const out = await call({ action: 'batch_list' })
    expect(out.isError).toBe(false)
    expect(out.value).toMatchObject({
      action: 'batch_list',
      summary: '1 batch(es)',
      data: { batches: [{ id: 176, name: 'PB-1' }] },
    })
  })

  it('details and claims batches through the resolved provider', async () => {
    const detail = await call({ action: 'batch_get', batchId: 176 })
    expect(detail.value).toMatchObject({ summary: 'PB-1: 1 item(s)', data: { batch: { id: 176 } } })

    const claim = await call({ action: 'batch_claim', batchId: 176, itemIds: [1258] })
    expect(claim.value).toMatchObject({ summary: 'lease 900 over 1 item(s)' })

    const badge = await call({ action: 'badge_add', websiteId: 82, name: 'P', html: '<b>P</b>', isActive: false })
    const badgeDefault = await call({ action: 'badge_add', websiteId: 82, name: 'P2', html: '<b>2</b>' })
    expect(badgeDefault.value).toMatchObject({
      summary: 'badge 643 created; site refresh callback fired — still curl the site page to confirm the badge is live',
    })
    expect(badge.value).toMatchObject({
      summary: 'badge 643 created; site refresh callback fired — still curl the site page to confirm the badge is live',
    })

    const tagged = await call({ action: 'source_tags', sourceId: 156, tags: ['可复用', ' 免徽章 '] })
    expect(tagged.value).toMatchObject({
      summary: 'tags 可复用, 免徽章 attached to source 156',
    })

    const badgeNoCallback = await call({ action: 'badge_add', websiteId: 50, name: 'P3', html: '<b>3</b>' })
    expect(badgeNoCallback.value).toMatchObject({
      summary: 'badge 643 created; site refresh callback did NOT fire — curl the website footer refresh URL, then verify the badge on the live page',
    })
  })

  it('heartbeats, reports a live result, and releases the lease', async () => {
    const heartbeat = await call({ action: 'lease_heartbeat', leaseId: 900 })
    expect(heartbeat.value).toMatchObject({ summary: 'lease 900 renewed' })

    const result = await call({
      action: 'item_result', itemId: 1258, status: 'live',
      publicUrl: 'https://dir.test/l', anchorText: 'Site', targetUrl: 'https://site.test/', evidence: 'verified',
    })
    expect(result.value).toMatchObject({ summary: 'item executed' })
    expect(receivedResults).toEqual([{
      itemId: 1258,
      result: {
        status: 'live', publicUrl: 'https://dir.test/l', anchorText: 'Site',
        targetUrl: 'https://site.test/', evidence: 'verified',
      },
    }])

    const manual = await call({
      action: 'item_result', itemId: 1261, status: 'failed', failureMode: 'manual_required', failureReason: 'captcha',
    })
    expect(manual.value).toMatchObject({ summary: 'item executed' })

    const retryable = await call({
      action: 'item_result', itemId: 1259, status: 'failed', failureMode: 'retryable', failureReason: 'timeout',
    })
    expect(retryable.value).toMatchObject({ summary: 'item executed' })

    const skipped = await call({ action: 'item_result', itemId: 1260, status: 'skipped', skipReason: 'gone' })
    expect(skipped.value).toMatchObject({ summary: 'item executed' })

    const release = await call({ action: 'lease_release', leaseId: 900 })
    expect(release.value).toMatchObject({ summary: 'lease 900 released' })
  })

  it('creates a mailbox and waits for verification mail', async () => {
    const created = await call({ action: 'mailbox_create', localPart: 'agent7', domain: 'mail.test' })
    expect(created.value).toMatchObject({ summary: 'agent7@mail.test' })

    const waited = await call({
      action: 'mail_wait', mailEmail: 'agent7@mail.test', subjectContains: 'verify', waitTimeoutMs: 500,
    })
    expect(waited.value).toMatchObject({
      summary: 'Verify',
      data: { code: '123456', link: 'https://dir.test/verify' },
    })

    const waitedWithSender = await call({
      action: 'mail_wait', mailEmail: 'agent7@mail.test', fromContains: 'dir.test', waitTimeoutMs: 500,
    })
    expect(waitedWithSender.value).toMatchObject({ summary: 'Verify' })

    const defaultWait = await call({ action: 'mail_wait', mailEmail: 'agent7@mail.test' })
    expect(defaultWait.value).toMatchObject({ summary: 'Verify' })

    const blankSubject = await call({
      action: 'mail_wait', mailEmail: 'agent7@mail.test', subjectContains: 'blank', waitTimeoutMs: 500,
    })
    expect(blankSubject.value).toMatchObject({ summary: 'mail received' })
  })

  it('reports a mail timeout as a null result, not an error', async () => {
    const out = await call({
      action: 'mail_wait', mailEmail: 'x@y.test', subjectContains: 'none', waitTimeoutMs: 10,
    })
    expect(out.isError).toBe(false)
    expect(out.value).toMatchObject({ summary: 'no matching mail before timeout', data: { timedOut: true } })
  })

  it('returns structured errors for invalid arguments and missing providers', async () => {
    const invalid = await call({ action: 'batch_claim' })
    expect(invalid.isError).toBe(true)

    const badMailbox = await call({ action: 'mailbox_create', localPart: 'bad name!', domain: 'x.test' })
    expect(badMailbox.isError).toBe(true)

    const badAction = await call({ action: 'hover_everything' })
    expect(badAction.isError).toBe(true)
    const badActionText = badAction.content.map(block => block.type === 'text' ? block.text : '').join('')
    expect(badActionText).toMatch(/action must be one of/u)

    const badWait = await call({ action: 'mail_wait', mailEmail: 'a@b.test', waitTimeoutMs: -5 })
    expect(badWait.isError).toBe(true)


    disposeMailbox()
    const noProvider = await call({ action: 'mailbox_create', localPart: 'a', domain: 'b.test' })
    expect(noProvider.isError).toBe(true)
    const text = noProvider.content.map(block => block.type === 'text' ? block.text : '').join('')
    expect(text).toMatch(/no usable backlinks provider/u)
  })
})
