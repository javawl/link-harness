/**
 * Consumer for the browser automation seam: the model-facing `browser` tool over `ctx.browser`.
 * The tool stays visible when no provider exists and fails with a structured error at execution.
 * @module @deepseek-ai/dsh-tool-browser
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { applyBrowserTool } from './browser.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-browser'
/** Services required by the browser tool. */
export const inject = ['tools', 'browser', 'systemPrompt']

/** Default per-call browser tool timeout in milliseconds. */
export const DEFAULT_BROWSER_TOOL_TIMEOUT_MS = 120_000
/** Default bound on page text returned to the model. */
export const DEFAULT_BROWSER_MAX_OUTPUT_CHARS = 60_000

/** Configuration for the browser tool suite. */
export interface Config {
  /** Bound on page text returned to the model. */
  readonly maxOutputChars?: number
  /** Per-call timeout in milliseconds attached to the tool definition. */
  readonly timeoutMs?: number
}

export const Config: z<Config> = z.object({
  maxOutputChars: z.number().default(DEFAULT_BROWSER_MAX_OUTPUT_CHARS),
  timeoutMs: z.number().default(DEFAULT_BROWSER_TOOL_TIMEOUT_MS),
})

type ResolvedConfig = Required<Config>

export function apply(ctx: Context, config: Config): void {
  const resolved = config as ResolvedConfig
  if (!Number.isSafeInteger(resolved.maxOutputChars) || resolved.maxOutputChars <= 0) {
    throw new Error(`tool-browser: maxOutputChars must be a positive integer, got ${resolved.maxOutputChars}`)
  }
  if (!Number.isSafeInteger(resolved.timeoutMs) || resolved.timeoutMs <= 0) {
    throw new Error(`tool-browser: timeoutMs must be a positive integer, got ${resolved.timeoutMs}`)
  }
  applyBrowserTool(ctx, resolved.timeoutMs, resolved.maxOutputChars)
}
