/**
 * Consumer for the backlinks capability seam: the model-facing `backlinks` tool over `ctx.backlinks`. The tool
 * stays visible when no provider exists and fails with a structured error at execution.
 * @module @deepseek-ai/dsh-tool-backlinks
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { applyBacklinksTool } from './backlinks.ts'
import { PublisherConfig } from './publisher.ts'

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
  /** Maximum items in one batch view or claim (default 6). */
  readonly maxBatchItems?: number
  /** Maximum UTF-8 bytes in a summary or items view (default 16384). */
  readonly maxBatchViewBytes?: number
  /** Runtime lease heartbeat interval in milliseconds (default 60000). */
  readonly leaseHeartbeatMs?: number
  /** Enable the foreground batch publisher with explicit child policy; omitted keeps low-level tools only. */
  readonly publisher?: PublisherConfig
}

export const Config: z<Config> = z.object({
  timeoutMs: z.number().default(DEFAULT_BACKLINKS_TOOL_TIMEOUT_MS),
  maxBatchItems: z.number().step(1).min(1).default(6),
  maxBatchViewBytes: z.number().step(1).min(1).default(16_384),
  leaseHeartbeatMs: z.number().step(1).min(1).max(2_147_483_647).default(60_000),
  publisher: PublisherConfig.default(undefined as unknown as PublisherConfig),
})

/** Validated common settings with the publisher remaining opt-in. */
export type ResolvedConfig = Required<Omit<Config, 'publisher'>> & Pick<Config, 'publisher'>

export function apply(ctx: Context, config: Config): void {
  const resolved: ResolvedConfig = {
    timeoutMs: config.timeoutMs ?? DEFAULT_BACKLINKS_TOOL_TIMEOUT_MS,
    maxBatchItems: config.maxBatchItems ?? 6,
    maxBatchViewBytes: config.maxBatchViewBytes ?? 16_384,
    leaseHeartbeatMs: config.leaseHeartbeatMs ?? 60_000,
    ...config.publisher === undefined ? {} : { publisher: config.publisher },
  }
  if (!Number.isSafeInteger(resolved.timeoutMs) || resolved.timeoutMs <= 0) {
    throw new Error(`tool-backlinks: timeoutMs must be a positive integer, got ${resolved.timeoutMs}`)
  }
  for (const field of ['maxBatchItems', 'maxBatchViewBytes', 'leaseHeartbeatMs'] as const) {
    if (!Number.isSafeInteger(resolved[field]) || resolved[field] <= 0) {
      throw new Error(`tool-backlinks: ${field} must be a positive safe integer.`)
    }
  }
  if (resolved.leaseHeartbeatMs > 2_147_483_647) throw new Error('tool-backlinks: leaseHeartbeatMs exceeds the timer limit.')
  applyBacklinksTool(ctx, resolved)
}
