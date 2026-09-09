/** Foreground batch publication: one lease, bounded rolling children, and item-owned browser pages. */

import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { BrowserError } from '@deepseek-ai/dsh-browser'
import type { BacklinkBatchDetail, BacklinkBatchItem, BacklinkItemResult } from '@deepseek-ai/dsh-backlinks'
import { BacklinksError } from '@deepseek-ai/dsh-backlinks'
import { defineTool, type ToolExecution } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-subagent'
import { pendingBatchItems, readItemIds } from './batch-view.ts'
import type { LeaseRenewals } from './leases.ts'

/** Opt-in publication policy. Child request budgets remain owned by the configured subagent provider. */
export interface PublisherConfig {
  /** One-shot in-process provider with persona, tool-filter, and depth-limit support. */
  readonly provider: string
  /** Maximum concurrently running items per browser; each target hostname runs serially. */
  readonly concurrency: number
  /** Fixed instructions installed once as each child's persona. */
  readonly persona: string
  /** Maximum output tokens per child request. */
  readonly maxTokens: number
}

/** Publisher settings are explicit because enabling this tool authorizes a whole selected batch per call. */
export const PublisherConfig: z<PublisherConfig> = z.object({
  provider: z.string().required(),
  concurrency: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).required(),
  persona: z.string().required(),
  maxTokens: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).required(),
})

interface Assignment {
  readonly parent: Agent
  readonly detail: BacklinkBatchDetail
  readonly item: BacklinkBatchItem
  readonly page: string
  readonly browserId: string
  readonly leaseId: number
  child?: Agent
  submission: 'unsubmitted' | 'unknown' | 'confirmed'
  uncertain: boolean
  saved?: BacklinkItemResult
  pendingResult?: BacklinkItemResult
  recordedStatus?: 'live' | 'submitted'
  pageClosed: boolean
}

function samePage(left: string, right: string): boolean {
  const a = new URL(left)
  const b = new URL(right)
  a.hash = ''
  b.hash = ''
  return a.href === b.href
}

function websiteHost(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '')
}

/**
 * Register the opt-in batch publisher beside the low-level backlinks tool.
 * @param ctx - owning plugin context; browser, agents, and subagents must be present.
 * @param config - resolved child policy; publication cannot activate browser windows or use system input tools.
 * @param renewals - the backlinks tool's existing lease lifecycle owner.
 * @param timeoutMs - bound on reconciliation and release after cancellation.
 * @param parseResult - the existing backlinks JSON result validator.
 * @param attemptsFor - shared session attempt history, including restored tool-result metadata.
 * @param recordAttempts - append and flush attempt ids before a child's first model request.
 */
export function applyPublisher(
  ctx: Context,
  config: PublisherConfig,
  renewals: LeaseRenewals,
  timeoutMs: number,
  parseResult: (args: Record<string, unknown>) => BacklinkItemResult,
  attemptsFor: (agent: Agent) => Set<number>,
  recordAttempts: (agent: Agent, batchId: number, itemIds: number[]) => Promise<void>,
): void {
  const browserService = ctx.get('browser')
  const subagentService = ctx.get('subagents')
  const agents = ctx.get('agents')
  if (browserService === undefined || subagentService === undefined || agents === undefined) {
    throw new Error('backlink_publish requires browser, agents, and subagents services.')
  }
  const browser = browserService
  const subagents = subagentService
  if (config.provider.trim() === '' || config.persona.trim() === ''
    || !Number.isSafeInteger(config.concurrency) || config.concurrency < 1
    || !Number.isSafeInteger(config.maxTokens) || config.maxTokens < 1) {
    throw new Error('backlink_publish requires a provider, persona, and positive concurrency/maxTokens.')
  }
  const creating = new AsyncLocalStorage<Assignment>()
  const active = new Map<AbortController, Promise<unknown>>()
  const owners = new WeakSet<Agent>()
  const busyBrowsers = new Set<string>()
  const busyWebsites = new Set<number>()
  let closed = false

  async function capture(assignment: Assignment, format: 'text' | 'links', selector?: string) {
    const result = await browser.act({
      kind: 'snapshot', page: assignment.page, format,
      ...selector === undefined ? {} : { selector },
    }, AbortSignal.timeout(timeoutMs), assignment.browserId)
    if (result.kind !== 'page' || result.truncated) {
      throw new Error('Publication verification needs a complete page snapshot; narrow verificationSelector.')
    }
    return result
  }

  async function verifyResult(assignment: Assignment, args: Record<string, unknown>, result: BacklinkItemResult): Promise<void> {
    if (assignment.saved !== undefined) throw new Error('This item already has a saved result; never submit or report it again.')
    if (result.status === 'live' || result.status === 'submitted') {
      if (assignment.submission !== 'unknown') {
        throw new Error('A publication result requires a declared final submission. Report an existing backlink as skipped.')
      }
      if (result.evidence === undefined || result.evidence.trim() === '') {
        throw new Error('Publication results require one-line evidence.')
      }
      if (!assignment.detail.anchors.some(anchor =>
        new URL(anchor.targetUrl).href === new URL(result.targetUrl).href)) {
        throw new Error('targetUrl must be an anchor destination from the assigned website.')
      }
      const selector = typeof args.verificationSelector === 'string' ? args.verificationSelector : undefined
      if (result.status === 'live') {
        const publicUrl = new URL(result.publicUrl)
        if (publicUrl.protocol !== 'http:' && publicUrl.protocol !== 'https:') throw new Error('publicUrl must be an absolute http(s) URL.')
        const host = websiteHost(result.publicUrl)
        const sources = [assignment.item.sourceUrl, assignment.item.submitUrl].filter(url => url !== null)
        if (!sources.some(url => websiteHost(url) === host)
          || host === websiteHost(assignment.detail.website.siteUrl) || host === websiteHost(result.targetUrl)) {
          throw new Error('publicUrl must belong to the assigned publishing source, not the promoted website or link destination.')
        }
        await browser.act({ kind: 'navigate', page: assignment.page, url: publicUrl.href }, AbortSignal.timeout(timeoutMs), assignment.browserId)
        const page = await capture(assignment, 'links', selector)
        if (!samePage(page.url, result.publicUrl)) throw new Error('Navigate the assigned page to publicUrl before reporting live.')
        const links = JSON.parse(page.text) as { links: { href: string; text: string }[] }
        if (!links.links.some(link => new URL(link.href).href === new URL(result.targetUrl).href)) {
          throw new Error('The public page has no visible anchor with the claimed targetUrl; plain or escaped URL text is insufficient.')
        }
      } else {
        if (typeof args.receipt !== 'string' || args.receipt.trim() === '') {
          throw new Error('submitted requires receipt: an exact quote of the site acknowledgement.')
        }
        const page = await capture(assignment, 'text', selector)
        if (!page.text.includes(args.receipt)) throw new Error('The quoted submission receipt is absent from the current page.')
      }
    }
    if (result.status === 'failed' && result.failureMode === 'retryable'
      && (assignment.submission !== 'unsubmitted' || assignment.uncertain)) {
      throw new Error('A dispatched or uncertain submission must be manual_required, never retryable.')
    }
    if (result.status === 'skipped' && (assignment.submission !== 'unsubmitted' || assignment.uncertain)) {
      throw new Error('An uncertain submission cannot be skipped; report manual_required with the observed evidence.')
    }
  }

  // Agent publication precedes its first turn. Async-local assignment belongs to this start, not a sibling start.
  ctx.on('agent/created', ({ agent }) => {
    const assignment = creating.getStore()
    if (assignment === undefined || agent.session.header.parentSession !== assignment.parent.id) return
    let ready = false
    let admission: Promise<void> | undefined
    agent.ctx.on('agent/pre-step', async (_payload, next) => {
      if (!ready) throw new Error('Publication page and item restrictions were not installed; child stopped before requesting the model.')
      admission ??= recordAttempts(assignment.parent, assignment.detail.batch.id, [assignment.item.id])
      await admission
      return next()
    })
    const browserTool = ctx.tools.get('browser', agent)
    const backlinksTool = ctx.tools.get('backlinks', agent)
    if (browserTool === undefined || backlinksTool === undefined) {
      throw new Error('Publication children require browser and backlinks tools.')
    }
    agent.ctx.tools.register({
      ...browserTool,
      description: `${browserTool.description} Your only page is assigned in the task; omitting page uses it. Publication stays in the background: bringToFront is forbidden. Report human intervention as failed/manual_required with the reason and assigned browser/page; the operator opens it manually. Every click or press requires submission: false for navigation/account work, true for the one final publication.`,
      parameters: {
        ...browserTool.parameters,
        properties: {
          ...(browserTool.parameters.properties as Record<string, unknown>),
          submission: { type: 'boolean', description: 'Required on click/press: true only for the final publication; false for navigation or account work. A final publication can be dispatched once.' },
        },
      },
      async execute(raw, exec) {
        const args = raw as Record<string, unknown>
        if (args.browserId !== undefined && args.browserId !== assignment.browserId) throw new Error(`Use only your assigned browser ${assignment.browserId}.`)
        if (args.page !== undefined && args.page !== assignment.page) throw new Error(`Use only your assigned page ${assignment.page}.`)
        if (args.action === 'newPage') throw new Error('This item already owns a reserved page; do not open another.')
        if (args.action === 'bringToFront') throw new Error('Publication cannot activate browser windows. Report manual_required and let the operator open the retained page.')
        if (assignment.saved !== undefined
          && !['snapshot', 'screenshot', 'waitFor', 'closePage'].includes(String(args.action))) {
          throw new Error('This item already has a saved result; no further browser input or navigation is allowed.')
        }
        if (args.action === 'closePage') {
          if (assignment.saved === undefined || assignment.uncertain || assignment.submission === 'unknown'
            || (assignment.saved.status === 'failed' && assignment.saved.failureMode === 'manual_required')) {
            throw new Error('Preserve this page until a conclusive result is saved; the publisher owns final cleanup.')
          }
        }
        if (assignment.submission !== 'unsubmitted'
          && !['snapshot', 'screenshot', 'waitFor', 'navigate', 'closePage'].includes(String(args.action))) {
          throw new Error('A final publication was dispatched. Verify it without further input; never submit again.')
        }
        if (args.action === 'click' || args.action === 'press') {
          if (typeof args.submission !== 'boolean') throw new Error('Set submission false for navigation/account work or true for the final publication.')
          if (args.submission) assignment.submission = 'unknown'
        } else if (args.submission !== undefined) {
          throw new Error('submission is only valid on click or press.')
        }
        try {
          const value = await browserTool.execute({ ...args, page: assignment.page, browserId: assignment.browserId }, exec)
          if (args.action === 'closePage') assignment.pageClosed = true
          return value
        } catch (error) {
          if (error instanceof BrowserError && error.code === 'BROWSER_ACTION_UNCERTAIN') assignment.uncertain = true
          throw error
        }
      },
    })
    agent.ctx.tools.register({
      ...backlinksTool,
      description: `${backlinksTool.description} Work only on the assigned item; batch and lease actions are owned by the publisher.`,
      parameters: {
        ...backlinksTool.parameters,
        properties: {
          ...(backlinksTool.parameters.properties as Record<string, unknown>),
          receipt: { type: 'string', description: 'submitted: exact visible site acknowledgement, checked against the assigned page.' },
          verificationSelector: { type: 'string', description: 'Optional snapshot scope for public-link or receipt verification.' },
        },
      },
      async execute(raw, exec) {
        const args = raw as Record<string, unknown>
        if (!['item_result', 'source_tags', 'badge_add', 'mailbox_create', 'mail_wait'].includes(String(args.action))) {
          throw new Error('The publisher owns batches and leases; complete only the assigned item.')
        }
        if (args.action === 'source_tags' && args.sourceId !== assignment.item.sourceId) throw new Error('source_tags must target the assigned sourceId.')
        if (args.action === 'badge_add' && args.websiteId !== assignment.detail.website.id) throw new Error('badge_add must target the assigned websiteId.')
        if (args.action !== 'item_result') return backlinksTool.execute(args, exec)
        if (args.itemId !== assignment.item.id || args.leaseId !== assignment.leaseId) throw new Error('item_result must use the assigned itemId and leaseId.')
        const result = parseResult(args)
        await verifyResult(assignment, args, result)
        assignment.pendingResult = result
        const value = await backlinksTool.execute(args, exec)
        assignment.saved = result
        delete assignment.pendingResult
        if (result.status === 'live' || result.status === 'submitted') assignment.submission = 'confirmed'
        return value
      },
    })
    assignment.child = agent
    ready = true
  })

  async function finish(assignment: Assignment, reason: string): Promise<void> {
    const cleanupSignal = AbortSignal.timeout(timeoutMs)
    if (assignment.saved === undefined) {
      // A write may have reached the server before its response was lost; read before any fallback write.
      const current = await ctx.backlinks.getBatch(assignment.detail.batch.id, cleanupSignal)
      const item = current.items.find(item => item.id === assignment.item.id)
      if (item === undefined) throw new Error(`Assigned item ${assignment.item.id} disappeared; inspect the batch.`)
      if (item.publishStatus === 'live' || item.publishStatus === 'submitted' || item.publishedUrl) {
        assignment.submission = 'confirmed'
        if (item.publishStatus === 'live' || item.publishStatus === 'submitted') assignment.recordedStatus = item.publishStatus
      } else if (assignment.pendingResult?.status === 'failed' && item.status === 'failed'
        && item.failureMode === assignment.pendingResult.failureMode && item.failureReason === assignment.pendingResult.failureReason) {
        assignment.saved = assignment.pendingResult
      } else if (assignment.pendingResult?.status === 'skipped' && item.status === 'skipped') {
        assignment.saved = assignment.pendingResult
      } else if (assignment.pendingResult !== undefined) {
        throw new Error(`Item ${item.id} result acknowledgement was lost; reconcile its recorded status before resuming.`)
      } else {
        const result: BacklinkItemResult = {
          status: 'failed',
          failureMode: assignment.submission === 'unsubmitted' && !assignment.uncertain ? 'retryable' : 'manual_required',
          failureReason: `Child stopped without a saved result: ${reason}. ${assignment.submission === 'unsubmitted'
            ? 'No final publication was declared.' : 'Final submission outcome is unknown; do not resubmit.'}`,
        }
        await ctx.backlinks.reportItemResult(item.id, result, cleanupSignal)
        assignment.saved = result
      }
    }
    const safeToClose = !assignment.uncertain && assignment.submission !== 'unknown' && (assignment.submission === 'confirmed'
      || assignment.saved?.status === 'skipped'
      || (assignment.saved?.status === 'failed' && assignment.saved.failureMode === 'retryable'))
    if (safeToClose && !assignment.pageClosed) {
      await browser.act({ kind: 'closePage', page: assignment.page }, cleanupSignal, assignment.browserId)
      assignment.pageClosed = true
    }
  }

  async function run(
    args: { batchId: number; scope: string; mode: string; itemIds?: number[]; browserId?: string },
    exec: ToolExecution, signal: AbortSignal, prepared?: BacklinkBatchDetail,
  ) {
    const parent = exec.agent
    if (parent === undefined || parent.session.header.origin === 'subagent') throw new Error('backlink_publish requires the primary calling agent.')
    const provider = subagents.getProvider(config.provider)
    if (provider === undefined || provider.inheritsParentContext || !provider.capabilities.persona
      || !provider.capabilities.toolFilter || !provider.capabilities.depthLimit) {
      throw new Error('backlink_publish requires a fresh one-shot provider supporting persona, toolFilter, and depthLimit.')
    }
    let reservation: { browserId: string; websiteId: number } | undefined
    let leaseId: number | undefined
    const assignments: Assignment[] = []
    const running = new Map<string, Promise<void>>()
    const unusedPages = new Set<string>()
    let admissionBlocked = false
    let stoppedReason: string | undefined
    const canStartChild = () => !signal.aborted && stoppedReason === undefined
    try {
      const selected = readItemIds(args.itemIds, Number.MAX_SAFE_INTEGER)
      const detail = await ctx.backlinks.getBatch(args.batchId, signal)
      if (prepared !== undefined && detail.website.id !== prepared.website.id) {
        throw new Error(`Batch ${args.batchId} changed websites after browser selection; refresh its assignment.`)
      }
      const boundBrowser = ctx.backlinks.browserBindings()[detail.website.id]
      const browserId = browser.resolve(args.browserId ?? (boundBrowser || undefined))
      if (busyBrowsers.has(browserId) || busyWebsites.has(detail.website.id)) {
        throw new Error(`Browser ${browserId} or website ${detail.website.id} already has an active publication. Wait for it to finish.`)
      }
      reservation = { browserId, websiteId: detail.website.id }
      busyBrowsers.add(browserId)
      busyWebsites.add(detail.website.id)
      const attempted = attemptsFor(parent)
      if (selected?.some(id => !detail.items.some(item => item.id === id))) {
        throw new Error(`Selected itemIds must belong to batch ${args.batchId}.`)
      }
      const items = pendingBatchItems(detail, attempted, args.scope, selected)
      const selectedSources = new Set(detail.items.filter(item => selected === undefined || selected.includes(item.id))
        .map(item => item.sourceId))
      const publishedSources = new Set(detail.items.filter(item => item.publishedUrl
        || item.publishStatus === 'live' || item.publishStatus === 'submitted').map(item => item.sourceId))
      const unresolvedItemIds = (args.scope === 'retryable' ? [] : detail.items.filter(item => attempted.has(item.id)
        && item.status === 'pending' && selectedSources.has(item.sourceId) && !publishedSources.has(item.sourceId))
        .map(item => item.id)).sort((left, right) => left - right)
      for (const item of items) {
        const url = new URL(item.submitUrl ?? item.sourceUrl)
        if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`Item ${item.id} needs an http(s) website URL.`)
      }
      const remaining = [...items]
      const firstItem = remaining[0]
      if (firstItem === undefined) {
        return { attempted: 0, attemptedItemIds: [], unresolvedItemIds, manualRequired: [], remaining: 0, counts: {}, stoppedReason: null }
      }
      if (detail.anchors.length === 0) {
        return { attempted: 0, attemptedItemIds: [], unresolvedItemIds, manualRequired: [], remaining: remaining.length, counts: {},
          stoppedReason: `Website ${detail.website.id} needs a name and an absolute http(s) website URL, or a configured publication anchor. Update its website details before continuing; no items were claimed.` }
      }
      const pagePrefix = `publish-${randomUUID()}`
      // Reserve capacity before claiming work or starting a paid child.
      const firstPage = `${pagePrefix}-${firstItem.id}`
      await browser.act({ kind: 'newPage', page: firstPage }, signal, browserId)
      unusedPages.add(firstPage)
      const claim = await ctx.backlinks.claim(args.batchId, items.map(item => item.id), signal)
      leaseId = claim.leaseId
      if (claim.items.length !== items.length || items.some(item => !claim.items.some(claimed => claimed.id === item.id))) {
        throw new Error('The backend claimed a different item set; inspect the lease before publication.')
      }
      remaining.splice(0, remaining.length, ...[...claim.items].sort((left, right) => left.id - right.id))
      renewals.start(leaseId, parent)
      while (remaining.length > 0 || running.size > 0) {
        while (canStartChild() && !admissionBlocked && running.size < config.concurrency) {
          const index = remaining.findIndex(item => !running.has(new URL(item.submitUrl ?? item.sourceUrl).hostname))
          const item = remaining[index]
          if (item === undefined) break
          const page = `${pagePrefix}-${item.id}`
          if (!unusedPages.has(page)) {
            try {
              await browser.act({ kind: 'newPage', page }, signal, browserId)
              unusedPages.add(page)
            } catch (error) {
              if (!(error instanceof BrowserError) || error.code !== 'BROWSER_PAGE_LIMIT') throw error
              admissionBlocked = true
              break
            }
          }
          // Another child may stop while this page reservation is pending.
          if (!canStartChild()) break
          remaining.splice(index, 1)
          const assignment: Assignment = { parent, detail, item, page, browserId, leaseId,
            submission: 'unsubmitted', uncertain: false, pageClosed: false }
          unusedPages.delete(page)
          const host = new URL(item.submitUrl ?? item.sourceUrl).hostname
          const work = (async () => {
            let reason = 'interrupted'
            let started = false
            try {
              const child = await creating.run(assignment, () => subagents.start(config.provider, {
                parent, signal, label: `Publish item ${item.id}`, maxDepth: 1,
                persona: config.persona, agentOptions: { maxTokens: config.maxTokens },
                toolFilter: { allow: ['browser', 'backlinks'] },
                prompt: [{ type: 'text', text: JSON.stringify({
                  item, website: detail.website, anchors: detail.anchors, leaseId,
                  mode: args.mode, page, browserId,
                }) }],
              }))
              started = true
              assignments.push(assignment)
              attempted.add(item.id)
              try {
                if (child.localAgent === undefined || child.localAgent !== assignment.child) {
                  assignment.uncertain = true
                  stoppedReason = 'The publication provider did not create an owned in-process child.'
                  throw new Error('The publication provider did not create an owned in-process child.')
                }
                const result = await child.result
                reason = result.diagnostic ?? result.stopReason
                if (result.stopReason !== 'completed' && result.stopReason !== 'budget-exhausted' && result.stopReason !== 'max-tokens') {
                  stoppedReason ??= `Item ${item.id} stopped: ${reason}`
                }
              } finally {
                try {
                  await child.dispose()
                } finally {
                  delete assignment.child
                }
              }
            } catch (error) {
              reason = error instanceof Error ? error.message : String(error)
              if (!started) {
                stoppedReason = `Child startup stopped; unstarted items remain pending: ${reason}`
                remaining.push(item)
              } else {
                stoppedReason ??= `Item ${item.id} stopped: ${reason}`
              }
            } finally {
              try {
                if (started) {
                  await finish(assignment, reason)
                } else {
                  await browser.act({ kind: 'closePage', page }, AbortSignal.timeout(timeoutMs), browserId)
                  assignment.pageClosed = true
                }
                if (assignment.pageClosed) admissionBlocked = false
              } catch (error) {
                if (assignment.saved === undefined && assignment.submission !== 'confirmed') unresolvedItemIds.push(item.id)
                const message = `Item ${item.id} needs reconciliation: ${error instanceof Error ? error.message : String(error)}`
                ctx.logger.warn(message)
                if (error instanceof BacklinksError && ![
                  'BACKLINKS_TRANSPORT', 'BACKLINKS_TIMEOUT', 'BACKLINKS_API_ERROR', 'BACKLINKS_NOT_FOUND', 'BACKLINKS_INVALID_REQUEST',
                ].includes(error.code)) stoppedReason ??= message
              }
            }
          })()
          running.set(host, work)
          void work.then(() => { running.delete(host) })
        }
        if (running.size === 0) break
        await Promise.race(running.values())
      }
      const counts: Record<string, number> = {}
      for (const assignment of assignments) {
        const status = assignment.saved?.status ?? assignment.recordedStatus ?? (assignment.submission === 'confirmed' ? 'recorded' : 'unresolved')
        counts[status] = (counts[status] ?? 0) + 1
      }
      const manualRequired = assignments.flatMap(assignment => assignment.saved?.status === 'failed'
        && assignment.saved.failureMode === 'manual_required' ? [{
          itemId: assignment.item.id, browserId: assignment.browserId, page: assignment.page,
          reason: assignment.saved.failureReason,
        }] : [])
      return { attempted: assignments.length, attemptedItemIds: assignments.map(assignment => assignment.item.id),
        unresolvedItemIds: unresolvedItemIds.sort((left, right) => left - right),
        manualRequired, remaining: remaining.length, counts,
        stoppedReason: stoppedReason ?? (signal.aborted ? 'cancelled'
          : admissionBlocked ? 'Browser page capacity is occupied by preserved work; review those pages before continuing.' : null) }
    } finally {
      try {
        await Promise.allSettled(running.values())
        const closedPages = await Promise.allSettled([...unusedPages].map(page =>
          browser.act({ kind: 'closePage', page }, AbortSignal.timeout(timeoutMs), reservation?.browserId)))
        const failure = closedPages.find(result => result.status === 'rejected')
        if (failure?.status === 'rejected') throw failure.reason
      } finally {
        try {
          if (leaseId !== undefined) {
            await renewals.stop(leaseId)
            await ctx.backlinks.release(leaseId, AbortSignal.timeout(timeoutMs))
          }
        } finally {
          if (reservation !== undefined) {
            busyBrowsers.delete(reservation.browserId)
            busyWebsites.delete(reservation.websiteId)
          }
        }
      }
    }
  }

  async function track<T>(exec: ToolExecution, start: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (closed) throw new Error('backlink_publish is disposed.')
    const parent = exec.agent
    if (parent === undefined || parent.session.header.origin === 'subagent') throw new Error('Publication requires the primary calling agent.')
    if (owners.has(parent)) throw new Error('A publication call is already running for this agent.')
    owners.add(parent)
    const controller = new AbortController()
    const work = Promise.resolve().then(() => start(AbortSignal.any([exec.signal, controller.signal])))
    active.set(controller, work)
    try {
      return await work
    } finally {
      owners.delete(parent)
      active.delete(controller)
    }
  }

  ctx.tools.register(defineTool({
    name: 'backlink_publish_many',
    description: 'Publish user-selected batches across isolated browsers in one foreground call. Different browsers and promoted websites run concurrently; batches sharing either run in input order. Explicit browserId overrides saved website bindings. All browser selections are checked before pages or leases. A stopped batch halts new admissions and drains active work; never resubmit unknown outcomes.',
    parameters: {
      batches: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
        batchId: { type: 'number', required: true },
        browserId: { type: 'string' },
        itemIds: { type: 'array', items: { type: 'number' } },
      } }, description: 'Confirmed batches in dispatch order, each with an optional explicit browser and item selection.' },
      scope: { type: 'string', enum: ['all', 'pending', 'retryable'], required: true },
      mode: { type: 'string', enum: ['smart', 'all'], required: true },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        results: { type: 'json', required: true },
        pendingBatchIds: { type: 'array', items: { type: 'number' }, required: true },
      } },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      if (args.batches.length === 0 || new Set(args.batches.map(batch => batch.batchId)).size !== args.batches.length
        || args.batches.some(batch => !Number.isSafeInteger(batch.batchId) || batch.batchId <= 0)) {
        throw new Error('Select distinct positive batch ids for publication.')
      }
      return track(exec, async (signal) => {
        const bindings = ctx.backlinks.browserBindings()
        const pending = await Promise.all(args.batches.map(async (batch) => {
          readItemIds(batch.itemIds, Number.MAX_SAFE_INTEGER)
          const detail = await ctx.backlinks.getBatch(batch.batchId, signal)
          return { ...batch, detail, browserId: browser.resolve(batch.browserId ?? (bindings[detail.website.id] || undefined)) }
        }))
        const browserTails = new Map<string, Promise<void>>()
        const websiteTails = new Map<number, Promise<void>>()
        const unstarted = new Set(pending.map(batch => batch.batchId))
        const results: { batchId: number; browserId: string; result: Awaited<ReturnType<typeof run>> | null; error: string | null }[] = []
        let stopped = false
        const work = pending.map((batch) => {
          const before = [browserTails.get(batch.browserId), websiteTails.get(batch.detail.website.id)]
            .filter(value => value !== undefined)
          const current = Promise.all(before).then(async () => {
            if (stopped || signal.aborted) return
            unstarted.delete(batch.batchId)
            try {
              const result = await run({ ...batch, scope: args.scope, mode: args.mode }, exec, signal, batch.detail)
              results.push({ batchId: batch.batchId, browserId: batch.browserId, result, error: null })
              if (result.stoppedReason !== null) stopped = true
            } catch (error) {
              results.push({ batchId: batch.batchId, browserId: batch.browserId, result: null,
                error: error instanceof Error ? error.message : String(error) })
              stopped = true
            }
          })
          browserTails.set(batch.browserId, current)
          websiteTails.set(batch.detail.website.id, current)
          return current
        })
        await Promise.all(work)
        results.sort((a, b) => args.batches.findIndex(batch => batch.batchId === a.batchId)
          - args.batches.findIndex(batch => batch.batchId === b.batchId))
        return { results, pendingBatchIds: [...unstarted] }
      })
    },
    presentCall: args => ({ card: 'generic', title: `Publish ${args.batches.length} batches`, kind: 'execute' }),
  }))

  ctx.tools.register(defineTool({
    name: 'backlink_publish',
    description: `Publish the user-confirmed batch scope using up to ${config.concurrency} rolling item workers, one per target host. The runtime claims and renews one lease, binds pages, verifies results, and releases the lease. This foreground call waits for completion; do not claim first or start separate subagents. Model, checkpoint, authentication or lease failures halt new starts. Per-item budget or reconciliation failures skip the affected item and continue the queue. unresolvedItemIds lists unconfirmed outcomes excluded from further dispatch; report them separately without resubmitting or changing their backend status to skipped. When remaining is zero and stoppedReason is null, finish the scope and list unresolved items for manual review. Report manualRequired entries with their reason and browser/page; let the operator open those pages manually without activating windows.`,
    parameters: {
      batchId: { type: 'number', required: true, description: 'User-selected publish batch.' },
      browserId: { type: 'string', description: 'Explicit browser from browser_list; overrides the website binding. Omitted uses the saved website binding, then the default browser.' },
      scope: { type: 'string', enum: ['all', 'pending', 'retryable'], required: true, description: 'The confirmed work selection.' },
      mode: { type: 'string', enum: ['smart', 'all'], required: true, description: 'smart matches known playbooks; all attempts unknown site types too.' },
      itemIds: { type: 'array', items: { type: 'number' }, description: 'The exact user-selected subset, when scope is manually selected.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          attempted: { type: 'number', required: true },
          attemptedItemIds: { type: 'array', items: { type: 'number' }, required: true },
          unresolvedItemIds: { type: 'array', items: { type: 'number' }, required: true },
          manualRequired: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
            itemId: { type: 'number', required: true }, browserId: { type: 'string', required: true },
            page: { type: 'string', required: true }, reason: { type: 'string', required: true },
          } } },
          remaining: { type: 'number', required: true },
          counts: { type: 'json', required: true },
          stoppedReason: { type: 'json', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify({
        attempted: value.attempted, remaining: value.remaining, counts: value.counts, stoppedReason: value.stoppedReason,
        ...value.unresolvedItemIds.length > 0 ? { unresolvedItemIds: value.unresolvedItemIds } : {},
        ...value.manualRequired.length > 0 ? { manualRequired: value.manualRequired } : {},
      }) }],
      presentationMeta: (_args, value) => ({ kind: 'backlinks', action: 'backlink_publish', attemptedItemIds: value.attemptedItemIds }),
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      if (closed) throw new Error('backlink_publish is disposed.')
      if (!Number.isSafeInteger(args.batchId) || args.batchId <= 0) throw new Error('batchId must be a positive integer.')
      return track(exec, signal => run(args, exec, signal))
    },
    presentCall: args => ({ card: 'generic', title: `Publish batch ${args.batchId}`, kind: 'execute' }),
  }))
  ctx.effect(() => async () => {
    closed = true
    for (const controller of active.keys()) controller.abort('publisher disposed')
    await Promise.allSettled(active.values())
  })
}
