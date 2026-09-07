/** Bounded batch selection for model requests; provider detail remains intact. */

import type { BacklinkBatchDetail, BacklinkBatchItem } from '@deepseek-ai/dsh-backlinks'

/**
 * Select pending work while excluding every source already published in this batch.
 * @param detail - authoritative batch detail.
 * @param attempted - item ids already claimed in this running agent session.
 * @param scope - model-supplied selection: pending, retryable failures, or all eligible work (default).
 * @param itemIds - explicit candidate ids, selected before deduplicating eligible sources.
 * @returns eligible items in stable id order, excluding manual-required failures.
 */
export function pendingBatchItems(
  detail: BacklinkBatchDetail,
  attempted: ReadonlySet<number> = new Set(),
  scope: unknown = 'all',
  itemIds?: readonly number[],
): BacklinkBatchItem[] {
  if (scope !== 'all' && scope !== 'pending' && scope !== 'retryable') {
    throw new Error('backlinks scope must be all, pending, or retryable.')
  }
  const publishedSources = new Set(detail.items
    .filter(item => attempted.has(item.id) || item.publishedUrl || item.publishStatus === 'live' || item.publishStatus === 'submitted')
    .map(item => item.sourceId))
  const pending = detail.items.filter(item => !publishedSources.has(item.sourceId)
    && (itemIds === undefined || itemIds.includes(item.id))
    && ((scope !== 'retryable' && item.status === 'pending')
      || (scope !== 'pending' && item.status === 'failed' && item.failureMode === 'retryable')))
    .sort((left, right) => left.id - right.id)
  return pending.filter((item) => {
    if (publishedSources.has(item.sourceId)) return false
    publishedSources.add(item.sourceId)
    return true
  })
}

/**
 * Parse a bounded explicit item subset without silently discarding invalid ids.
 * @param value - model-supplied itemIds, or undefined for automatic selection.
 * @param maxItems - configured maximum subset size.
 * @returns unique ids, or undefined when selection is automatic.
 */
export function readItemIds(value: unknown, maxItems: number): number[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length === 0 || value.length > maxItems
    || value.some(id => typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error(`backlinks itemIds must contain 1-${maxItems} positive integer ids.`)
  }
  return [...new Set(value as number[])]
}

/**
 * Project batch counts or a bounded page of complete item records.
 * @param detail - authoritative provider detail.
 * @param args - model arguments; summary is the default view.
 * @param maxItems - maximum records returned in one item view.
 * @param attempted - ids already claimed by this running agent.
 * @returns the selected view; full detail requires an explicit view=all request.
 */
export function batchView(
  detail: BacklinkBatchDetail,
  args: Record<string, unknown>,
  maxItems: number,
  attempted?: ReadonlySet<number>,
): object {
  const view = args.view ?? 'summary'
  const ids = readItemIds(args.itemIds, maxItems)
  const scope = args.scope === undefined ? 'all' : args.scope
  const pending = pendingBatchItems(detail, attempted, scope)
  const selected = ids === undefined ? pending : ids.map((id) => {
    const item = detail.items.find(candidate => candidate.id === id)
    if (item === undefined) throw new Error(`backlinks batch ${detail.batch.id} has no item ${id}.`)
    return item
  })
  switch (view) {
    case 'summary':
      if (ids !== undefined) throw new Error('backlinks itemIds requires view=items.')
      return { batch: detail.batch, scope, eligibleCount: pending.length, nextItemIds: pending.slice(0, maxItems).map(item => item.id) }
    case 'items': {
      const afterItemId = args.afterItemId ?? 0
      if (typeof afterItemId !== 'number' || !Number.isSafeInteger(afterItemId) || afterItemId < 0) {
        throw new Error('backlinks afterItemId must be a non-negative integer.')
      }
      if (ids !== undefined && afterItemId !== 0) throw new Error('backlinks itemIds cannot be combined with afterItemId.')
      const remaining = selected.filter(item => item.id > afterItemId)
      const items = remaining.slice(0, maxItems)
      return {
        batch: detail.batch, scope, website: detail.website, anchors: detail.anchors, items,
        eligibleCount: pending.length,
        nextAfterItemId: remaining.length > items.length ? (items.at(-1)?.id ?? null) : null,
      }
    }
    case 'all':
      if (ids !== undefined) throw new Error('backlinks itemIds requires view=items.')
      return detail
    default:
      throw new Error('backlinks view must be summary, items, or all.')
  }
}
