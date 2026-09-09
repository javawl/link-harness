/**
 * Console data, batch selection, and submission into a workspace's blank
 * session. Components own refresh timers; submission is serialized here.
 */

import type { BacklinkBatchDetail, BacklinkBatchSummary } from '@deepseek-ai/dsh-backlinks/types'
// Type-only: pulls the backlinksConsole Remote namespace declaration into this
// program so ctx.remote.backlinksConsole typechecks.
import type {} from '@deepseek-ai/dsh-backlinks-console/remote'
// Type-only: the conversation face's Context merge (ctx…conversation.send).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'

/** What the publish panel renders. */
export interface ConsoleViewState {
  open: boolean
  concurrent: boolean
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  batches: readonly BacklinkBatchSummary[]
  /** Expanded batch id → its detail (loaded lazily on first expand). */
  details: Record<number, BacklinkBatchDetail>
  browsers: readonly { id: string; available: boolean }[]
  browserBindings: Record<string, string>
  browserOverrides: Record<number, string>
  savingBrowser: boolean
  selectedBatchIds: readonly number[]
  /** Batch ids being submitted to Harness (null when no submission is pending). */
  publishing: readonly number[] | null
}

/** The console store face: snapshot feed plus actions. */
export interface ConsoleStore {
  readonly store: SnapshotStore<ConsoleViewState>
  open(): void
  close(): void
  /**
   * Refresh batch summaries and browser choices, sharing any in-flight read.
   * @param maxAgeMs - reuse successful data younger than this age; defaults to 0 for a forced refresh.
   * @returns after the read settles or fresh data is reused; errors stay in view state.
   */
  refresh(maxAgeMs?: number): Promise<void>
  toggleDetail(batchId: number): Promise<void>
  /**
   * Keep the browser-control visibility choice across sidebar remounts.
   * @param concurrent - whether to show browser assignment and binding controls.
   */
  setConcurrent(concurrent: boolean): void
  /**
   * Select or deselect listed batches; ignored while submission is pending.
   * @param batchIds - batch ids to update; unknown ids are ignored.
   * @param selected - whether to include the batches in the next submission.
   */
  selectBatches(batchIds: readonly number[], selected: boolean): void
  /**
   * Submit one batch into a blank session; failures appear in the panel.
   * @param batchId - batch to publish.
   */
  publish(batchId: number): Promise<void>
  /** Set this batch's browser override; empty uses the saved website default. */
  selectBrowser(batchId: number, browserId: string): void
  /** Save the selected browser as this website's default; empty clears it. */
  bindBrowser(websiteId: number, browserId: string): Promise<void>
  /** Register a named browser through the provider's persistent configuration. */
  addBrowser(id: string, kind: 'profile' | 'cdp', location: string): Promise<void>
  /** Submit the selection as one Harness request with fixed browser assignments. */
  publishSelected(): Promise<void>
}

/**
 * Build the console store over the client context.
 * @param ctx - client root context carrying the Remote and sessions domains.
 * @returns the store handle the sidebar components consume.
 */
export function createConsoleStore(ctx: ClientContext): ConsoleStore {
  let refreshedAt: number | undefined
  let refreshing: Promise<void> | undefined
  const store = createSnapshotStore<ConsoleViewState>({
    open: false,
    concurrent: false,
    status: 'idle',
    error: null,
    batches: [],
    details: {},
    browsers: [], browserBindings: {}, browserOverrides: {}, savingBrowser: false,
    selectedBatchIds: [],
    publishing: null,
  })

  const readBatches = async (): Promise<readonly BacklinkBatchSummary[]> => {
    const result = await ctx.remote.backlinksConsole.batches()
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
    return [...result.value].sort((a, b) => b.id - a.id)
  }

  const readBatch = async (batchId: number): Promise<BacklinkBatchDetail> => {
    const result = await ctx.remote.backlinksConsole.batch(batchId)
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
    return result.value
  }

  const publishBatches = async (batchIds: readonly number[]): Promise<void> => {
    if (store.getSnapshot().publishing !== null || batchIds.length === 0) return
    const ids = [...new Set(batchIds)].sort((a, b) => b - a)
    const state = store.getSnapshot()
    const batches = ids.map((batchId) => {
      const batch = state.batches.find(value => value.id === batchId)
      const browserId = state.browserOverrides[batchId]
          || (batch === undefined ? undefined : state.browserBindings[batch.websiteId])
      return { batchId, ...browserId ? { browserId } : {} }
    })
    store.update((state) => { state.publishing = ids; state.error = null })
    try {
      const current = ctx.sessions.list.getSnapshot().current
      const workspaces = ctx.workspaces.list.getSnapshot()
      const workspaceId = workspaces.items.find(item => current !== undefined && item.sessionIds.includes(current))?.workspaceId
        ?? workspaces.recentWorkspaceId
      if (workspaceId === undefined) throw new Error('publish: select a workspace first')
      const sessionId = await ctx.workspaces.connectWorkspace(workspaceId)
      const scope = ctx.sessions.scope(sessionId)
      if (scope === undefined) throw new Error('publish: new session is unavailable')
      const command = `/backlink-publish ${ids.join(' ')}`
        + (ids.length > 1 || batches.some(batch => batch.browserId !== undefined)
          ? `\n浏览器分配：${JSON.stringify(batches)}。仅处理这些批次，保留指定的 browserId。${ids.length > 1
            ? '使用 backlink_publish_many 并行发布；同一浏览器或网站的批次由运行时排队。' : '使用 backlink_publish 发布。'}` : '')
      await scope.inject(['conversation'], async (bound) => {
        await bound.conversation.send(command)
      })
      ctx.sessions.open(sessionId)
      store.update((state) => {
        state.selectedBatchIds = state.selectedBatchIds.filter(id => !ids.includes(id))
        state.open = false
      })
    } catch (error) {
      store.update((state) => {
        state.error = error instanceof Error ? error.message : String(error)
      })
    } finally {
      store.update((state) => { state.publishing = null })
    }
  }

  return {
    store,
    open(): void {
      store.update((state) => { state.open = true })
      void this.refresh()
    },
    close(): void {
      store.update((state) => { state.open = false })
    },
    refresh(maxAgeMs = 0): Promise<void> {
      if (refreshing !== undefined) return refreshing
      if (store.getSnapshot().status === 'ready' && refreshedAt !== undefined && Date.now() - refreshedAt < maxAgeMs) {
        return Promise.resolve()
      }
      refreshing = Promise.resolve().then(async () => {
        store.update((state) => { state.status = 'loading'; state.error = null })
        try {
          const [batches, browserResult] = await Promise.all([readBatches(), ctx.remote.backlinksConsole.browsers()])
          if (!browserResult.ok) throw new Error(`${browserResult.error.code}: ${browserResult.error.message}`)
          refreshedAt = Date.now()
          store.update((state) => {
            state.batches = batches
            state.browsers = browserResult.value.browsers
            state.browserBindings = browserResult.value.bindings
            state.selectedBatchIds = state.selectedBatchIds.filter(id => batches.some(batch => batch.id === id))
            state.status = 'ready'
          })
        } catch (error) {
          store.update((state) => {
            state.status = 'error'
            state.error = error instanceof Error ? error.message : String(error)
          })
        }
      }).finally(() => { refreshing = undefined })
      return refreshing
    },
    async toggleDetail(batchId: number): Promise<void> {
      if (store.getSnapshot().details[batchId] !== undefined) {
        store.update((state) => {
          const { [batchId]: _removed, ...details } = state.details
          state.details = details
        })
        return
      }
      try {
        const detail = await readBatch(batchId)
        store.update((state) => { state.details[batchId] = detail })
      } catch (error) {
        store.update((state) => {
          state.error = error instanceof Error ? error.message : String(error)
        })
      }
    },
    setConcurrent(concurrent): void {
      store.update((state) => { state.concurrent = concurrent })
    },
    selectBatches(batchIds, selected): void {
      if (store.getSnapshot().publishing !== null) return
      store.update((state) => {
        const ids = new Set(state.selectedBatchIds)
        for (const id of batchIds) {
          if (selected && state.batches.some(batch => batch.id === id)) ids.add(id)
          else ids.delete(id)
        }
        state.selectedBatchIds = [...ids].sort((a, b) => b - a)
      })
    },
    selectBrowser(batchId, browserId): void {
      if (store.getSnapshot().publishing !== null) return
      store.update((state) => { state.browserOverrides[batchId] = browserId })
    },
    async bindBrowser(websiteId, browserId): Promise<void> {
      if (store.getSnapshot().savingBrowser) return
      store.update((state) => { state.savingBrowser = true; state.error = null })
      try {
        const result = await ctx.remote.backlinksConsole.bindBrowser(websiteId, browserId)
        if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
        store.update((state) => { state.browserBindings[websiteId] = browserId })
      } catch (error) {
        store.update((state) => { state.error = error instanceof Error ? error.message : String(error) })
      } finally {
        store.update((state) => { state.savingBrowser = false })
      }
    },
    async addBrowser(id, kind, location): Promise<void> {
      if (store.getSnapshot().savingBrowser) return
      store.update((state) => { state.savingBrowser = true; state.error = null })
      try {
        const result = await ctx.remote.backlinksConsole.addBrowser(id, kind, location)
        if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
        await this.refresh()
      } catch (error) {
        store.update((state) => { state.error = error instanceof Error ? error.message : String(error) })
      } finally {
        store.update((state) => { state.savingBrowser = false })
      }
    },
    async publish(batchId): Promise<void> {
      await publishBatches([batchId])
    },
    async publishSelected(): Promise<void> {
      await publishBatches(store.getSnapshot().selectedBatchIds)
    },
  }
}
