// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BacklinkBatchSummary } from '@deepseek-ai/dsh-backlinks/types'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { createConsoleStore } from '../src/client/store.ts'
import { SidebarConsolePanel } from '../src/client/SidebarPanel.tsx'
import { en, zh } from '../src/client/locales.ts'
import type {} from '../src/client/index.ts'

function batch(id: number): BacklinkBatchSummary {
  return {
    id, name: `Batch ${String(id)}`, websiteId: id, websiteName: `Site ${String(id)}`,
    websiteHost: `${String(id)}.example`, plannedAt: '2026-09-05', executing: false,
    counts: { pending: 1, executed: 1, skipped: 1, failed: 1, total: 4 },
  }
}

function bench() {
  const ctx = new Context()
  const send = vi.fn(async (_text: string) => {})
  const openSession = vi.fn()
  const create = vi.fn(async (_opts: { workspaceId: string }) => 'blank')
  // Faithful to the real contract: send goes through a retained reference's
  // scoped conversation face, not a bare scope() borrow of a just-created
  // (never-retained) session.
  let sessionSnapshot: { openState: string; openError?: Error } = { openState: 'open' }
  const using = vi.fn(async (
    _target: string,
    _options: { source: string },
    operation: (reference: {
      ready: Promise<unknown>
      binding: {
        session: { getSnapshot: () => typeof sessionSnapshot }
        ctx: { inject: (keys: string[], callback: (scoped: { conversation: { send: typeof send } }) => Promise<void>) => Promise<void> }
      }
    }) => Promise<void>,
  ) => {
    await operation({
      ready: Promise.resolve(),
      binding: {
        session: { getSnapshot: () => sessionSnapshot },
        ctx: { inject: async (_keys, callback) => { await callback({ conversation: { send } }) } },
      },
    })
  })
  const batches = vi.fn(async () => ({ ok: true, value: [batch(99), batch(389), batch(100)] }))
  const detail = vi.fn(async (id: number) => ({ ok: true, value: {
    batch: batch(id), items: ['executed', 'failed', 'skipped'].map((status, index) => ({
      id: index, sourceHost: `${status}.example`, status,
    })),
  } }))
  const workspaceState = {
    items: [{ workspaceId: 'current-workspace', sessionIds: ['existing'], createdAt: '2026-01-01T00:00:00Z' }],
    archivedSessionIds: [],
    pinnedSessionIds: [],
    state: 'idle',
    phase: 'ready',
    error: null,
  }
  const sessionState = { ids: ['existing'], byId: { existing: { id: 'existing', updatedAt: 1 } }, phase: 'ready', projectionsBySession: {} }
  ctx.provide('remote', { backlinksConsole: { batches, batch: detail } } as never)
  ctx.provide('workspaces', { list: { getSnapshot: () => workspaceState } } as never)
  ctx.provide('sessions', { list: { getSnapshot: () => sessionState }, create, using } as never)
  ctx.provide('uiWorkspace', { openSession } as never)
  const store = createConsoleStore(ctx)
  const locale = new LocaleRuntime(ctx)
  locale.register('backlinksConsole', { zh, en })
  locale.setLocale('zh')
  return {
    store, batches, detail, send, openSession, create, using, workspaceState,
    setSessionSnapshot: (next: typeof sessionSnapshot) => { sessionSnapshot = next },
    t: locale.bind('backlinksConsole'),
  }
}

afterEach(cleanup)

describe('publish batch console', () => {
  it('sorts numeric ids on every refresh and drops only removed selections', async () => {
    const b = bench()
    await b.store.refresh()
    expect(b.store.store.getSnapshot().batches.map(item => item.id)).toEqual([389, 100, 99])
    b.store.selectBatches([99, 389, 999], true)
    b.batches.mockResolvedValueOnce({ ok: true, value: [batch(100), batch(99)] })
    await b.store.refresh()
    expect(b.store.store.getSnapshot().batches.map(item => item.id)).toEqual([100, 99])
    expect(b.store.store.getSnapshot().selectedBatchIds).toEqual([99])
  })

  it('submits selected ids once, into the connected blank session, while navigation still points at an old session', async () => {
    const b = bench()
    await b.store.refresh()
    b.store.selectBatches([99, 389, 99], true)
    let finish!: (id: string) => void
    b.create.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    const pending = b.store.publishSelected()
    await b.store.publish(100)
    b.store.selectBatches([100], true)
    expect(b.send).not.toHaveBeenCalled()
    expect(b.store.store.getSnapshot().selectedBatchIds).toEqual([389, 99])
    finish('new-blank')
    await pending
    expect(b.create).toHaveBeenCalledExactlyOnceWith({ workspaceId: 'current-workspace' })
    expect(b.using).toHaveBeenCalledExactlyOnceWith('new-blank', { source: 'backlinksConsole' }, expect.any(Function))
    expect(b.send).toHaveBeenCalledExactlyOnceWith('/backlink-publish 389 99\n请按以上批次号顺序依次发布，仅处理这些批次。')
    expect(b.openSession).toHaveBeenCalledExactlyOnceWith('new-blank')
    expect(b.store.store.getSnapshot()).toMatchObject({ selectedBatchIds: [], publishing: null, error: null })
  })

  it('reports a blank session whose initial open failed and never sends', async () => {
    const b = bench()
    await b.store.refresh()
    b.store.selectBatches([389], true)
    b.setSessionSnapshot({ openState: 'error', openError: new Error('host refused the open') })
    await b.store.publishSelected()
    expect(b.send).not.toHaveBeenCalled()
    expect(b.openSession).not.toHaveBeenCalled()
    expect(b.store.store.getSnapshot()).toMatchObject({ selectedBatchIds: [389], publishing: null, error: 'host refused the open' })
  })

  it('retains selected batches after a failed send and permits retry', async () => {
    const b = bench()
    await b.store.refresh()
    b.store.selectBatches([389, 100], true)
    b.send.mockRejectedValueOnce(new Error('submission rejected'))
    await b.store.publishSelected()
    expect(b.store.store.getSnapshot()).toMatchObject({ selectedBatchIds: [389, 100], publishing: null, error: 'submission rejected' })
    expect(b.openSession).not.toHaveBeenCalled()
    await b.store.publishSelected()
    expect(b.send).toHaveBeenCalledTimes(2)
    expect(b.store.store.getSnapshot()).toMatchObject({ selectedBatchIds: [], error: null })
  })

  it('keeps single-batch commands and ignores an empty batch selection', async () => {
    const b = bench()
    await b.store.publishSelected()
    expect(b.create).not.toHaveBeenCalled()
    await b.store.publish(100)
    expect(b.send).toHaveBeenCalledExactlyOnceWith('/backlink-publish 100')
  })

  it('reports connection failures without submitting to the current session', async () => {
    const b = bench()
    b.create.mockRejectedValueOnce(new Error('connection failed'))
    await b.store.publish(389)
    expect(b.send).not.toHaveBeenCalled()
    expect(b.store.store.getSnapshot()).toMatchObject({ publishing: null, error: 'connection failed' })
  })

  it('selects filtered rows independently of expansion and preserves hidden selections', async () => {
    const b = bench()
    render(<SidebarConsolePanel store={b.store} t={b.t} />)
    const select389 = await screen.findByRole('checkbox', { name: '选择批次 #389 389.example' })
    fireEvent.click(select389)
    expect(b.detail).not.toHaveBeenCalled()
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: '全选当前列表' }).indeterminate).toBe(true)
    fireEvent.change(screen.getByPlaceholderText('搜索批次号或网站域名'), { target: { value: '100' } })
    fireEvent.click(screen.getByRole('checkbox', { name: '全选当前列表' }))
    expect(b.store.store.getSnapshot().selectedBatchIds).toEqual([389, 100])
    fireEvent.click(screen.getByRole('checkbox', { name: '全选当前列表' }))
    expect(b.store.store.getSnapshot().selectedBatchIds).toEqual([389])
    fireEvent.change(screen.getByPlaceholderText('搜索批次号或网站域名'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /#389 389.example/ }))
    expect((await screen.findByText('executed')).getAttribute('data-status')).toBe('executed')
    fireEvent.click(screen.getByRole('button', { name: '批量发布 (1)' }))
    await waitFor(() => { expect(b.send).toHaveBeenCalledWith('/backlink-publish 389') })
    expect(screen.getByRole('button', { name: '批量发布 (0)' }).hasAttribute('disabled')).toBe(true)
  })
})
