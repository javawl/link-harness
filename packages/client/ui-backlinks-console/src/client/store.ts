/**
 * Console presentation state: open/closed, data cache, and the publish flow.
 * The store owns no timers — components drive refresh; it owns the one-shot
 * publish choreography (start session → wait for the blank session → send the
 * command text → close the console).
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

/** What the overlay renders. */
export interface ConsoleViewState {
  open: boolean
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  batches: readonly BacklinkBatchSummary[]
  /** Expanded batch id → its detail (loaded lazily on first expand). */
  details: Record<number, BacklinkBatchDetail>
  /** Batch id currently being published (null when none). */
  publishing: number | null
}

/** The console store face: snapshot feed plus actions. */
export interface ConsoleStore {
  readonly store: SnapshotStore<ConsoleViewState>
  open(): void
  close(): void
  refresh(): Promise<void>
  toggleDetail(batchId: number): Promise<void>
  /** Start a fresh session pre-loaded with the publish command for one batch. */
  publish(batchId: number): Promise<void>
  /** The publish choreography, surfaced through publish()'s error path. */
  publishIntoFreshSession(batchId: number): Promise<void>
}

/** How long publish() waits for the blank session to connect (ms per probe). */
const PUBLISH_PROBE_INTERVAL_MS = 100
/** Upper bound on the blank-session wait before publish() gives up loudly. */
const PUBLISH_PROBE_BUDGET_MS = 8_000

/**
 * Build the console store over the client context.
 * @param ctx - client root context carrying the Remote and sessions domains.
 * @returns the store handle the overlay components consume.
 */
export function createConsoleStore(ctx: ClientContext): ConsoleStore {
  const store = createSnapshotStore<ConsoleViewState>({
    open: false,
    status: 'idle',
    error: null,
    batches: [],
    details: {},
    publishing: null,
  })

  const readBatches = async (): Promise<readonly BacklinkBatchSummary[]> => {
    const result = await ctx.remote.backlinksConsole.batches()
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
    return result.value
  }

  const readBatch = async (batchId: number): Promise<BacklinkBatchDetail> => {
    const result = await ctx.remote.backlinksConsole.batch(batchId)
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
    return result.value
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
        store.update((state) => { state.batches = batches; state.status = 'ready' })
      } catch (error) {
        store.update((state) => {
          state.status = 'error'
          state.error = error instanceof Error ? error.message : String(error)
        })
      }
    },
    async toggleDetail(batchId: number): Promise<void> {
      if (store.getSnapshot().details[batchId] !== undefined) {
        store.update((state) => { delete state.details[batchId] })
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
    async publish(batchId: number): Promise<void> {
      store.update((state) => { state.publishing = batchId })
      try {
        await this.publishIntoFreshSession(batchId)
      } catch (error) {
        store.update((state) => {
          state.error = error instanceof Error ? error.message : String(error)
        })
      } finally {
        store.update((state) => { state.publishing = null })
      }
    },

    /** The publish choreography; surfaced through publish()'s error path. */
    async publishIntoFreshSession(batchId: number): Promise<void> {
      {
        ctx.workspaces.startSession()
        const deadline = Date.now() + PUBLISH_PROBE_BUDGET_MS
        while (Date.now() < deadline) {
          await new Promise((resolve) => { setTimeout(resolve, PUBLISH_PROBE_INTERVAL_MS) })
          const current = ctx.sessions.list.getSnapshot().current
          if (current === undefined) continue
          const scope = ctx.sessions.scope(current)
          if (scope === undefined) continue
          // The conversation face is a scoped service; inject binds it to this
          // fresh scope before the send (ui-conversation owns the face).
          await scope.inject(['conversation'], async (bound) => {
            await bound.conversation.send(`/backlink-publish ${String(batchId)}`)
          })
          store.update((state) => { state.open = false })
          return
        }
        store.update((state) => {
          state.error = 'publish: new session did not connect in time'
        })
      }
    },
  }
}
