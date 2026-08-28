import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'

import { BacklinksConsoleRuntime } from '@deepseek-ai/dsh-backlinks-console/src/index.ts'
import { apply } from '@deepseek-ai/dsh-backlinks-console/src/invariant.ts'
import type { BacklinkBatchDetail, BacklinkBatchSummary } from '@deepseek-ai/dsh-backlinks/types'

const summary: BacklinkBatchSummary = {
  id: 176,
  name: 'PB-1',
  websiteId: 82,
  websiteName: 'site',
  websiteHost: 'site.com',
  plannedAt: '2026-08-25',
  counts: { pending: 1, executed: 2, skipped: 0, failed: 1, total: 4 },
  executing: true,
}

const detail: BacklinkBatchDetail = {
  batch: summary,
  website: { id: 82, name: 'site', siteUrl: 'https://site.com', siteHost: 'site.com' },
  anchors: [],
  items: [],
}

function mountConsole() {
  const listBatches = vi.fn(async () => [summary])
  const getBatch = vi.fn(async (batchId: number) => {
    if (batchId !== 176) throw new Error('no such batch')
    return detail
  })
  const ctx = new Context()
  const backlinks = { listBatches, getBatch }
  Object.defineProperty(ctx, 'backlinks', { value: backlinks })
  const runtime = new BacklinksConsoleRuntime(ctx)
  mounted.push({ ctx })
  return { runtime, listBatches, getBatch, ctx }
}

const mounted: { ctx: Context }[] = []

afterEach(async () => {
  for (const { ctx } of mounted.splice(0)) await ctx.root.fiber.dispose()
})

describe('BacklinksConsoleRuntime', () => {
  it('passes batch listing straight through the seam', async () => {
    const { runtime, listBatches } = mountConsole()
    await expect(runtime.batches()).resolves.toEqual([summary])
    expect(listBatches).toHaveBeenCalledTimes(1)
  })

  it('passes one batch detail through the seam', async () => {
    const { runtime, getBatch } = mountConsole()
    await expect(runtime.batch(176)).resolves.toBe(detail)
    expect(getBatch).toHaveBeenCalledWith(176)
  })

  it('surfaces seam failures unchanged', async () => {
    const { runtime } = mountConsole()
    await expect(runtime.batch(999)).rejects.toThrow('no such batch')
  })
})

describe('invariant companion', () => {
  it('registers package ownership with a no-op install', async () => {
    const register = vi.fn(() => () => undefined)
    const dispose = await apply({ invariants: { register } } as never)
    expect(register).toHaveBeenCalledWith('@deepseek-ai/dsh-backlinks-console', expect.any(Function))
    dispose()
  })
})
