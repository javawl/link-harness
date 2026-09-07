/** Per-run limits checked before paid requests; dispatched tools may finish safely. */

import { isDeepStrictEqual } from 'node:util'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { tokenUsageProjectionDefinition as usage } from '@deepseek-ai/dsh-token-meter'
import type {} from '@deepseek-ai/dsh-tools'

/** Deployment limits for one in-process one-shot child, excluding a fork's seed. */
export interface InProcessWorkBudget {
  /** Cumulative reported input, cache and output tokens; retries count separately. */
  maxTokens: number
  /** Maximum model steps; request retries additionally consume the token budget. */
  maxSteps: number
  /** Elapsed milliseconds checked before the next request, without aborting active tools. */
  maxElapsedMs: number
  /** Failed executions with identical tool name and arguments before stopping. */
  maxRepeatedToolFailures: number
}

/** Optional budget schema; omission leaves the provider's runs unbounded. */
export const WorkBudgetSchema: z<InProcessWorkBudget> = z.object({
  maxTokens: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).required(),
  maxSteps: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).required(),
  maxElapsedMs: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).required(),
  maxRepeatedToolFailures: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).required(),
}).default(undefined as unknown as InProcessWorkBudget)

/**
 * Validate the provider's optional deployment budget at load time.
 * @param budget - configuration supplied to the native provider.
 * @returns a detached budget, or undefined for an unbounded deployment.
 */
export function resolveWorkBudget(budget: InProcessWorkBudget | undefined): InProcessWorkBudget | undefined {
  if (budget === undefined) return undefined
  const fields = ['maxTokens', 'maxSteps', 'maxElapsedMs', 'maxRepeatedToolFailures'] as const
  for (const field of Object.keys(budget)) {
    if (!fields.includes(field as typeof fields[number])) throw new Error(`workBudget: unknown key ${field}`)
  }
  for (const field of fields) {
    if (!Number.isSafeInteger(budget[field]) || budget[field] <= 0) {
      throw new Error(`workBudget.${field} must be a positive safe integer`)
    }
  }
  return { ...budget }
}

/**
 * Install a budget before the child is published. Exhaustion becomes a durable
 * turn error and a parent-facing diagnostic; no active tool is interrupted.
 * @param ctx - unpublished child's context, which owns listener disposal.
 * @param budget - resolved per-run limits.
 * @param boundary - first event owned by this activation, after any inherited seed.
 * @returns a reader for the terminal budget diagnostic.
 */
export function attachWorkBudget(ctx: Context, budget: InProcessWorkBudget, boundary: number): () => string | undefined {
  const agent = ctx.agent as Agent
  const started = performance.now()
  let cursor = boundary
  let steps = 0
  let state: Parameters<typeof usage.apply>[0] = usage.init()
  let diagnostic: string | undefined
  const failures: { name: string; args: unknown; count: number }[] = []

  function check(): void {
    const events = agent.session.events
    for (const event of events.slice(cursor)) state = usage.apply(state, event)
    cursor = events.length
    const tokens = Object.values(state.totals).reduce((sum, value) => sum + value, 0)
    diagnostic ??= tokens >= budget.maxTokens ? `reported tokens ${tokens} >= ${budget.maxTokens}`
      : performance.now() - started >= budget.maxElapsedMs ? `elapsed time >= ${budget.maxElapsedMs}ms`
        : failures.some(entry => entry.count >= budget.maxRepeatedToolFailures) ? `identical tool failures >= ${budget.maxRepeatedToolFailures}`
          : undefined
    if (diagnostic !== undefined) throw new Error(`Subagent work budget exhausted: ${diagnostic}. Inspect recorded results before any retry; an unknown submission requires manual review.`)
  }

  ctx.on('agent/pre-step', async (_payload, next) => {
    if (steps >= budget.maxSteps) diagnostic ??= `model steps >= ${budget.maxSteps}`
    check()
    const decision = await next()
    if (decision.kind === 'enter') steps++
    return decision
  })
  ctx.on('agent/request', async (_payload, next) => {
    check()
    return next()
  })
  ctx.on('tools/result', (exec, result) => {
    if (exec.agent !== agent) return
    const entry = failures.find(item => item.name === exec.name && isDeepStrictEqual(item.args, exec.arguments))
    if (result.isError) {
      if (entry === undefined) failures.push({ name: exec.name, args: exec.arguments, count: 1 })
      else entry.count++
    } else if (entry !== undefined) {
      failures.splice(failures.indexOf(entry), 1)
    }
  })
  return () => diagnostic
}
