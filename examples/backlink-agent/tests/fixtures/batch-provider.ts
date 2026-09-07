/** Deterministic external batch backend for the assembled, keyless budget scenario. */

import type { Context } from '@deepseek-ai/cordis'
import type { BacklinkBatchDetail, BacklinkBatchItem } from '@deepseek-ai/dsh-backlinks'

export const inject = ['backlinks']

/** Batch size for the large-context and small-completion scenarios. */
export interface Config {
  readonly itemCount?: number
}

/**
 * Register a deterministic backend with durable-result semantics and no external requests.
 * @param ctx - Loader context carrying the real backlinks service.
 * @param config - fixture size; defaults to the 725-item budget case.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const itemCount = config.itemCount ?? 725
  if (!Number.isSafeInteger(itemCount) || itemCount < 1) throw new Error('fixture itemCount must be a positive integer')
  let items: BacklinkBatchItem[] = Array.from({ length: itemCount }, (_, index) => ({
    id: index + 1, sourceId: index + 1, sourceName: `directory-${index + 1}`,
    sourceUrl: `https://directory-${index + 1}.test`, sourceHost: `directory-${index + 1}.test`,
    submitUrl: null, sourceNotes: null, category: 'directory', tags: [], paymentType: 'free',
    linkType: 'dofollow', status: 'pending', failureMode: null, failureReason: null,
    publishedUrl: null, publishStatus: null, plannedAt: '2026-09-05',
  }))
  const detail = (): BacklinkBatchDetail => ({
    batch: { id: 176, name: 'Budget batch', websiteId: 82, websiteName: 'site', websiteHost: 'site.test',
      plannedAt: '2026-09-05', counts: { pending: items.filter(item => item.status === 'pending').length,
        executed: 0, skipped: 0, failed: items.filter(item => item.status === 'failed').length, total: itemCount }, executing: false },
    website: { id: 82, name: 'site', siteUrl: 'https://site.test', siteHost: 'site.test' },
    anchors: [{ id: 1, anchorText: 'Site', targetUrl: 'https://site.test' }], items,
  })
  ctx.backlinks.registerBatchSourceProvider({
    id: 'snapshot', available: () => true,
    listBatches: async () => [detail().batch,
      { ...detail().batch, id: 400, plannedAt: '2026-09-04' },
      { ...detail().batch, id: 395, plannedAt: '2026-09-04' }],
    getBatch: async () => detail(),
    claim: async (_batch, ids) => ({ leaseId: 900, leaseExpiresAt: 'server-clock', items: items.filter(item => ids?.includes(item.id)) }),
    heartbeat: async leaseId => ({ leaseId, leaseExpiresAt: 'server-clock' }),
    release: async () => {},
    reportItemResult: async (id, result) => {
      if (result.status !== 'failed') throw new Error('snapshot expects a stopped item')
      items = items.map(item => item.id === id ? { ...item, status: 'failed', failureMode: result.failureMode, failureReason: result.failureReason } : item)
      return { itemStatus: 'failed', publishRecordId: null }
    },
    addBadge: async () => { throw new Error('snapshot must not add badges') },
    tagSource: async () => { throw new Error('snapshot must not tag sources') },
  })
}
