/** The snapshot's children cannot finish until all three have started. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'

export const name = 'parallel-barrier'
export const inject = ['agents']

export function apply(ctx: Context): void {
  const started = new Set<string>()
  const ready = Promise.withResolvers<undefined>()
  ctx.effect(() => () => { ready.resolve(undefined) })
  ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
    if (agent.session.header.parentSession === undefined) return next()
    started.add(agent.id)
    if (started.size === 3) ready.resolve(undefined)
    const cancel = (): void => { ready.resolve(undefined) }
    signal.addEventListener('abort', cancel, { once: true })
    try {
      await ready.promise
    } finally {
      signal.removeEventListener('abort', cancel)
    }
    return next()
  })
}
