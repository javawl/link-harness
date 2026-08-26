/**
 * The model-facing `backlinks` tool. This module owns its schema, validation, and presentation; `ctx.backlinks`
 * owns both provider registries. One tool with an `action` discriminant — the batch workflow is one coherent
 * verb set (list → get → claim → heartbeat → result → release, plus mail and badge helpers) — mirroring the
 * browser tool's single-surface shape. Timeout is deployment policy; the mail wait accepts its own bounded
 * `waitTimeoutMs` within the tool budget.
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, GenericResultView, JsonValue, ToolResult } from '@deepseek-ai/dsh-tools'
import { assertNever } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type { BacklinkBadgeInput, BacklinkItemResult } from '@deepseek-ai/dsh-backlinks'

/** Tool actions, one per seam operation. */
const ACTIONS = [
  'batch_list', 'batch_get', 'batch_claim', 'lease_heartbeat', 'lease_release',
  'item_result', 'badge_add', 'mailbox_create', 'mail_wait',
] as const

type BacklinksAction = typeof ACTIONS[number]

/** Validated tool arguments after value checks the schema DSL cannot express. */
export interface BacklinksToolInput {
  readonly action: BacklinksAction
  readonly batchId?: number
  readonly itemIds?: readonly number[]
  readonly leaseId?: number
  readonly itemId?: number
  readonly websiteId?: number
  readonly status?: 'live' | 'submitted' | 'failed' | 'skipped'
  readonly publicUrl?: string
  readonly anchorText?: string
  readonly targetUrl?: string
  readonly evidence?: string
  readonly failureMode?: 'retryable' | 'manual_required'
  readonly failureReason?: string
  readonly skipReason?: string
  readonly name?: string
  readonly html?: string
  readonly isActive?: boolean
  readonly localPart?: string
  readonly domain?: string
  readonly subjectContains?: string
  readonly fromContains?: string
  readonly mailEmail?: string
  readonly waitTimeoutMs?: number
}

/** The parameter schema already enforces a string; unknown values flow to the switch default. */
function readAction(args: Record<string, unknown>): BacklinksAction {
  return args.action as BacklinksAction
}

function readId(args: Record<string, unknown>, field: string): number {
  const parsed = Number(args[field])
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`backlinks ${field} must be a positive integer.`)
  }
  return parsed
}

function readNonEmpty(args: Record<string, unknown>, field: string): string {
  const value = args[field]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`backlinks ${field} must be a non-empty string.`)
  }
  return value.trim()
}

function readOptionalString(args: Record<string, unknown>, field: string): string | undefined {
  const value = args[field]
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') {
    throw new Error(`backlinks ${field} must be a string.`)
  }
  return value
}

/** Build the closed-union item result for `item_result` actions.
 * @param args - validated tool arguments.
 * @returns the seam's closed-union payload.
 */
export function parseItemResult(args: Record<string, unknown>): BacklinkItemResult {
  const evidence = readOptionalString(args, 'evidence')
  switch (args.status) {
    case 'live':
      return {
        status: 'live',
        publicUrl: readNonEmpty(args, 'publicUrl'),
        anchorText: readNonEmpty(args, 'anchorText'),
        targetUrl: readNonEmpty(args, 'targetUrl'),
        ...evidence === undefined ? {} : { evidence },
      }
    case 'submitted': {
      const publicUrl = readOptionalString(args, 'publicUrl')
      return {
        status: 'submitted',
        ...publicUrl === undefined ? {} : { publicUrl },
        anchorText: readNonEmpty(args, 'anchorText'),
        targetUrl: readNonEmpty(args, 'targetUrl'),
        ...evidence === undefined ? {} : { evidence },
      }
    }
    case 'failed': {
      const failureMode = args.failureMode
      if (failureMode !== 'retryable' && failureMode !== 'manual_required') {
        throw new Error('backlinks failureMode must be retryable or manual_required.')
      }
      return {
        status: 'failed',
        failureMode,
        failureReason: readNonEmpty(args, 'failureReason'),
        ...evidence === undefined ? {} : { evidence },
      }
    }
    case 'skipped':
      return { status: 'skipped', skipReason: readNonEmpty(args, 'skipReason') }
    default:
      throw new Error('backlinks item_result requires status live, submitted, failed, or skipped.')
  }
}

/**
 * Render a backlinks tool result value as model-facing text. Pure.
 * @param value - the tool result value carrying `summary` and `data`.
 * @returns the render text with missing fields degraded, not thrown.
 */
export function renderBacklinksValue(value: unknown): string {
  const record = (value as { summary?: unknown; data?: unknown } | undefined) ?? {}
  const summary = typeof record.summary === 'string' ? record.summary : ''
  const data = (record.data === undefined ? null : record.data) as JsonValue
  return `${summary}\n${JSON.stringify(data)}`
}

/** Pure call view: a generic card naming the action and its target.
 * @param args - raw tool arguments; only display fields are read.
 * @returns the generic card shown while the call runs.
 */
export function presentBacklinksCall(args: Record<string, unknown>): GenericCallView {
  const action = typeof args.action === 'string' ? args.action : 'backlinks'
  const target = args.batchId ?? args.leaseId ?? args.itemId ?? args.websiteId ?? args.mailEmail
  const rawInput = typeof target === 'string' ? target : typeof target === 'number' ? String(target) : undefined
  return {
    card: 'generic',
    title: `backlinks ${action}`,
    kind: 'execute',
    ...rawInput === undefined ? {} : { rawInput },
  }
}

/** Pure persisted-result metadata: a marker carrying the action summary.
 * @param value - the tool result value to project.
 * @returns the JSON payload persisted with the `tool/result` event.
 */
export function backlinksMetaFromValue(value: unknown): JsonValue {
  const record = (value as { action?: unknown; summary?: unknown } | undefined) ?? {}
  return {
    kind: 'backlinks',
    action: typeof record.action === 'string' ? record.action : 'unknown',
    summary: typeof record.summary === 'string' ? record.summary : '',
  }
}

/** Narrow the opaque persisted meta back to its summary.
 * @param meta - the persisted presentation payload, defensively narrowed.
 * @returns the action summary, or `undefined` for any other payload.
 */
export function backlinksMetaFromMeta(meta: JsonValue | undefined): { summary: string } | undefined {
  if (meta === undefined || typeof meta !== 'object' || meta === null) return undefined
  const candidate = meta as { kind?: unknown; summary?: unknown }
  return candidate.kind === 'backlinks' && typeof candidate.summary === 'string'
    ? { summary: candidate.summary }
    : undefined
}

/** Pure result view: a replacement title carrying the summary.
 * @param _args - raw tool arguments; unused, presentation reads only the result.
 * @param result - the completed tool result carrying the persisted meta.
 * @returns the generic result card, or `undefined` to keep the raw result content.
 */
export function presentBacklinksResult(_args: Record<string, unknown>, result: ToolResult): GenericResultView | undefined {
  const meta = backlinksMetaFromMeta(result.meta)
  return meta === undefined ? undefined : { card: 'generic', title: meta.summary }
}

/** The backlinks workflow is one sequential cross-process process; calls never overlap safely.
 * @returns always false — backlinks commands must not run concurrently.
 */
export function backlinksIsConcurrencySafe(): boolean {
  return false
}

/**
 * Register the `backlinks` tool and its prompt section.
 * @param ctx - context carrying `tools`, `backlinks`, and `systemPrompt`.
 * @param timeoutMs - per-call timeout attached as `ToolDefinition.timeoutMs`.
 */
export function applyBacklinksTool(ctx: Context, timeoutMs: number): void {
  ctx.systemPrompt.section({
    name: 'tool:backlinks',
    order: 113,
    text: [
      'Use the backlinks tool to run the publish-batch workflow against the backlink management backend:',
      'batch_list → batch_get (pick a batch) → batch_claim (grants a lease; heartbeat every ~30s while working)',
      '→ per item: browser publishes on the target site, then item_result reports live/submitted/failed/skipped',
      '→ lease_release when done. mailbox_create + mail_wait receive site verification codes (returns code and first link).',
      'badge_add installs a reciprocal footer badge when a site requires exchange.',
      'Never re-submit an item whose outcome is unknown: report failed with failureMode manual_required instead.',
    ].join(' '),
  })

  ctx.tools.register(defineTool({
    name: 'backlinks',
    description: 'Run the publish-batch workflow: list/detail/claim batches, keep the lease alive, report per-item results, create verification mailboxes, wait for verification mail, and add reciprocal badges.',
    parameters: {
      action: {
        type: 'string',
        required: true,
        description: `One of ${ACTIONS.join(', ')}.`,
      },
      batchId: { type: 'number', description: 'Batch id for batch_get / batch_claim.' },
      itemIds: {
        type: 'array',
        items: { type: 'number' },
        description: 'Optional explicit plan-item subset for batch_claim; omitted claims pending + retryable.',
      },
      leaseId: { type: 'number', description: 'Lease id for lease_heartbeat / lease_release.' },
      itemId: { type: 'number', description: 'Plan item id for item_result.' },
      websiteId: { type: 'number', description: 'Website id for badge_add.' },
      status: { type: 'string', description: 'item_result status: live, submitted, failed, or skipped.' },
      publicUrl: { type: 'string', description: 'Verified public listing URL (required for live).' },
      anchorText: { type: 'string', description: 'Anchor text used (live/submitted).' },
      targetUrl: { type: 'string', description: 'Target URL used (live/submitted).' },
      evidence: { type: 'string', description: 'One-line evidence note stored with the result.' },
      failureMode: { type: 'string', description: 'failed classification: retryable or manual_required.' },
      failureReason: { type: 'string', description: 'Why the item failed.' },
      skipReason: { type: 'string', description: 'Why the item is skipped.' },
      name: { type: 'string', description: 'Badge name for badge_add.' },
      html: { type: 'string', description: 'Badge HTML for badge_add.' },
      isActive: { type: 'boolean', description: 'Activate the badge immediately (default true).' },
      localPart: { type: 'string', description: 'Mailbox local part for mailbox_create.' },
      domain: { type: 'string', description: 'Mail domain for mailbox_create.' },
      mailEmail: { type: 'string', description: 'Mailbox address for mail_wait.' },
      subjectContains: { type: 'string', description: 'Subject filter for mail_wait.' },
      fromContains: { type: 'string', description: 'Sender filter for mail_wait.' },
      waitTimeoutMs: { type: 'number', description: 'Total wait bound for mail_wait in milliseconds.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          action: { type: 'string', required: true },
          summary: { type: 'string', required: true },
          data: { type: 'json', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: renderBacklinksValue(value) }],
      presentationMeta: (_args, value) => backlinksMetaFromValue(value),
    },
    timeoutMs,
    // The batch workflow is one sequential stateful process; overlaps would race leases and items.
    isConcurrencySafe: backlinksIsConcurrencySafe,
    async execute(args: Record<string, unknown>, exec) {
      const action = readAction(args)
      let summary: string
      let data: JsonValue
      switch (action) {
        case 'batch_list': {
          const batches = await ctx.backlinks.listBatches(exec.signal)
          summary = `${batches.length} batch(es)`
          data = { batches: batches as unknown as JsonValue }
          break
        }
        case 'batch_get': {
          const detail = await ctx.backlinks.getBatch(readId(args, 'batchId'), exec.signal)
          summary = `${detail.batch.name}: ${detail.items.length} item(s)`
          data = detail as unknown as JsonValue
          break
        }
        case 'batch_claim': {
          const itemIds = Array.isArray(args.itemIds)
            ? args.itemIds.map(Number).filter(id => Number.isSafeInteger(id) && id > 0)
            : undefined
          const claim = await ctx.backlinks.claim(readId(args, 'batchId'), itemIds, exec.signal)
          summary = `lease ${claim.leaseId} over ${claim.items.length} item(s)`
          data = claim as unknown as JsonValue
          break
        }
        case 'lease_heartbeat': {
          const heartbeat = await ctx.backlinks.heartbeat(readId(args, 'leaseId'), exec.signal)
          summary = `lease ${heartbeat.leaseId} renewed`
          data = heartbeat as unknown as JsonValue
          break
        }
        case 'lease_release': {
          const leaseId = readId(args, 'leaseId')
          await ctx.backlinks.release(leaseId, exec.signal)
          summary = `lease ${leaseId} released`
          data = { leaseId }
          break
        }
        case 'item_result': {
          const result = parseItemResult(args)
          const outcome = await ctx.backlinks.reportItemResult(readId(args, 'itemId'), result, exec.signal)
          summary = `item ${outcome.itemStatus}`
          data = outcome as unknown as JsonValue
          break
        }
        case 'badge_add': {
          const badge: BacklinkBadgeInput = {
            name: readNonEmpty(args, 'name'),
            html: readNonEmpty(args, 'html'),
            ...args.isActive === undefined ? {} : { isActive: args.isActive !== false },
          }
          const outcome = await ctx.backlinks.addBadge(readId(args, 'websiteId'), badge, exec.signal)
          summary = `badge ${outcome.backlinkId} created; `
            + (outcome.callbackTriggered
              ? 'site refresh callback fired — still curl the site page to confirm the badge is live'
              : 'site refresh callback did NOT fire — curl the website footer refresh URL, then verify the badge on the live page')
          data = outcome as unknown as JsonValue
          break
        }
        case 'mailbox_create': {
          const localPart = readNonEmpty(args, 'localPart')
          if (!/^[a-z0-9][a-z0-9._-]*$/iu.test(localPart)) {
            throw new Error('backlinks localPart may contain only letters, digits, dots, underscores, and dashes.')
          }
          const address = await ctx.backlinks.createMailbox({
            localPart,
            domain: readNonEmpty(args, 'domain'),
          }, exec.signal)
          summary = address.email
          data = address as unknown as JsonValue
          break
        }
        case 'mail_wait': {
          const email = readNonEmpty(args, 'mailEmail')
          const waitTimeoutMs = args.waitTimeoutMs === undefined ? 120_000 : Number(args.waitTimeoutMs)
          if (!Number.isSafeInteger(waitTimeoutMs) || waitTimeoutMs <= 0) {
            throw new Error('backlinks waitTimeoutMs must be a positive integer.')
          }
          const subjectContains = readOptionalString(args, 'subjectContains')
          const fromContains = readOptionalString(args, 'fromContains')
          const mail = await ctx.backlinks.pollMail(
            { email },
            {
              ...subjectContains === undefined ? {} : { subjectContains },
              ...fromContains === undefined ? {} : { fromContains },
              timeoutMs: waitTimeoutMs,
              intervalMs: 5_000,
            },
            exec.signal,
          )
          summary = mail === null ? 'no matching mail before timeout' : (mail.subject || 'mail received')
          data = (mail ?? { timedOut: true }) as unknown as JsonValue
          break
        }
        default:
          return assertNever(action, `backlinks action must be one of ${ACTIONS.join(', ')}.`)
      }
      return { action, summary, data }
    },
    presentCall: presentBacklinksCall,
    presentResult: presentBacklinksResult,
  }))
}
