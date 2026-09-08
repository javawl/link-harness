import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import BrowserRuntime from '@deepseek-ai/dsh-browser'
import BacklinksRuntime from '@deepseek-ai/dsh-backlinks'
import * as Playwright from '@deepseek-ai/dsh-browser-playwright'
import { FileSettingsProvider } from '@deepseek-ai/dsh-settings-file'

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
  it('shows newer batch ids first even when their planned date is older', async () => {
    const { runtime, listBatches } = mountConsole()
    const batches = [summary, { ...summary, id: 400, plannedAt: '2026-08-01' }, { ...summary, id: 395 }]
    listBatches.mockResolvedValueOnce(batches)
    expect((await runtime.batches()).map(batch => batch.id)).toEqual([400, 395, 176])
    expect(batches.map(batch => batch.id)).toEqual([176, 400, 395])
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


describe('persistent browser configuration', () => {
  it('adds isolated profiles and connections, rejects aliases, and restores website bindings', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'browser-bindings-'))
    const mount = async () => {
      const ctx = new Context()
      await ctx.plugin(FileSettingsProvider, { path: join(directory, 'settings.yaml'), watch: false })
      await ctx.plugin(BrowserRuntime, { provider: 'playwright' })
      await ctx.plugin(BacklinksRuntime)
      await ctx.plugin(Playwright, { userDataDir: join(directory, 'default') })
      ctx.backlinks.registerBatchSourceProvider({
        id: 'fixture', available: () => true, listBatches: async () => [summary], getBatch: async () => detail,
        claim: async () => { throw new Error('unexpected claim') },
        heartbeat: async () => { throw new Error('unexpected heartbeat') }, release: async () => {},
        reportItemResult: async () => { throw new Error('unexpected result') },
        addBadge: async () => { throw new Error('unexpected badge') }, tagSource: async () => { throw new Error('unexpected tags') },
      })
      return { ctx, console: new BacklinksConsoleRuntime(ctx) }
    }
    let current = await mount()
    try {
      await current.console.addBrowser('site-a', 'profile', join(directory, 'a'))
      await current.console.addBrowser('site-b', 'cdp', 'http://localhost:9222')
      await expect(current.console.addBrowser('same-dir', 'profile', join(directory, 'a', '..', 'a'))).rejects.toThrow(/distinct/)
      await expect(current.console.addBrowser('same-port', 'cdp', 'http://127.0.0.1:9222/')).rejects.toThrow(/distinct/)
      await expect(current.console.addBrowser('remote', 'cdp', 'https://untrusted.example/')).rejects.toThrow(/local HTTP/)
      await expect(current.console.addBrowser('site-a', 'profile', join(directory, 'c'))).rejects.toThrow(/distinct/)
      await expect(current.console.bindBrowser(82, 'missing')).rejects.toThrow(/not registered/)
      await expect(current.console.bindBrowser(999, 'site-a')).rejects.toThrow(/not present/)
      await current.console.bindBrowser(82, 'site-a')
      expect((await current.console.browsers()).bindings).toEqual({ 82: 'site-a' })
      expect(current.ctx.browser.hasSession('site-a')).toBe(false)
      await current.ctx.fiber.dispose()
      current = await mount()
      expect((await current.console.browsers()).browsers.map(browser => browser.id)).toEqual(['playwright', 'site-a', 'site-b'])
      expect((await current.console.browsers()).bindings).toEqual({ 82: 'site-a' })
      await current.console.bindBrowser(82, '')
      expect((await current.console.browsers()).bindings).toEqual({ 82: '' })
    } finally {
      await current.ctx.fiber.dispose()
      await rm(directory, { recursive: true, force: true })
    }
  })
})
