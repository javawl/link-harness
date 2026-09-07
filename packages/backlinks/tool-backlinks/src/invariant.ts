/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-tool-backlinks`.
 * @module @deepseek-ai/dsh-tool-backlinks/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from './backlinks.ts'

const PACKAGE_NAME = '@deepseek-ai/dsh-tool-backlinks'

/** Cordis companion plugin name. */
export const name = 'tool-backlinks-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** One session admits each backlink item at most once, including its restored history. */
const install: InvariantInstaller = (ctx, fail) => {
  const attempts = new WeakMap<Session, { cursor: number; ids: Set<number> }>()
  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const [session, event] = args as [Session, SessionEvent]
    if (event.type !== 'backlinks/attempt') return
    let committed = attempts.get(session)
    if (committed === undefined) {
      committed = { cursor: 0, ids: new Set() }
      attempts.set(session, committed)
    }
    for (const prior of session.events.slice(committed.cursor)) {
      if (prior.type === 'backlinks/attempt') for (const id of prior.data.itemIds) committed.ids.add(id)
    }
    committed.cursor = session.events.length
    const incoming = new Set<number>()
    for (const id of event.data.itemIds) {
      if (committed.ids.has(id) || incoming.has(id)) fail(`Backlink item ${id} was admitted more than once in session ${session.id}.`)
      incoming.add(id)
    }
  }, { global: true })
}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
