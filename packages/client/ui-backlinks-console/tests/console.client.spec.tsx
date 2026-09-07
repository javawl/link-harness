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
  const open = vi.fn()
  const connectWorkspace = vi.fn(async (_id: string) => 'blank')
  const scope = vi.fn(() => ({
    inject: async (_keys: string[], callback: (bound: { conversation: { send: typeof send } }) => Promise<void>) => {
      await callback({ conversation: { send } })
    },
  }))
  const batches = vi.fn(async () => ({ ok: true, value: [batch(99), batch(389), batch(100)] }))
  const detail = vi.fn(async (id: number) => ({ ok: true, value: {
    batch: batch(id), items: ['executed', 'failed', 'skipped'].map((status, index) => ({
      id: index, sourceHost: `${status}.example`, status,
    })),
  } }))
  const workspaceState = {
    items: [{ workspaceId: 'current-workspace', sessionIds: ['existing'] }],
    recentWorkspaceId: 'recent-workspace',
  }
  ctx.provide('remote', { backlinksConsole: { batches, batch: detail } } as never)
  ctx.provide('workspaces', { list: { getSnapshot: () => workspaceState }, connectWorkspace } as never)
  ctx.provide('sessions', { list: { getSnapshot: () => ({ current: 'existing' }) }, scope, open } as never)
  const store = createConsoleStore(ctx)
  const locale = new LocaleRuntime(ctx)
  locale.register('backlinksConsole', { zh, en })
  locale.setLocale('zh')
  return { store, batches, detail, send, open, connectWorkspace, scope, workspaceState, t: locale.bind('backlinksConsole') }
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
    b.connectWorkspace.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    const pending = b.store.publishSelected()
    await b.store.publish(100)
    b.store.selectBatches([100], true)
    expect(b.send).not.toHaveBeenCalled()
    expect(b.store.store.getSnapshot().selectedBatchIds).toEqual([389, 99])
    finish('new-blank')
    await pending
    expect(b.connectWorkspace).toHaveBeenCalledExactlyOnceWith('current-workspace')
    expect(b.scope).toHaveBeenCalledExactlyOnceWith('new-blank')
    expect(b.send).toHaveBeenCalledExactlyOnceWith('/backlink-publish 389 99\n请按以上批次号顺序依次发布，仅处理这些批次。')
    expect(b.open).toHaveBeenCalledExactlyOnceWith('new-blank')
    expect(b.store.store.getSnapshot()).toMatchObject({ selectedBatchIds: [], publishing: null, error: null })
  })

  it('retains selected batches after a failed send and permits retry', async () => {
    const b = bench()
    await b.store.refresh()
    b.store.selectBatches([389, 100], true)
    b.send.mockRejectedValueOnce(new Error('submission rejected'))
    await b.store.publishSelected()
    expect(b.store.store.getSnapshot()).toMatchObject({ selectedBatchIds: [389, 100], publishing: null, error: 'submission rejected' })
    expect(b.open).not.toHaveBeenCalled()
    await b.store.publishSelected()
    expect(b.send).toHaveBeenCalledTimes(2)
    expect(b.store.store.getSnapshot()).toMatchObject({ selectedBatchIds: [], error: null })
  })

  it('keeps single-batch commands and ignores an empty batch selection', async () => {
    const b = bench()
    await b.store.publishSelected()
    expect(b.connectWorkspace).not.toHaveBeenCalled()
    await b.store.publish(100)
    expect(b.send).toHaveBeenCalledExactlyOnceWith('/backlink-publish 100')
  })

  it('reports connection failures without submitting to the current session', async () => {
    const b = bench()
    b.connectWorkspace.mockRejectedValueOnce(new Error('connection failed'))
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
