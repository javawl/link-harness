import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { createUserMessage, CallId, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { type SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import BrowserRuntime, { BrowserError, type BrowserCommand } from '@deepseek-ai/dsh-browser'
import * as ToolBrowser from '@deepseek-ai/dsh-tool-browser'
import BacklinksRuntime, { BacklinksError, type BacklinkBatchDetail, type BacklinkBatchItem, type BacklinkItemResult } from '@deepseek-ai/dsh-backlinks'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import * as Spawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import { assertObjectJsonSchema, defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import { MockAdapter, maxTokensResponse, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import * as ToolBacklinks from '../src/index.ts'

interface Prompt {
  item: BacklinkBatchItem
  leaseId: number
  page: string
}

const contexts: Context[] = []
afterEach(async () => { await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose())) })

function item(id: number, host = `directory-${id}.test`): BacklinkBatchItem {
  return { id, sourceId: id, sourceName: host, sourceHost: host, sourceUrl: `https://${host}/`,
    submitUrl: null, sourceNotes: null, category: 'directory', tags: [], paymentType: 'free', linkType: 'dofollow',
    status: 'pending', failureMode: null, failureReason: null, publishedUrl: null, publishStatus: null, plannedAt: 't' }
}

async function setup(options: {
  seed?: readonly SessionEvent[]
  parentDriven?: boolean
  readBatch?: () => void
  workBudget?: Spawn.Config['workBudget']
  items?: BacklinkBatchItem[]
  batchItems?: Record<number, BacklinkBatchItem[]>
  batchWebsites?: Record<number, number>
  extraBrowser?: boolean
  bindings?: Record<string, string>
  anchors?: BacklinkBatchDetail['anchors']
  capacity?: number
  reserve?: (command: BrowserCommand, browserId: string) => Promise<void>
  navigate?: (command: BrowserCommand, signal?: AbortSignal) => Promise<void>
  linkHref?: string
  claimedItems?: (items: BacklinkBatchItem[]) => BacklinkBatchItem[]
  parentDepth?: number
  report?: (result: BacklinkItemResult) => void
  script?: (prompt: Prompt, step: number) => StreamChunk[]
} = {}) {
  const ctx = new Context()
  contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(SubagentRuntime)
  await ctx.plugin(Spawn, { providerName: 'spawn', ...options.workBudget === undefined ? {} : { workBudget: options.workBudget } })
  await ctx.plugin(BrowserRuntime)
  await ctx.plugin(BacklinksRuntime, { websiteBrowsers: options.bindings ?? {} })
  const pages = new Map<string, string>([['operator-page', 'https://operator.test/unfinished']])
  const received: BrowserCommand[] = []
  const shellCalls: unknown[] = []
  const results: { itemId: number; result: BacklinkItemResult }[] = []
  let items = options.batchItems === undefined ? options.items ?? [item(1)] : Object.values(options.batchItems).flat()
  let claims = 0
  let releases = 0
  let heartbeats = 0
  const detail = (batchId = 176): BacklinkBatchDetail => ({
    batch: { id: batchId, name: 'Publish batch', websiteId: 82, websiteName: 'Site', websiteHost: 'site.test', plannedAt: 't',
      counts: { pending: items.filter(item => item.status === 'pending').length, executed: results.filter(row => row.result.status === 'live' || row.result.status === 'submitted').length,
        failed: results.filter(row => row.result.status === 'failed').length, skipped: results.filter(row => row.result.status === 'skipped').length, total: items.length }, executing: claims > releases },
    website: { id: options.batchWebsites?.[batchId] ?? 82, name: 'Site', siteUrl: 'https://site.test/', siteHost: 'site.test' },
    anchors: options.anchors ?? [{ id: 1, anchorText: 'Site', targetUrl: 'https://site.test/' }], items: options.batchItems === undefined ? items
      : items.filter(item => options.batchItems![batchId]?.some(value => value.id === item.id)),
  })
  ctx.backlinks.registerBatchSourceProvider({
    id: 'fixture', available: () => true,
    listBatches: async () => [detail().batch], getBatch: async (batchId) => { options.readBatch?.(); return detail(batchId) },
    claim: async (batchId, ids) => {
      claims++
      const selected = items.filter(item => ids?.includes(item.id))
      return { leaseId: batchId + 724, leaseExpiresAt: 'server-clock', items: options.claimedItems?.(selected) ?? selected }
    },
    heartbeat: async (leaseId) => { heartbeats++; return { leaseId, leaseExpiresAt: 'server-clock' } },
    release: async () => { releases++ },
    reportItemResult: async (itemId, result) => {
      results.push({ itemId, result })
      const itemStatus = result.status === 'live' || result.status === 'submitted' ? 'executed' : result.status
      items = items.map(item => item.id === itemId ? { ...item, status: itemStatus,
        ...result.status === 'failed' ? { failureMode: result.failureMode, failureReason: result.failureReason } : {},
        ...result.status === 'live' || result.status === 'submitted' ? { publishStatus: result.status, publishedUrl: result.publicUrl ?? null } : {},
      } : item)
      options.report?.(result)
      return { itemStatus, publishRecordId: itemStatus === 'executed' ? itemId : null }
    },
    addBadge: async () => { throw new Error('unexpected badge') },
    tagSource: async sourceId => ({ sourceId, attached: [] }),
  })
  const routed: { browserId: string; command: BrowserCommand }[] = []
  const browserPages = new Map<string, Map<string, string>>()
  for (const browserId of options.extraBrowser ? ['fixture', 'second'] : ['fixture']) {
    const ownedPages = browserId === 'fixture' ? pages : new Map<string, string>()
    browserPages.set(browserId, ownedPages)
    ctx.browser.registerProvider({ id: browserId, available: () => true, open: async () => ({
      act: async (command, signal) => {
        routed.push({ browserId, command })
        received.push(command)
        const page = command.page ?? 'operator-page'
        if (command.kind === 'newPage') {
          if (ownedPages.size >= (options.capacity ?? 6)) throw new BrowserError('page capacity occupied', 'BROWSER_PAGE_LIMIT')
          ownedPages.set(page, 'about:blank')
          await options.reserve?.(command, browserId)
        } else if (!ownedPages.has(page)) throw new BrowserError('missing page', 'BROWSER_ACTION_FAILED')
        if (command.kind === 'closePage') { ownedPages.delete(page); return { kind: 'acked' } }
        if (command.kind === 'navigate') {
          await options.navigate?.(command, signal)
          ownedPages.set(page, command.url)
        }
        if (command.kind === 'click' || command.kind === 'press' || command.kind === 'fill') return { kind: 'acked' }
        return { kind: 'page', page, url: ownedPages.get(page)!, title: 'Fixture', truncated: false,
          text: command.kind === 'snapshot' && command.format === 'links'
            ? JSON.stringify({ links: [{ text: 'Site', href: options.linkHref ?? 'https://site.test/' }] }) : 'Your submission is awaiting review.' }
      },
      close: async () => {},
    }) })
  }
  await ctx.plugin(ToolBrowser, { maxOutputChars: 1000, timeoutMs: 5000 })
  ctx.tools.register(defineContentToolFixture({ name: 'bash', description: 'Unused external shell', parameters: {}, execute: async (args) => {
    shellCalls.push(args)
    throw new Error('unexpected shell')
  } }))
  await ctx.plugin(ToolBacklinks, { leaseHeartbeatMs: 10, timeoutMs: 5000, publisher: {
    provider: 'spawn', concurrency: 3, maxTokens: 128, persona: 'FIXED_PUBLICATION_DISCIPLINE',
  } })
  const steps = new Map<number, number>()
  const starts: number[] = []
  const respond = (request: GenerateOptions): StreamChunk[] => {
    const block = request.messages.flatMap(message => message.content).find(block => block.type === 'text' && block.text.startsWith('{"item":'))
    if (block?.type !== 'text') {
      if (!options.parentDriven) throw new Error('missing assigned item prompt')
      return request.messages.some(message => message.content.some(block => block.type === 'tool-result'))
        ? textResponse('Parent finished.')
        : toolCallResponse('parent-publish', 'backlink_publish', { batchId: 176, scope: 'all', mode: 'all' })
    }
    const prompt = JSON.parse(block.text) as Prompt
    const step = steps.get(prompt.item.id) ?? 0
    steps.set(prompt.item.id, step + 1)
    if (step === 0) starts.push(prompt.item.id)
    if (options.script !== undefined) return options.script(prompt, step)
    if (step === 0) return toolCallResponse(`navigate-${prompt.item.id}`, 'browser', { action: 'navigate', url: prompt.item.sourceUrl })
    if (step === 1) return toolCallResponse(`save-${prompt.item.id}`, 'backlinks', {
      action: 'item_result', itemId: prompt.item.id, leaseId: prompt.leaseId, status: 'skipped', skipReason: 'Fixture is ineligible.',
    })
    return textResponse('Item recorded.')
  }
  const adapter = new MockAdapter(Array.from({ length: 100 }, () => respond))
  ctx.llm.registerAdapter(['mock'], adapter)
  const parent = await ctx.agents.create({ sessionId: SessionId(`publisher-${contexts.length}`),
    ...options.parentDepth === undefined ? {} : { meta: { delegationDepth: options.parentDepth } },
    ...options.seed === undefined ? {} : { seed: options.seed },
    agentOptions: { provider: 'mock', model: 'mock' } })
  const publish = (signal = new AbortController().signal) => ctx.tools.execute({
    name: 'backlink_publish', callId: CallId('publish'), agent: parent.agent, signal,
    arguments: { batchId: 176, scope: 'all', mode: 'all' },
  })
  return { ctx, parent, publish, pages, received, results, starts, adapter, routed, browserPages, shellCalls,
    counts: () => ({ claims, releases, heartbeats }) }
}

describe('foreground publication through the native child and tool executors', () => {
  it('declares publication fields inside the child model tool schema properties', async () => {
    const made = await setup()
    await made.publish()
    const tools = made.adapter.requests[0]!.tools!
    for (const tool of tools) expect(() => { assertObjectJsonSchema(tool.parameters) }).not.toThrow()
    expect(tools.find(tool => tool.name === 'browser')?.parameters).toMatchObject({
      type: 'object', properties: { action: { type: 'string' }, submission: { type: 'boolean' } },
    })
    expect(tools.find(tool => tool.name === 'backlinks')?.parameters).toMatchObject({
      type: 'object', properties: {
        action: { type: 'string' }, receipt: { type: 'string' }, verificationSelector: { type: 'string' },
      },
    })
    expect(made.ctx.tools.get('browser')!.parameters).not.toHaveProperty('properties.submission')
    expect(made.ctx.tools.get('backlinks')!.parameters).not.toHaveProperty('properties.receipt')
  })

  it('rejects a child shell call without executing the registered global tool', async () => {
    const made = await setup({ script: (prompt, step) => {
      if (step === 0) return toolCallResponse('shell', 'bash', { command: 'osascript -e \'tell application "Google Chrome" to activate\'' })
      if (step === 1) return toolCallResponse('save', 'backlinks', {
        action: 'item_result', itemId: prompt.item.id, leaseId: prompt.leaseId,
        status: 'skipped', skipReason: 'No browser submission.',
      })
      return textResponse('Done.')
    } })
    await made.publish()
    expect(made.adapter.requests[0]!.tools!.map(tool => tool.name).sort()).toEqual(['backlinks', 'browser'])
    expect(made.shellCalls).toEqual([])
    expect(JSON.stringify(made.adapter.requests)).toContain('unknown tool')
    expect(made.results).toMatchObject([{ itemId: 1, result: { status: 'skipped' } }])
  })

  it('rejects string submission flags while allowing navigation and one declared publication', async () => {
    const made = await setup({ script: (prompt, step) => {
      if (step === 0) return toolCallResponse('string-false', 'browser', { action: 'click', selector: 'button', submission: 'False' })
      if (step === 1) return toolCallResponse('string-true', 'browser', { action: 'press', key: 'Enter', submission: 'True' })
      if (step === 2) return toolCallResponse('navigate', 'browser', { action: 'click', selector: 'button', submission: false })
      if (step === 3) return toolCallResponse('submit', 'browser', { action: 'press', key: 'Enter', submission: true })
      if (step === 4) return toolCallResponse('save', 'backlinks', {
        action: 'item_result', itemId: prompt.item.id, leaseId: prompt.leaseId,
        status: 'submitted', anchorText: 'Site', targetUrl: 'https://site.test/', evidence: 'Awaiting review.',
        receipt: 'Your submission is awaiting review.',
      })
      return textResponse('Done.')
    } })
    await made.publish()
    expect(made.received.filter(command => command.kind === 'click' || command.kind === 'press').map(command => command.kind))
      .toEqual(['click', 'press'])
    expect(made.results).toMatchObject([{ itemId: 1, result: { status: 'submitted' } }])
  })

  it('forwards a judged category on a successful result for an uncategorized item', async () => {
    const made = await setup({ items: [{ ...item(1), category: null }], script: (prompt, step) => {
      if (step === 0) return toolCallResponse('submit', 'browser', { action: 'press', key: 'Enter', submission: true })
      if (step === 1) return toolCallResponse('save', 'backlinks', {
        action: 'item_result', itemId: prompt.item.id, leaseId: prompt.leaseId,
        status: 'submitted', anchorText: 'Site', targetUrl: 'https://site.test/', evidence: 'Awaiting review.',
        receipt: 'Your submission is awaiting review.', category: '论坛',
      })
      return textResponse('Done.')
    } })
    await made.publish()
    expect(made.results).toMatchObject([{ itemId: 1, result: { status: 'submitted', category: '论坛' } }])
  })

  it('rejects a category on an already-categorized item and accepts the retry without it', async () => {
    const made = await setup({ script: (prompt, step) => {
      if (step === 0) return toolCallResponse('submit', 'browser', { action: 'press', key: 'Enter', submission: true })
      if (step === 1) return toolCallResponse('save-category', 'backlinks', {
        action: 'item_result', itemId: prompt.item.id, leaseId: prompt.leaseId,
        status: 'submitted', anchorText: 'Site', targetUrl: 'https://site.test/', evidence: 'Awaiting review.',
        receipt: 'Your submission is awaiting review.', category: '论坛',
      })
      if (step === 2) return toolCallResponse('save', 'backlinks', {
        action: 'item_result', itemId: prompt.item.id, leaseId: prompt.leaseId,
        status: 'submitted', anchorText: 'Site', targetUrl: 'https://site.test/', evidence: 'Awaiting review.',
        receipt: 'Your submission is awaiting review.',
      })
      return textResponse('Done.')
    } })
    await made.publish()
    expect(JSON.stringify(made.adapter.requests)).toContain('category is only reported while the assigned item has no category')
    expect(made.results).toMatchObject([{ itemId: 1, result: { status: 'submitted' } }])
    expect(made.results[0]!.result).not.toHaveProperty('category')
  })

  it('leaves a batch untouched when its website has no publication anchors', async () => {
    const made = await setup({ anchors: [] })
    const result = await made.publish()
    expect(result.value).toMatchObject({ attempted: 0, remaining: 1, counts: {} })
    expect(result.value).toHaveProperty('stoppedReason', expect.stringContaining('Website 82 needs a name and an absolute http(s) website URL'))
    expect(made.received).toEqual([])
    expect(made.counts()).toMatchObject({ claims: 0, releases: 0 })
    expect(made.adapter.requests).toHaveLength(0)
    expect(made.results).toEqual([])
  })

  it('reuses capacity after recorded retryable failures before any final submission', async () => {
    const made = await setup({ items: [item(1), item(2), item(3)], capacity: 2,
      script: (prompt, step) => step === 0
        ? toolCallResponse(`failed-${prompt.item.id}`, 'backlinks', { action: 'item_result', itemId: prompt.item.id,
          leaseId: prompt.leaseId, status: 'failed', failureMode: 'retryable', failureReason: 'Site is temporarily unavailable.' })
        : textResponse('Failure recorded without submitting.'),
    })
    const result = await made.publish()
    expect(result.value).toMatchObject({ attempted: 3, remaining: 0, counts: { failed: 3 }, stoppedReason: null })
    expect(made.starts).toEqual([1, 2, 3])
    expect([...made.pages.keys()]).toEqual(['operator-page'])
  })

  it('rejects window activation and retains a manual-required page while other items finish', async () => {
    const made = await setup({ items: [item(1), item(2)], script: (prompt, step) => {
      if (step === 0) return toolCallResponse('navigate', 'browser', { action: 'navigate', url: prompt.item.sourceUrl })
      if (prompt.item.id === 1) {
        if (step === 1 || step === 3) return toolCallResponse(`focus-${step}`, 'browser', { action: 'bringToFront' })
        if (step === 2) return toolCallResponse('manual', 'backlinks', {
          action: 'item_result', itemId: prompt.item.id, leaseId: prompt.leaseId,
          status: 'failed', failureMode: 'manual_required', failureReason: 'Complete login manually in the retained page.',
        })
      } else if (step === 1) return toolCallResponse('skip', 'backlinks', {
        action: 'item_result', itemId: prompt.item.id, leaseId: prompt.leaseId,
        status: 'skipped', skipReason: 'Listing already exists.',
      })
      return textResponse('Results saved; item 1 needs manual login.')
    } })
    const result = await made.publish()
    expect(result.value).toMatchObject({ attempted: 2, remaining: 0, counts: { failed: 1, skipped: 1 }, stoppedReason: null })
    expect(result.value).toMatchObject({ manualRequired: [{
      itemId: 1, browserId: 'fixture',
      reason: 'Complete login manually in the retained page.',
    }] })
    expect(result.value).toHaveProperty('manualRequired.0.page', [...made.pages.keys()].find(page => page.endsWith('-1')))
    expect(JSON.stringify(result.content)).toContain('Complete login manually in the retained page.')
    expect(made.received.filter(command => command.kind === 'bringToFront')).toEqual([])
    expect([...made.pages.values()]).toEqual(['https://operator.test/unfinished', 'https://directory-1.test/'])
    expect(made.results).toContainEqual({ itemId: 1, result: {
      status: 'failed', failureMode: 'manual_required', failureReason: 'Complete login manually in the retained page.',
    } })
    expect(JSON.stringify(made.adapter.requests)).toContain('Publication cannot activate browser windows.')
  })

  it('rechecks admission after a page reservation races a model failure', async () => {
    const reserving = Promise.withResolvers<undefined>()
    const failureSaved = Promise.withResolvers<undefined>()
    const made = await setup({ items: [item(1), item(2), item(3)],
      reserve: async (command) => {
        if (command.page?.endsWith('-2')) { reserving.resolve(undefined); await failureSaved.promise }
      },
      navigate: async () => { await reserving.promise },
      report: () => { failureSaved.resolve(undefined) },
      script: (prompt, step) => step === 0
        ? toolCallResponse('navigate', 'browser', { action: 'navigate', url: prompt.item.sourceUrl })
        : [{ type: 'finish', reason: { kind: 'error', failure: { code: 'QUOTA', message: 'quota exhausted' } } }],
    })
    const result = await made.publish()
    expect(result.value).toMatchObject({ attempted: 1, remaining: 2 })
    expect(made.starts).toEqual([1])
    expect(made.received.filter(command => command.kind === 'newPage')).toHaveLength(2)
    expect([...made.pages.keys()]).toEqual(['operator-page'])
  })

  it('drains another active item after a model failure without starting queued items', async () => {
    const bothActive = Promise.withResolvers<undefined>()
    const releaseActive = Promise.withResolvers<undefined>()
    const failedSaved = Promise.withResolvers<undefined>()
    const made = await setup({ items: [item(1), item(2), item(3), item(4)], capacity: 3,
      navigate: async (command) => {
        if (command.page?.endsWith('-1')) await bothActive.promise
        if (command.page?.endsWith('-2')) { bothActive.resolve(undefined); await releaseActive.promise }
      },
      report: (result) => { if (result.status === 'failed') failedSaved.resolve(undefined) },
      script: (prompt, step) => {
        if (step === 0) return toolCallResponse('navigate', 'browser', { action: 'navigate', url: prompt.item.sourceUrl })
        if (prompt.item.id === 1) return [{ type: 'finish', reason: { kind: 'error', failure: { code: 'QUOTA', message: 'quota exhausted' } } }]
        if (step === 1) return toolCallResponse('saved', 'backlinks', { action: 'item_result', itemId: prompt.item.id,
          leaseId: prompt.leaseId, status: 'skipped', skipReason: 'No submission is available.' })
        return textResponse('Recorded.')
      },
    })
    const publishing = made.publish()
    try {
      await failedSaved.promise
      expect(made.starts).toEqual([1, 2])
      expect(made.counts().releases).toBe(0)
    } finally {
      releaseActive.resolve(undefined)
    }
    const result = await publishing
    expect(result.value).toMatchObject({ attempted: 2, remaining: 2, counts: { failed: 1, skipped: 1 } })
    expect(result.value).toHaveProperty('stoppedReason', expect.stringContaining('QUOTA'))
    expect(made.starts).toEqual([1, 2])
    expect(made.counts().releases).toBe(1)
    expect([...made.pages.keys()]).toEqual(['operator-page'])
  })

  it.each(['QUOTA', 'AUTH', 'RATE_LIMIT'])('stops admitting items after %s and drains the claimed lease', async (code) => {
    const made = await setup({ items: [item(1), item(2), item(3)], capacity: 2,
      script: () => [{ type: 'finish', reason: { kind: 'error', failure: { code, message: 'private provider response' } } }],
    })
    const result = await made.publish()
    expect(result.value).toMatchObject({ attempted: 1, remaining: 2, counts: { failed: 1 } })
    expect(result.value).toHaveProperty('stoppedReason', expect.stringContaining(code))
    expect(made.starts).toEqual([1])
    expect(made.results).toMatchObject([{ itemId: 1, result: { status: 'failed', failureMode: 'retryable' } }])
    expect(made.results[0]?.result).toHaveProperty('failureReason', expect.stringContaining(code))
    expect((await made.ctx.backlinks.getBatch(176)).items.filter(item => item.status === 'pending').map(item => item.id)).toEqual([2, 3])
    expect(made.counts()).toMatchObject({ claims: 1, releases: 1 })
    expect([...made.pages.keys()]).toEqual(['operator-page'])
    expect(JSON.stringify(result.value)).not.toContain('private provider response')
  })

  it('skips an earlier unresolved attempt and processes the other sources', async () => {
    const made = await setup({ items: [item(1), item(2), item(3)] })
    await made.ctx.tools.execute({ name: 'backlinks', callId: CallId('prior-claim'), agent: made.parent.agent,
      signal: new AbortController().signal, arguments: { action: 'batch_claim', batchId: 176, scope: 'pending', itemIds: [1] },
    })
    await made.ctx.tools.execute({ name: 'backlinks', callId: CallId('prior-release'), agent: made.parent.agent,
      signal: new AbortController().signal, arguments: { action: 'lease_release', leaseId: 900 },
    })
    const result = await made.publish()
    expect(result.value).toMatchObject({ attempted: 2, remaining: 0, counts: { skipped: 2 }, unresolvedItemIds: [1], stoppedReason: null })
    expect(made.starts).toEqual([2, 3])
    expect(made.results.map(row => row.itemId)).toEqual([2, 3])
    expect((await made.ctx.backlinks.getBatch(176)).items[0]).toHaveProperty('status', 'pending')
    expect((await made.publish()).value).toMatchObject({ attempted: 0, remaining: 0, unresolvedItemIds: [1], stoppedReason: null })
    expect(made.counts()).toMatchObject({ claims: 2, releases: 2 })
  })

  it('stops a startup failure without marking unstarted items failed or requesting a model', async () => {
    const made = await setup({ parentDepth: 1 })
    const result = await made.publish()
    expect(result.value).toMatchObject({ attempted: 0, remaining: 1, counts: {} })
    expect(made.results).toEqual([])
    expect(made.adapter.requests).toHaveLength(0)
    expect([...made.pages.keys()]).toEqual(['operator-page'])
    expect(made.counts()).toMatchObject({ claims: 1, releases: 1 })
  })
  it('uses the authoritative claimed item payload for the child', async () => {
    const made = await setup({ claimedItems: items => items.map(item => ({ ...item, sourceUrl: 'https://claimed.test/' })) })
    await made.publish()
    expect(made.received.find(command => command.kind === 'navigate')).toMatchObject({ url: 'https://claimed.test/' })
  })

  it('cancels and drains a child, releases its lease, and leaves unstarted items pending', async () => {
    const started = Promise.withResolvers<undefined>()
    const controller = new AbortController()
    const made = await setup({ items: [item(1), item(2), item(3)], capacity: 2,
      navigate: async (_command, signal) => {
        started.resolve(undefined)
        await new Promise<void>((resolve) => {
          if (signal?.aborted) resolve()
          else signal?.addEventListener('abort', () => { resolve() }, { once: true })
        })
      },
    })
    const publishing = made.publish(controller.signal)
    await started.promise
    controller.abort('user stopped')
    await publishing
    expect(made.starts).toEqual([1])
    expect(made.results).toMatchObject([{ itemId: 1, result: { status: 'failed', failureMode: 'retryable' } }])
    expect(made.counts()).toMatchObject({ claims: 1, releases: 1 })
    expect([...made.pages.keys()]).toEqual(['operator-page'])
    const batch = await made.ctx.backlinks.getBatch(176)
    expect(batch.items.filter(item => item.status === 'pending').map(item => item.id)).toEqual([2, 3])
  })

  it.each(['https://site.test/', 'https://wrong.test/'])('checks the actual href %s before reporting live', async (linkHref) => {
    const made = await setup({ linkHref, script: (prompt, step) => {
      if (step === 0) return toolCallResponse('public-page', 'browser', { action: 'navigate', url: prompt.item.sourceUrl })
      if (step === 1) return toolCallResponse('submit', 'browser', { action: 'click', selector: 'role:button|Submit', submission: true })
      if (step === 2) return toolCallResponse('live-result', 'backlinks', { action: 'item_result', itemId: prompt.item.id, leaseId: prompt.leaseId,
        status: 'live', publicUrl: prompt.item.sourceUrl, anchorText: 'Site', targetUrl: 'https://site.test/', evidence: 'Visible Site link.' })
      return textResponse('Checked.')
    } })
    await made.publish()
    expect(made.results[0]?.result.status).toBe(linkHref === 'https://site.test/' ? 'live' : 'failed')
    expect(made.results).toHaveLength(1)
  })

  it('refills a free slot before the slowest child ends, serializes each host, and closes only owned pages', async () => {
    const slow = Promise.withResolvers<undefined>()
    const refilled = Promise.withResolvers<undefined>()
    const made = await setup({ items: [item(1), item(2), item(3), item(4), item(5, 'directory-1.test')],
      navigate: async (command) => {
        if (command.page?.endsWith('-1')) await slow.promise
        if (command.page?.endsWith('-4')) refilled.resolve(undefined)
      },
    })
    const publishing = made.publish()
    try {
      await refilled.promise
      expect(made.starts).toEqual(expect.arrayContaining([1, 2, 3, 4]))
      expect(made.starts).not.toContain(5)
    } finally {
      slow.resolve(undefined)
    }
    const result = await publishing
    expect(result.isError, JSON.stringify(result.content)).toBe(false)
    expect(result.value).toMatchObject({ attempted: 5, remaining: 0, counts: { skipped: 5 }, stoppedReason: null })
    expect(made.counts()).toMatchObject({ claims: 1, releases: 1 })
    expect([...made.pages]).toEqual([['operator-page', 'https://operator.test/unfinished']])
    expect(made.received.every(command => command.page !== undefined && command.page !== 'operator-page')).toBe(true)
    expect(made.adapter.requests.every(request => (request.system ?? '').split('FIXED_PUBLICATION_DISCIPLINE').length === 2)).toBe(true)
    expect(made.adapter.requests.every(request => !JSON.stringify(request.messages).includes('FIXED_PUBLICATION_DISCIPLINE'))).toBe(true)
    expect((await made.publish()).value).toMatchObject({ attempted: 0, remaining: 0 })
  })

  it('rejects other pages and other item ids at execution, while a missing page selects only the assigned tab', async () => {
    const made = await setup({ script: (prompt, step) => {
      if (step === 0) return toolCallResponse('foreign-page', 'browser', { action: 'closePage', page: 'operator-page' })
      if (step === 1) return toolCallResponse('foreign-item', 'backlinks', { action: 'item_result', itemId: 99, leaseId: prompt.leaseId, status: 'skipped', skipReason: 'wrong item' })
      if (step === 2) return toolCallResponse('own-snapshot', 'browser', { action: 'snapshot' })
      if (step === 3) return toolCallResponse('own-result', 'backlinks', { action: 'item_result', itemId: prompt.item.id, leaseId: prompt.leaseId, status: 'skipped', skipReason: 'ineligible' })
      return textResponse('Done.')
    } })
    expect((await made.publish()).isError).toBe(false)
    expect(made.results.map(row => row.itemId)).toEqual([1])
    expect(made.received.some(command => command.page === 'operator-page')).toBe(false)
    expect(JSON.stringify(made.adapter.requests)).toContain('Use only your assigned page')
    expect(JSON.stringify(made.adapter.requests)).toContain('assigned itemId and leaseId')
    expect([...made.pages.keys()]).toEqual(['operator-page'])
  })

  it('does not claim work or request a model when every browser slot is occupied', async () => {
    const made = await setup({ capacity: 1 })
    const result = await made.publish()
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result.content)).toContain('page capacity occupied')
    expect(made.counts()).toMatchObject({ claims: 0, releases: 0 })
    expect(made.adapter.requests).toHaveLength(0)
    expect(made.results).toEqual([])
    expect([...made.pages.keys()]).toEqual(['operator-page'])
  })

  it('preserves a dispatched submission without a receipt, rejects a second dispatch, and never makes it retryable', async () => {
    const made = await setup({ script: (prompt, step) => {
      if (step < 2) return toolCallResponse(`submit-${step}`, 'browser', { action: 'click', selector: 'role:button|Submit', submission: true })
      if (step === 2) return toolCallResponse('false-retry', 'backlinks', { action: 'item_result', itemId: prompt.item.id, leaseId: prompt.leaseId,
        status: 'failed', failureMode: 'retryable', failureReason: 'unknown result' })
      return textResponse('No receipt.')
    } })
    const result = await made.publish()
    expect(result.value).toMatchObject({ counts: { failed: 1 } })
    expect(made.received.filter(command => command.kind === 'click')).toHaveLength(1)
    expect(made.results).toMatchObject([{ itemId: 1, result: { status: 'failed', failureMode: 'manual_required' } }])
    expect(made.pages.size).toBe(2)
    expect(JSON.stringify(made.adapter.requests)).toContain('must be manual_required, never retryable')
  })

  it('checks the site receipt and reconciles a saved publication after its acknowledgement is lost', async () => {
    const made = await setup({ report: () => { throw new Error('response lost') }, script: (prompt, step) => {
      if (step === 0) return toolCallResponse('submit', 'browser', { action: 'click', selector: 'role:button|Submit', submission: true })
      if (step < 3) return toolCallResponse(`receipt-${step}`, 'backlinks', { action: 'item_result', itemId: prompt.item.id, leaseId: prompt.leaseId,
        status: 'submitted', anchorText: 'Site', targetUrl: 'https://site.test/', evidence: 'Pending review.',
        receipt: step === 1 ? 'This text is absent' : 'Your submission is awaiting review.' })
      return textResponse('Check the saved record.')
    } })
    const result = await made.publish()
    expect(result.value).toMatchObject({ counts: { submitted: 1 }, stoppedReason: null })
    expect(made.results).toHaveLength(1)
    expect([...made.pages.keys()]).toEqual(['operator-page'])
    expect(JSON.stringify(made.adapter.requests)).toContain('quoted submission receipt is absent')
  })
})

describe('publication outcome and recovery guards', () => {
  it('requires a final submission before treating an existing source link as a new live result', async () => {
    const made = await setup({ script: (prompt, step) => step === 0
      ? toolCallResponse('existing-link', 'backlinks', { action: 'item_result', itemId: prompt.item.id, leaseId: prompt.leaseId,
        status: 'live', publicUrl: prompt.item.sourceUrl, anchorText: 'Site', targetUrl: 'https://site.test/', evidence: 'Existing link.' })
      : textResponse('No new submission.') })
    await made.publish()
    expect(made.results.some(row => row.result.status === 'live')).toBe(false)
    expect(made.received.filter(command => command.kind === 'navigate')).toEqual([])
  })

  it('flushes the parent attempt before requesting a model', async () => {
    const flushing = Promise.withResolvers<undefined>()
    const durable = Promise.withResolvers<undefined>()
    const made = await setup()
    made.ctx.on('session/flush', async (session) => {
      if (session !== made.parent.agent.session) return
      flushing.resolve(undefined)
      await durable.promise
    })
    const publishing = made.publish()
    await flushing.promise
    expect(made.adapter.requests).toHaveLength(0)
    durable.resolve(undefined)
    expect((await publishing).value).toMatchObject({ attempted: 1, counts: { skipped: 1 } })
  })

  it('stops before requesting a model when the attempt checkpoint cannot be saved', async () => {
    const made = await setup()
    made.ctx.on('session/flush', (session) => {
      if (session === made.parent.agent.session) throw new Error('storage unavailable')
    })
    const result = await made.publish()
    expect(made.adapter.requests).toHaveLength(0)
    expect(result.value).toHaveProperty('stoppedReason', expect.any(String))
    expect(made.counts().releases).toBe(1)
  })

  it.each(['https://site.test/', 'https://unrelated.test/'])('rejects a publication URL outside the assigned source: %s', async (publicUrl) => {
    const made = await setup({ script: (prompt, step) => step === 0
      ? toolCallResponse('submit', 'browser', { action: 'click', selector: 'role:button|Submit', submission: true })
      : step === 1 ? toolCallResponse('self-link', 'backlinks', { action: 'item_result', itemId: prompt.item.id,
        leaseId: prompt.leaseId, status: 'live', publicUrl,
        anchorText: 'Site', targetUrl: 'https://site.test/', evidence: 'Homepage self link.' })
        : textResponse('Done.') })
    await made.publish()
    expect(made.results.some(row => row.result.status === 'live')).toBe(false)
  })

  it.each(['skipped', 'failed'] as const)('prevents a final submission after an item has already been saved as %s', async (status) => {
    const made = await setup({ script: (prompt, step) => {
      if (step === 0) return toolCallResponse('skip', 'backlinks', { action: 'item_result', itemId: prompt.item.id,
        leaseId: prompt.leaseId, status, ...status === 'skipped' ? { skipReason: 'Ineligible.' }
          : { failureMode: 'retryable', failureReason: 'Site unavailable.' } })
      if (step === 1) return toolCallResponse('late-submit', 'browser', { action: 'click', selector: 'role:button|Submit', submission: true })
      return textResponse('Done.')
    } })
    await made.publish()
    expect(made.received.some(command => command.kind === 'click')).toBe(false)
    expect([...made.pages.keys()]).toEqual(['operator-page'])
  })

  it('continues remaining items after the first item exhausts only its own step budget', async () => {
    const made = await setup({ items: [item(1), item(2), item(3)], capacity: 2,
      workBudget: { maxTokens: 1000000, maxSteps: 1, maxElapsedMs: 600000, maxRepeatedToolFailures: 3 },
      script: prompt => toolCallResponse('skip', 'backlinks', { action: 'item_result', itemId: prompt.item.id,
        leaseId: prompt.leaseId, status: 'skipped', skipReason: 'Ineligible.' }),
    })
    const result = await made.publish()
    expect(result.value).toMatchObject({ attempted: 3, remaining: 0 })
  })

  it('continues the queue after local budgets while preserving unknown submissions', async () => {
    const made = await setup({ items: [item(1), item(2)],
      workBudget: { maxTokens: 1000000, maxSteps: 1, maxElapsedMs: 600000, maxRepeatedToolFailures: 3 },
      script: () => toolCallResponse('submit', 'browser', { action: 'click', selector: 'role:button|Submit', submission: true }),
    })
    expect((await made.publish()).value).toMatchObject({ attempted: 2, remaining: 0, counts: { failed: 2 }, stoppedReason: null })
    expect(made.results.every(row => row.result.status === 'failed' && row.result.failureMode === 'manual_required')).toBe(true)
    expect(made.pages.size).toBe(3)
  })

  it('continues other items after a child reaches its output-token ceiling', async () => {
    const made = await setup({ items: [item(1), item(2)], script: () => maxTokensResponse('Partial response.') })
    expect((await made.publish()).value).toMatchObject({ attempted: 2, remaining: 0, counts: { failed: 2 }, stoppedReason: null })
  })

  it('preserves a terminal quota failure when its reported usage also exceeds the local budget', async () => {
    const made = await setup({ items: [item(1), item(2)], capacity: 2,
      workBudget: { maxTokens: 1, maxSteps: 40, maxElapsedMs: 600000, maxRepeatedToolFailures: 3 },
      script: () => [{ type: 'usage', usage: { inputTokens: 10, outputTokens: 0 } },
        { type: 'finish', reason: { kind: 'error', failure: { code: 'QUOTA', message: 'quota exhausted' } } }],
    })
    const result = await made.publish()
    expect(result.value).toMatchObject({ attempted: 1, remaining: 1 })
    expect(result.value).toHaveProperty('stoppedReason', expect.stringContaining('QUOTA'))
  })

  it('preserves attempted ids when cancellation and a backend outage leave a submission unknown', async () => {
    let reads = 0
    const submitted = Promise.withResolvers<undefined>()
    const made = await setup({ parentDriven: true,
      readBatch: () => { if (++reads > 1) throw new Error('backend unavailable during reconciliation') },
      navigate: async (_command, signal) => {
        submitted.resolve(undefined)
        await new Promise<void>((resolve) => {
          if (signal?.aborted) resolve()
          else signal?.addEventListener('abort', () => { resolve() }, { once: true })
        })
      },
      script: (_prompt, step) => step === 0
        ? toolCallResponse('submit', 'browser', { action: 'click', selector: 'role:button|Submit', submission: true })
        : toolCallResponse('receipt', 'browser', { action: 'navigate', url: 'https://directory-1.test/receipt' }),
    })
    made.parent.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Publish batch 176.' }], source: { kind: 'user' } }))
    await submitted.promise
    made.parent.agent.cancel({ kind: 'user' })
    await made.parent.agent.whenIdle()
    const events = structuredClone(made.parent.agent.session.events)
    expect(events.filter(event => event.type === 'backlinks/attempt').map(event => event.data.itemIds)).toEqual([[1]])
    expect(made.results).toHaveLength(0)
    const restored = await setup({ seed: events, items: [item(1), item(2)] })
    expect((await restored.publish()).value).toMatchObject({ attempted: 1, remaining: 0, unresolvedItemIds: [1], stoppedReason: null })
    expect(restored.starts).toEqual([2])
  })

  it('continues after a reconciliation transport failure without rewriting or closing the unknown submission', async () => {
    let reads = 0
    const made = await setup({ items: [1, 2, 3, 4, 5].map(id => item(id)),
      readBatch: () => { if (++reads === 2) throw new BacklinksError('backend unreachable', 'BACKLINKS_TRANSPORT') },
      script: (prompt, step) => {
        if (step > 0) return textResponse('Done.')
        return prompt.item.id === 1
          ? toolCallResponse('submit', 'browser', { action: 'click', selector: 'role:button|Submit', submission: true })
          : toolCallResponse(`skip-${prompt.item.id}`, 'backlinks', { action: 'item_result', itemId: prompt.item.id,
            leaseId: prompt.leaseId, status: 'skipped', skipReason: 'Ineligible.' })
      },
    })
    expect((await made.publish()).value).toMatchObject({ attempted: 5, remaining: 0,
      counts: { unresolved: 1, skipped: 4 }, unresolvedItemIds: [1], stoppedReason: null })
    expect(made.starts).toEqual([1, 2, 3, 4, 5])
    expect(made.results.map(row => row.itemId)).toEqual([2, 3, 4, 5])
    expect(made.pages.size).toBe(2)
    expect(made.counts().releases).toBe(1)
    expect((await made.publish()).value).toMatchObject({ attempted: 0, remaining: 0, unresolvedItemIds: [1], stoppedReason: null })
  })

  it.each(['BACKLINKS_UNAUTHORIZED', 'BACKLINKS_CONFLICT'] as const)('halts admission when reconciliation reports %s', async (code) => {
    let reads = 0
    const made = await setup({ items: [item(1), item(2)], capacity: 2,
      readBatch: () => { if (++reads === 2) throw new BacklinksError('global backend failure', code) },
      script: () => textResponse('No saved result.'),
    })
    const result = await made.publish()
    expect(result.value).toMatchObject({ attempted: 1, remaining: 1, unresolvedItemIds: [1] })
    expect(result.value).toHaveProperty('stoppedReason', expect.stringContaining('global backend failure'))
    expect(made.starts).toEqual([1])
    expect(made.counts().releases).toBe(1)
  })
})

it('honors a selected duplicate-source item when the lower-id sibling was not selected', async () => {
  const made = await setup({ items: [item(1), { ...item(2), sourceId: 1 }] })
  const result = await made.ctx.tools.execute({ name: 'backlink_publish', callId: CallId('selected-publish'),
    agent: made.parent.agent, signal: new AbortController().signal,
    arguments: { batchId: 176, scope: 'pending', mode: 'all', itemIds: [2] },
  })
  expect(made.starts).toEqual([2])
  expect(result.value).toMatchObject({ attempted: 1, remaining: 0 })
})


describe('publication across browsers', () => {
  it('runs different browser/site pairs together and queues a shared browser', async () => {
    const bothReserved = Promise.withResolvers<undefined>()
    const reservations: string[] = []
    const made = await setup({ extraBrowser: true,
      batchItems: { 176: [item(1)], 177: [item(2)], 178: [item(3)] },
      batchWebsites: { 176: 82, 177: 83, 178: 84 }, bindings: { 82: 'fixture', 83: 'second', 84: 'fixture' },
      reserve: async (_command, browserId) => {
        reservations.push(browserId)
        if (reservations.length === 2) bothReserved.resolve(undefined)
        await bothReserved.promise
      },
    })
    const result = await made.ctx.tools.execute({ name: 'backlink_publish_many', callId: CallId('many'),
      agent: made.parent.agent, signal: new AbortController().signal,
      arguments: { batches: [{ batchId: 176 }, { batchId: 177 }, { batchId: 178 }], scope: 'pending', mode: 'all' } })
    expect(result.isError).not.toBe(true)
    expect(result.value).toMatchObject({ pendingBatchIds: [], results: [
      { batchId: 176, browserId: 'fixture', result: { attempted: 1, counts: { skipped: 1 } } },
      { batchId: 177, browserId: 'second', result: { attempted: 1, counts: { skipped: 1 } } },
      { batchId: 178, browserId: 'fixture', result: { attempted: 1, counts: { skipped: 1 } } },
    ] })
    expect(reservations).toEqual(['fixture', 'second', 'fixture'])
    expect(made.browserPages.get('second')?.size).toBe(0)
    expect([...made.pages.keys()]).toEqual(['operator-page'])
    expect(made.counts()).toMatchObject({ claims: 3, releases: 3 })
  })

  it('serializes the same website even when different browsers are specified', async () => {
    const made = await setup({ extraBrowser: true, batchItems: { 176: [item(1)], 177: [item(2)] } })
    await made.ctx.tools.execute({ name: 'backlink_publish_many', callId: CallId('same-site'),
      agent: made.parent.agent, signal: new AbortController().signal,
      arguments: { batches: [{ batchId: 176, browserId: 'fixture' }, { batchId: 177, browserId: 'second' }], scope: 'pending', mode: 'all' } })
    const commands = made.routed.filter(row => row.command.kind === 'newPage' || row.command.kind === 'closePage')
    expect(commands.map(row => [row.browserId, row.command.kind])).toEqual([
      ['fixture', 'newPage'], ['fixture', 'closePage'], ['second', 'newPage'], ['second', 'closePage'],
    ])
  })

  it('does not let a later batch overtake an earlier batch waiting on its website', async () => {
    const made = await setup({ extraBrowser: true,
      batchItems: { 176: [item(1)], 177: [item(2)], 178: [item(3)] },
      batchWebsites: { 176: 82, 177: 82, 178: 83 },
    })
    await made.ctx.tools.execute({ name: 'backlink_publish_many', callId: CallId('ordered'),
      agent: made.parent.agent, signal: new AbortController().signal,
      arguments: { batches: [{ batchId: 176, browserId: 'fixture' }, { batchId: 177, browserId: 'second' },
        { batchId: 178, browserId: 'second' }], scope: 'pending', mode: 'all' } })
    expect(made.starts).toEqual([1, 2, 3])
  })

  it('leaves queued batches unstarted after a model failure and releases the active lease', async () => {
    const made = await setup({ batchItems: { 176: [item(1)], 177: [item(2)] }, script: () => [
      { type: 'finish', reason: { kind: 'error', failure: { code: 'QUOTA', message: 'quota exhausted' } } },
    ] })
    const result = await made.ctx.tools.execute({ name: 'backlink_publish_many', callId: CallId('stopped'),
      agent: made.parent.agent, signal: new AbortController().signal,
      arguments: { batches: [{ batchId: 176 }, { batchId: 177 }], scope: 'pending', mode: 'all' } })
    expect(result.value).toMatchObject({ pendingBatchIds: [177], results: [{ batchId: 176 }] })
    expect(made.starts).toEqual([1])
    expect(made.counts()).toMatchObject({ claims: 1, releases: 1 })
  })

  it('rejects an invalid browser in any batch before allocating pages or leases', async () => {
    const made = await setup({ batchItems: { 176: [item(1)], 177: [item(2)] } })
    const result = await made.ctx.tools.execute({ name: 'backlink_publish_many', callId: CallId('invalid'),
      agent: made.parent.agent, signal: new AbortController().signal,
      arguments: { batches: [{ batchId: 176, browserId: 'fixture' }, { batchId: 177, browserId: 'missing' }], scope: 'pending', mode: 'all' } })
    expect(result.isError).toBe(true)
    expect(made.received).toEqual([])
    expect(made.counts().claims).toBe(0)
    expect(made.adapter.requests).toEqual([])
  })

  it('pins browser commands to the assignment even when a child requests another browser', async () => {
    const made = await setup({ extraBrowser: true, bindings: { 82: 'fixture' }, script: (prompt, step) => step === 0
      ? toolCallResponse('escape-browser', 'browser', { action: 'navigate', browserId: 'second', page: prompt.page, url: 'https://escape.test/' })
      : textResponse('Stopped.') })
    await made.publish()
    expect(made.routed.some(row => row.browserId === 'second')).toBe(false)
    expect(made.received.some(command => command.kind === 'navigate')).toBe(false)
    expect(made.results[0]?.result).toMatchObject({ status: 'failed', failureMode: 'retryable' })
  })
})
