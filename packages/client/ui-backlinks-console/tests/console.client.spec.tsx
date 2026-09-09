// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  const browsers = vi.fn(async () => ({ ok: true, value: {
    browsers: [{ id: 'playwright', available: true }, { id: 'site-a', available: true }, { id: 'site-b', available: true }],
    bindings: {},
  } }))
  const bindBrowser = vi.fn(async (_websiteId: number, _browserId: string) => ({ ok: true }))
  const addBrowser = vi.fn(async (_id: string, _kind: string, _location: string) => ({ ok: true }))
  ctx.provide('remote', { backlinksConsole: { batches, batch: detail, browsers, bindBrowser, addBrowser } } as never)
  ctx.provide('workspaces', { list: { getSnapshot: () => workspaceState }, connectWorkspace } as never)
  ctx.provide('sessions', { list: { getSnapshot: () => ({ current: 'existing' }) }, scope, open } as never)
  const store = createConsoleStore(ctx)
  const locale = new LocaleRuntime(ctx)
  locale.register('backlinksConsole', { zh, en })
  locale.setLocale('zh')
  return { store, batches, detail, send, open, connectWorkspace, scope, workspaceState, browsers, bindBrowser, addBrowser, t: locale.bind('backlinksConsole') }
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('publish batch console', () => {
  it('shows the latest 50 batches and reveals 50 more per click without another request', async () => {
    const b = bench()
    b.batches.mockResolvedValue({ ok: true, value: Array.from({ length: 125 }, (_, id) => batch(id + 1)) })
    render(<SidebarConsolePanel store={b.store} t={b.t} />)
    await screen.findByRole('checkbox', { name: '选择批次 #125 125.example' })
    expect(screen.getAllByRole('checkbox', { name: /^选择批次/ })).toHaveLength(50)
    expect(screen.queryByRole('checkbox', { name: '选择批次 #75 75.example' })).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: '全选当前列表' }))
    expect(b.store.store.getSnapshot().selectedBatchIds).toEqual(Array.from({ length: 50 }, (_, i) => 125 - i))
    fireEvent.click(screen.getByRole('button', { name: '加载更多（50 批）' }))
    expect(screen.getAllByRole('checkbox', { name: /^选择批次/ })).toHaveLength(100)
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: '全选当前列表' }).indeterminate).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '加载更多（50 批）' }))
    expect(screen.getAllByRole('checkbox', { name: /^选择批次/ })).toHaveLength(125)
    expect(screen.queryByRole('button', { name: '加载更多（50 批）' })).toBeNull()
    expect(b.batches).toHaveBeenCalledTimes(1)
    fireEvent.change(screen.getByPlaceholderText('搜索批次号或网站域名'), { target: { value: '1.example' } })
    expect(screen.getByRole('checkbox', { name: '选择批次 #1 1.example' })).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText('搜索批次号或网站域名'), { target: { value: '' } })
    expect(screen.getAllByRole('checkbox', { name: /^选择批次/ })).toHaveLength(50)
    expect(b.store.store.getSnapshot().selectedBatchIds).toHaveLength(50)
    expect(b.send).not.toHaveBeenCalled()
  })

  it.each([0, 49, 50])('omits load more for %i batches', async (count) => {
    const b = bench()
    b.batches.mockResolvedValue({ ok: true, value: Array.from({ length: count }, (_, id) => batch(id + 1)) })
    await b.store.refresh()
    render(<SidebarConsolePanel store={b.store} t={b.t} />)
    expect(screen.queryAllByRole('checkbox', { name: /^选择批次/ })).toHaveLength(count)
    expect(screen.queryByRole('button', { name: '加载更多（50 批）' })).toBeNull()
  })

  it('shares overlapping refreshes, reuses fresh data and permits forced refresh and retry', async () => {
    vi.useFakeTimers()
    const b = bench()
    let finish!: (value: Awaited<ReturnType<typeof b.batches>>) => void
    b.batches.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    const first = b.store.refresh()
    const overlapping = b.store.refresh()
    finish({ ok: true, value: [batch(424)] })
    await Promise.all([first, overlapping])
    expect(b.batches).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(29_999)
    await b.store.refresh(30_000)
    expect(b.batches).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await b.store.refresh(30_000)
    expect(b.batches).toHaveBeenCalledTimes(2)
    b.batches.mockRejectedValueOnce(new Error('offline'))
    await b.store.refresh()
    expect(b.store.store.getSnapshot()).toMatchObject({ status: 'error', error: 'offline' })
    expect(b.store.store.getSnapshot().batches).toHaveLength(3)
    await b.store.refresh(30_000)
    expect(b.batches).toHaveBeenCalledTimes(4)
    expect(b.store.store.getSnapshot()).toMatchObject({ status: 'ready', error: null })
  })

  it('pauses hidden polling, refreshes stale data on return and cleans up on unmount', async () => {
    vi.useFakeTimers()
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    const b = bench()
    await b.store.refresh()
    const view = render(<SidebarConsolePanel store={b.store} t={b.t} />)
    visibility.mockReturnValue('hidden')
    fireEvent(document, new Event('visibilitychange'))
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(b.batches).toHaveBeenCalledTimes(1)
    visibility.mockReturnValue('visible')
    await act(async () => { fireEvent(document, new Event('visibilitychange')) })
    expect(b.batches).toHaveBeenCalledTimes(2)
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(b.batches).toHaveBeenCalledTimes(3)
    view.unmount()
    await vi.advanceTimersByTimeAsync(30_000)
    fireEvent(document, new Event('visibilitychange'))
    expect(b.batches).toHaveBeenCalledTimes(3)
    render(<SidebarConsolePanel store={b.store} t={b.t} />)
    await act(async () => { await Promise.resolve() })
    expect(b.batches).toHaveBeenCalledTimes(4)
  })

  it.each([false, true])('shows all three zero counts with executing=%s', async (executing) => {
    const b = bench()
    b.batches.mockResolvedValue({ ok: true, value: [{
      ...batch(424), executing,
      counts: { pending: 0, executed: 0, failed: 0, skipped: 0, total: 0 },
    }] })
    render(<SidebarConsolePanel store={b.store} t={b.t} />)
    const row = await screen.findByRole('button', { name: /#424 424.example/ })
    expect(row.textContent).toContain('待 0成 0败 0')
  })

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
    expect(b.send).toHaveBeenCalledExactlyOnceWith('/backlink-publish 389 99\n浏览器分配：[{"batchId":389},{"batchId":99}]。仅处理这些批次，保留指定的 browserId。使用 backlink_publish_many 并行发布；同一浏览器或网站的批次由运行时排队。')
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


describe('browser selection in the publish panel', () => {
  it('starts with compact rows and preserves choices when concurrent controls are toggled', async () => {
    const b = bench()
    const { unmount } = render(<SidebarConsolePanel store={b.store} t={b.t} />)
    const row = await screen.findByRole('button', { name: /#389 389.example/ })
    expect(row.textContent).toContain('待 1成 1败 1')
    const toggle = screen.getByRole<HTMLInputElement>('checkbox', { name: '并发' })
    expect(toggle.checked).toBe(false)
    expect(screen.getAllByRole('checkbox')).toHaveLength(5)
    expect(screen.queryByRole('combobox', { name: '本次浏览器 #389' })).toBeNull()
    expect(screen.getAllByRole('button', { name: '发布' })).toHaveLength(3)
    fireEvent.click(toggle)
    fireEvent.change(screen.getByRole('combobox', { name: '本次浏览器 #389' }), { target: { value: 'site-b' } })
    fireEvent.click(screen.getByRole('checkbox', { name: '选择批次 #389 389.example' }))
    expect(screen.getAllByRole('button', { name: '发布' })).toHaveLength(3)
    fireEvent.click(toggle)
    expect(screen.getAllByRole('checkbox')).toHaveLength(5)
    expect(screen.getByRole('button', { name: '批量发布 (1)' }).hasAttribute('disabled')).toBe(false)
    expect(screen.queryByRole('button', { name: '绑定网站' })).toBeNull()
    expect(screen.queryByRole('combobox', { name: '本次浏览器 #389' })).toBeNull()
    fireEvent.click(toggle)
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: '本次浏览器 #389' }).value).toBe('site-b')
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: '选择批次 #389 389.example' }).checked).toBe(true)
    expect(b.send).not.toHaveBeenCalled()
    expect(b.bindBrowser).not.toHaveBeenCalled()
    unmount()
    render(<SidebarConsolePanel store={b.store} t={b.t} />)
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: '并发' }).checked).toBe(true)
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: '本次浏览器 #389' }).value).toBe('site-b')
  })

  it('publishes one batch from compact mode', async () => {
    const b = bench()
    render(<SidebarConsolePanel store={b.store} t={b.t} />)
    fireEvent.click((await screen.findAllByRole('button', { name: '发布' }))[0]!)
    await waitFor(() => { expect(b.send).toHaveBeenCalledExactlyOnceWith('/backlink-publish 389') })
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: '并发' }).checked).toBe(false)
  })

  it('uses saved website defaults and includes explicit overrides in the submitted request', async () => {
    const b = bench()
    b.browsers.mockResolvedValueOnce({ ok: true, value: {
      browsers: [{ id: 'site-a', available: true }, { id: 'site-b', available: true }], bindings: { 389: 'site-a', 99: 'site-a' },
    } })
    await b.store.refresh()
    b.store.selectBrowser(99, 'site-b')
    b.store.selectBatches([389, 99], true)
    await b.store.publishSelected()
    expect(b.send).toHaveBeenCalledWith(expect.stringContaining('[{"batchId":389,"browserId":"site-a"},{"batchId":99,"browserId":"site-b"}]'))
    expect(b.bindBrowser).not.toHaveBeenCalled()
  })

  it('saves a website binding through the backend and clears it explicitly', async () => {
    const b = bench()
    render(<SidebarConsolePanel store={b.store} t={b.t} />)
    fireEvent.click(screen.getByRole('checkbox', { name: '并发' }))
    const select = await screen.findByRole('combobox', { name: '本次浏览器 #389' })
    fireEvent.change(select, { target: { value: 'site-b' } })
    fireEvent.click(screen.getAllByRole('button', { name: '绑定网站' })[0]!)
    await waitFor(() => { expect(b.bindBrowser).toHaveBeenCalledWith(389, 'site-b') })
    await waitFor(() => { expect(b.store.store.getSnapshot().browserBindings[389]).toBe('site-b') })
    fireEvent.click(screen.getByRole('button', { name: '解除绑定' }))
    await waitFor(() => { expect(b.bindBrowser).toHaveBeenCalledWith(389, '') })
  })

  it('adds an existing browser connection and reports persistence errors', async () => {
    const b = bench()
    render(<SidebarConsolePanel store={b.store} t={b.t} />)
    fireEvent.change(screen.getByLabelText('浏览器名称'), { target: { value: 'personal' } })
    fireEvent.change(screen.getByLabelText('浏览器类型'), { target: { value: 'cdp' } })
    fireEvent.change(screen.getByLabelText('本机调试地址'), { target: { value: 'http://127.0.0.1:9222' } })
    fireEvent.click(screen.getByRole('button', { name: '保存浏览器' }))
    await waitFor(() => { expect(b.addBrowser).toHaveBeenCalledWith('personal', 'cdp', 'http://127.0.0.1:9222') })
    await waitFor(() => { expect(b.store.store.getSnapshot().savingBrowser).toBe(false) })
    b.bindBrowser.mockRejectedValueOnce(new Error('disk is read-only'))
    await b.store.bindBrowser(389, 'site-a')
    expect(b.store.store.getSnapshot().browserBindings[389]).toBeUndefined()
    expect(screen.getByRole('alert').textContent).toContain('disk is read-only')
  })
})
