/**
 * Integration: the real seam (`dsh-backlinks`) + the model tool (`dsh-tool-backlinks`) + scripted providers,
 * exercised through `ctx.tools.execute()` — nothing bypasses the tool registry.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import BacklinksRuntime from '@deepseek-ai/dsh-backlinks'
import type {
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

let ctx: Context
let receivedResults: Array<{ itemId: number; result: BacklinkItemResult }> = []
let disposeMailbox: () => void

beforeEach(async () => {
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
      plannedAt: 't', counts: { pending: 2, executed: 0, skipped: 0, failed: 0, total: 2 },
    }],
    getBatch: async id => ({
      batch: {
        id, name: 'PB-1', websiteId: 82, websiteName: 'site', websiteHost: 'site.test',
        plannedAt: 't', counts: { pending: 2, executed: 0, skipped: 0, failed: 0, total: 2 },
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
    heartbeat: async leaseId => ({ leaseId, leaseExpiresAt: 't2' }),
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
