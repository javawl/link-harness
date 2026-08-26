/**
 * Consumer for the backlinks capability seam: the model-facing `backlinks` tool over `ctx.backlinks`. The tool
 * stays visible when no provider exists and fails with a structured error at execution.
 * @module @deepseek-ai/dsh-tool-backlinks
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { applyBacklinksTool } from './backlinks.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-backlinks'
/** Services required by the backlinks tool. */
export const inject = ['tools', 'backlinks', 'systemPrompt']

/** Default per-call backlinks tool timeout in milliseconds. */
export const DEFAULT_BACKLINKS_TOOL_TIMEOUT_MS = 300_000

/** Configuration for the backlinks tool. */
export interface Config {
  /** Per-call timeout in milliseconds attached to the tool definition. */
  readonly timeoutMs?: number
}

export const Config: z<Config> = z.object({
  timeoutMs: z.number().default(DEFAULT_BACKLINKS_TOOL_TIMEOUT_MS),
})

type ResolvedConfig = Required<Config>

export function apply(ctx: Context, config: Config): void {
  const resolved = config as ResolvedConfig
  if (!Number.isSafeInteger(resolved.timeoutMs) || resolved.timeoutMs <= 0) {
    throw new Error(`tool-backlinks: timeoutMs must be a positive integer, got ${resolved.timeoutMs}`)
  }
  applyBacklinksTool(ctx, resolved.timeoutMs)
}
