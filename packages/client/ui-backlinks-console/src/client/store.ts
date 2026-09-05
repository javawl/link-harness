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
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  batches: readonly BacklinkBatchSummary[]
  /** Expanded batch id → its detail (loaded lazily on first expand). */
  details: Record<number, BacklinkBatchDetail>
  selectedBatchIds: readonly number[]
  /** Batch ids being submitted to Harness (null when no submission is pending). */
  publishing: readonly number[] | null
}

/** The console store face: snapshot feed plus actions. */
export interface ConsoleStore {
  readonly store: SnapshotStore<ConsoleViewState>
  open(): void
  close(): void
  refresh(): Promise<void>
  toggleDetail(batchId: number): Promise<void>
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
  /** Submit the selection in descending id order as one Harness request. */
  publishSelected(): Promise<void>
}

/**
 * Build the console store over the client context.
 * @param ctx - client root context carrying the Remote and sessions domains.
 * @returns the store handle the sidebar components consume.
 */
export function createConsoleStore(ctx: ClientContext): ConsoleStore {
  const store = createSnapshotStore<ConsoleViewState>({
    open: false,
    status: 'idle',
    error: null,
    batches: [],
    details: {},
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
        + (ids.length > 1 ? '\n请按以上批次号顺序依次发布，仅处理这些批次。' : '')
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
    async refresh(): Promise<void> {
      store.update((state) => { state.status = 'loading'; state.error = null })
      try {
        const batches = await readBatches()
        store.update((state) => {
          state.batches = batches
          state.selectedBatchIds = state.selectedBatchIds.filter(id => batches.some(batch => batch.id === id))
          state.status = 'ready'
        })
      } catch (error) {
        store.update((state) => {
          state.status = 'error'
          state.error = error instanceof Error ? error.message : String(error)
        })
      }
    },
    async toggleDetail(batchId: number): Promise<void> {
      if (store.getSnapshot().details[batchId] !== undefined) {
        store.update((state) => { Reflect.deleteProperty(state.details, batchId) })
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
    async publish(batchId): Promise<void> {
      await publishBatches([batchId])
    },
    async publishSelected(): Promise<void> {
      await publishBatches(store.getSnapshot().selectedBatchIds)
    },
  }
}
