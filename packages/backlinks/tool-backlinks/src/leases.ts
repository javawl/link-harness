/** Runtime-owned lease renewal; server timestamps are opaque and never compared to the local clock. */

import type { Context } from '@deepseek-ai/cordis'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-backlinks'

type Owner = ToolExecution['agent']

/** Renew claimed leases until release, owner idle/disposal, or plugin disposal. */
export class LeaseRenewals {
  private closed = false
  private readonly leases = new Map<number, {
    owner: Owner
    controller: AbortController
    timer?: ReturnType<typeof setTimeout>
    pending: Promise<void>
    failure?: string
  }>()

  constructor(private readonly ctx: Context, private readonly intervalMs: number, private readonly timeoutMs: number) {
    ctx.effect(() => async () => {
      this.closed = true
      await Promise.all([...this.leases.keys()].map(id => this.stop(id)))
    })
    ctx.on('agent/status', ({ agent, status }) => {
      if (status !== 'idle') return
      for (const [id, lease] of this.leases) {
        if (lease.owner === agent) void this.stop(id)
      }
    })
    ctx.on('agent/pre-step', async ({ agent }, next) => {
      for (const lease of this.leases.values()) {
        if (lease.owner === agent && lease.failure !== undefined) throw new Error(lease.failure)
      }
      return next()
    })
  }

  /**
   * Start timer-based renewal after a successful claim, without another LLM step.
   * @param leaseId - server-issued lease id.
   * @param owner - calling agent, when the tool is run by an agent.
   */
  start(leaseId: number, owner: Owner): void {
    if (this.closed) throw new Error('Backlink lease renewal runtime is disposed')
    const current = this.leases.get(leaseId)
    if (current !== undefined) {
      if (current.owner !== owner || current.controller.signal.aborted || current.failure !== undefined) {
        throw new Error(`Backlink lease ${leaseId} already has another, stopping, or failed owner`)
      }
      return
    }
    const lease: NonNullable<ReturnType<typeof this.leases.get>> = {
      owner, controller: new AbortController(), pending: Promise.resolve(),
    }
    const schedule = (): void => {
      lease.timer = setTimeout(() => { lease.pending = renew() }, this.intervalMs)
      lease.timer.unref()
    }
    const renew = async (): Promise<void> => {
      try {
        await this.ctx.backlinks.heartbeat(leaseId, AbortSignal.any([
          lease.controller.signal, AbortSignal.timeout(this.timeoutMs),
        ]))
      } catch {
        // Provider failures are contained here; cancellation belongs to stop().
        if (!lease.controller.signal.aborted) {
          lease.failure = `Backlink lease ${leaseId} renewal failed; publishing stopped. Check recorded submissions before resuming.`
          this.ctx.logger.warn(lease.failure)
          owner?.cancel({ kind: 'hook', reason: lease.failure })
        }
      }
      if (!lease.controller.signal.aborted && lease.failure === undefined) schedule()
    }
    this.leases.set(leaseId, lease)
    if (owner !== undefined) owner.ctx.effect(() => () => this.stop(leaseId))
    schedule()
  }

  /**
   * Stop and quiesce renewals before releasing a lease; does not mutate server state.
   * @param leaseId - lease whose renewal must stop.
   * @returns after any in-flight heartbeat settles.
   */
  async stop(leaseId: number): Promise<void> {
    const lease = this.leases.get(leaseId)
    if (lease === undefined) return
    clearTimeout(lease.timer)
    lease.controller.abort()
    await lease.pending
    this.leases.delete(leaseId)
  }
}
