import { Context } from '@deepseek-ai/cordis'
import SessionStore from '@deepseek-ai/dsh-session'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import { expect, it } from 'vitest'
import * as BacklinksInvariant from '../src/invariant.ts'

it('rejects duplicate admissions, retains restored history, and releases its observer on disposal', async () => {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(InvariantRegistry)
  const companion = await ctx.plugin(BacklinksInvariant)
  try {
    const session = ctx.sessions.create()
    session.append('backlinks/attempt', { batchId: 176, itemIds: [1] })
    expect(() => session.append('backlinks/attempt', { batchId: 176, itemIds: [1] })).toThrow(/admitted more than once/)
    const restored = ctx.sessions.create(undefined, { seed: session.events })
    expect(() => restored.append('backlinks/attempt', { batchId: 176, itemIds: [1] })).toThrow(/admitted more than once/)
    expect(() => restored.append('backlinks/attempt', { batchId: 176, itemIds: [2, 2] })).toThrow(/admitted more than once/)
    const veto = ctx.on('internal/dispatch', (_mode, name) => {
      if (name === 'session/event') throw new Error('later observer veto')
    })
    expect(() => session.append('backlinks/attempt', { batchId: 176, itemIds: [2] })).toThrow('later observer veto')
    veto()
    expect(() => session.append('backlinks/attempt', { batchId: 176, itemIds: [2] })).not.toThrow()
    await companion.dispose()
    expect(() => session.append('backlinks/attempt', { batchId: 176, itemIds: [1] })).not.toThrow()
  } finally {
    await ctx.fiber.dispose()
  }
})
