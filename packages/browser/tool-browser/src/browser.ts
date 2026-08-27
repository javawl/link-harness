/**
 * The model-facing `browser` tool. This module owns its schema, validation, and presentation; `ctx.browser`
 * owns automation. One tool with an `action` discriminant instead of one tool per operation: the browser is
 * one stateful surface and the model reasons about a single page-driving verb set. Timeout is deployment
 * policy, not a model argument: config becomes `ToolDefinition.timeoutMs`, timeout policy enforces it, and
 * this tool forwards the resulting signal.
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, GenericResultView, JsonValue, ToolResult } from '@deepseek-ai/dsh-tools'
import { assertNever } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type { BrowserCommand, BrowserResult } from '@deepseek-ai/dsh-browser'

/** Tool actions, one per closed-union command kind. */
const ACTIONS = ['navigate', 'snapshot', 'click', 'fill', 'select', 'press', 'upload', 'screenshot', 'waitFor', 'closePage', 'bringToFront'] as const

type BrowserAction = typeof ACTIONS[number]

/** Validated tool arguments after value checks the schema DSL cannot express. */
export interface BrowserToolInput {
  readonly action: BrowserAction
  readonly page?: string
  readonly url?: string
  readonly selector?: string
  readonly value?: string
  readonly key?: string
  readonly files?: readonly string[]
  readonly waitUntil?: 'load' | 'domcontentloaded' | 'networkidle'
  readonly timeoutMs?: number
}

/**
 * Validate tool arguments into a seam command. Throws a plain `Error` with a
 * model-readable message; the registry turns it into a structured tool error.
 * @param args - raw tool arguments.
 * @returns the closed-union command for `ctx.browser.act()`.
 */
export function parseBrowserArgs(args: Record<string, unknown>): BrowserCommand {
  const action = args.action
  const page = readNonEmpty(args.page, 'page')
  const url = readNonEmpty(args.url, 'url')
  const selector = readSelector(args.selector)
  const value = readNonEmpty(args.value, 'value')
  const waitUntil = readWaitUntil(args.waitUntil)
  const timeoutMs = readPositiveInt(args.timeoutMs, 'timeoutMs')

  const addressed = <T extends BrowserCommand>(command: T): T => (
    page === undefined ? command : { ...command, page }
  )

  switch (action as BrowserAction) {
    case 'bringToFront':
      return addressed({ kind: 'bringToFront' })
    case 'navigate': {
      const target = readUrl(args.url)
      if (target === undefined) throw new Error('browser navigate requires an http(s) url.')
      return addressed({ kind: 'navigate', url: target, ...waitUntil === undefined ? {} : { waitUntil } })
    }
    case 'snapshot':
      return addressed({
        kind: 'snapshot',
        ...selector === undefined ? {} : { selector },
        ...args.format === 'aria' ? { format: 'aria' as const } : {},
      })
    case 'click':
      if (selector === undefined) throw new Error('browser click requires a selector.')
      return addressed({ kind: 'click', selector })
    case 'fill':
      if (selector === undefined) throw new Error('browser fill requires a selector.')
      if (value === undefined) throw new Error('browser fill requires a value.')
      return addressed({ kind: 'fill', selector, value })
    case 'select':
      if (selector === undefined) throw new Error('browser select requires a selector.')
      if (value === undefined) throw new Error('browser select requires a value.')
      return addressed({ kind: 'select', selector, value })
    case 'press':
      if (typeof args.key !== 'string' || args.key.trim().length === 0) {
        throw new Error('browser press requires a key (for example Enter, Tab).')
      }
      return addressed({ kind: 'press', key: args.key.trim() })
    case 'upload':
      if (selector === undefined) throw new Error('browser upload requires a selector.')
      if (!Array.isArray(args.files) || args.files.length === 0
        || args.files.some(file => typeof file !== 'string' || file.trim().length === 0)) {
        throw new Error('browser upload requires a non-empty files array of paths.')
      }
      return addressed({ kind: 'upload', selector, files: args.files.map(file => String(file)) })
    case 'screenshot':
      return addressed({ kind: 'screenshot' })
    case 'waitFor':
      if (selector === undefined && url === undefined) {
        throw new Error('browser waitFor requires a selector or a url.')
      }
      return addressed({
        kind: 'waitFor',
        ...selector === undefined ? {} : { selector },
        ...url === undefined ? {} : { url },
        ...timeoutMs === undefined ? {} : { timeoutMs },
      })
    case 'closePage':
      return addressed({ kind: 'closePage' })
    default:
      return assertNever(action as never, `browser action must be one of ${ACTIONS.join(', ')}.`)
  }
}

/**
 * Reject selector prefixes the provider grammar cannot parse. Every prefix is
 * `role:`, `label:`, `placeholder:`, `text:`, `xy:`, `frame(...)>>`, or bare
 * CSS; anything else starting with those words but malformed surfaces here as
 * a model-readable error instead of a provider timeout.
 */
function readSelector(value: unknown): string | undefined {
  const raw = readNonEmpty(value, 'selector')
  if (raw === undefined) return undefined
  if (/^xy:(?!\d+,\d+$).*/u.test(raw)) {
    throw new Error('browser xy selector must be xy:<x>,<y> with non-negative integers.')
  }
  if (/^role:[^|]*\|$/u.test(raw) || /^role:\|/u.test(raw)) {
    throw new Error('browser role selector must be role:<role>|<name> with both parts non-empty.')
  }
  if (/^(label|placeholder|text):$/u.test(raw)) {
    throw new Error(`browser ${raw.slice(0, -1)} selector must be ${raw}:<text> with non-empty text.`)
  }
  return raw
}

function readNonEmpty(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`browser ${field} must be a non-empty string.`)
  }
  return value.trim()
}

function readUrl(value: unknown): string | undefined {
  const raw = readNonEmpty(value, 'url')
  if (raw === undefined) return undefined
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('protocol')
    }
    return url.toString()
  } catch {
    throw new Error('browser url must be an absolute http(s) URL.')
  }
}

function readWaitUntil(value: unknown): 'load' | 'domcontentloaded' | 'networkidle' | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (value === 'load' || value === 'domcontentloaded' || value === 'networkidle') return value
  throw new Error('browser waitUntil must be load, domcontentloaded, or networkidle.')
}

function readPositiveInt(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`browser ${field} must be a positive integer.`)
  }
  return parsed
}

/**
 * Render a browser tool result as model-facing text. Pure: presentation data
 * comes only from the stored result.
 * @param result - the seam outcome.
 * @param maxChars - bound on the rendered page text.
 * @returns the render text.
 */
export function formatBrowserOutput(result: BrowserResult, maxChars: number): string {
  switch (result.kind) {
    case 'page': {
      const header = `[page ${result.page}] ${result.title}\n${result.url}`
      const body = result.text.length > maxChars
        ? `${result.text.slice(0, maxChars)}\n… (truncated)`
        : result.text
      return `${header}\n\n${body}`
    }
    case 'acked':
      return 'ok'
    case 'screenshot':
      return `screenshot captured (${result.pngBase64.length} base64 characters)`
    default:
      return assertNever(result, 'unhandled browser result kind')
  }
}

/** One agent must not overlap its own browser calls: interleaved steps on one tab are incoherent.
 * Cross-tab parallelism is real — separate agents/children each addressing their own page ref overlap
 * inside the provider — but that is orchestration-level, not this agent's parallel tool calls.
 * @returns always false — one agent's browser commands run serially.
 */
export function browserIsConcurrencySafe(): boolean {
  return false
}

/** Pure call view: a generic card naming the action and its target.
 * @param args - raw tool arguments; only display fields are read.
 * @returns the generic card shown while the call runs.
 */
export function presentBrowserCall(args: Record<string, unknown>): GenericCallView {
  const action = typeof args.action === 'string' ? args.action : 'browser'
  const target = typeof args.url === 'string' && args.url.length > 0
    ? args.url
    : typeof args.selector === 'string' && args.selector.length > 0
      ? args.selector
      : typeof args.key === 'string' && args.key.length > 0
        ? args.key
        : undefined
  return {
    card: 'generic',
    title: `browser ${action}`,
    kind: 'execute',
    ...target === undefined ? {} : { rawInput: target },
  }
}

/** Pure result view: a replacement title for page captures; nothing for silent acks.
 * @param _args - raw tool arguments; unused, presentation reads only the result.
 * @param result - the completed tool result carrying the persisted meta.
 * @returns the generic result card, or `undefined` to keep the raw result content.
 */
export function presentBrowserResult(_args: Record<string, unknown>, result: ToolResult): GenericResultView | undefined {
  const meta = browserMetaFromMeta(result.meta)
  return meta === undefined ? undefined : { card: 'generic', title: meta.title }
}

/** Pure persisted-result metadata: page captures carry url/title; other outcomes carry their kind.
 * @param value - the tool result value to project.
 * @returns the JSON payload persisted with the `tool/result` event.
 */
export function browserMetaFromValue(value: unknown): JsonValue {
  const outcome = (value as { result?: { kind?: string; title?: string; url?: string; page?: string } } | undefined)?.result
  if (outcome?.kind === 'page' && typeof outcome.title === 'string' && typeof outcome.url === 'string') {
    return {
      kind: 'browser-page',
      title: outcome.title,
      url: outcome.url,
      ...typeof outcome.page === 'string' ? { page: outcome.page } : {},
    }
  }
  return { kind: 'browser', outcome: outcome?.kind ?? 'unknown' }
}

/** Narrow the opaque persisted meta back to its page-capture payload.
 * @param meta - the persisted presentation payload, defensively narrowed.
 * @returns the page-capture title, or `undefined` for any other outcome.
 */
export function browserMetaFromMeta(meta: JsonValue | undefined): { title: string } | undefined {
  if (meta === undefined || typeof meta !== 'object' || meta === null) return undefined
  const candidate = meta as { kind?: unknown; title?: unknown }
  return candidate.kind === 'browser-page' && typeof candidate.title === 'string'
    ? { title: candidate.title }
    : undefined
}

/**
 * Register the `browser` tool and its prompt section.
 * @param ctx - context carrying `tools`, `browser`, and `systemPrompt`.
 * @param timeoutMs - per-call timeout attached as `ToolDefinition.timeoutMs`.
 * @param maxOutputChars - bound on returned page text, passed as the command's `maxChars`.
 */
export function applyBrowserTool(ctx: Context, timeoutMs: number, maxOutputChars: number): void {
  ctx.systemPrompt.section({
    name: 'tool:browser',
    order: 112,
    text: [
      'Use the browser tool to drive one shared, persistent real-browser session across tabs.',
      'Tabs: navigate returns a page ref like p2; pass that page on every later command for the tab you are working. Work several sites in parallel by giving each its own ref. Omit page only for single-tab serial work.',
      'Selectors address semantically first: role:<role>|<name> (for example role:button|Submit), label:<text>, placeholder:<text>, text:<text>, or bare CSS as fallback; prefix frame(<iframe css>)>> to reach inside an iframe; click also takes xy:<x>,<y> viewport coordinates from a screenshot.',
      'Prefer snapshot with format=aria to read element roles and names, then address them by role/label/placeholder — far more reliable than guessing CSS.',
      'The window may run offscreen; when a human must step in (CAPTCHA, login), call bringToFront first so the window surfaces.',
      'Actions: navigate (absolute http(s) url), snapshot (url/title/text of the page or a selector), click/fill/select (CSS selector; fill and select need value), press (key like Enter), upload (selector + files), screenshot (PNG base64), waitFor (selector or url), closePage.',
      'The session persists cookies and logins across calls and runs; prefer it for sites that need JavaScript, logins, or form submission. Confirm outcomes with snapshot or waitFor after state-changing actions.',
    ].join(' '),
  })

  ctx.tools.register(defineTool({
    name: 'browser',
    description: 'Drive one shared persistent real-browser session: navigate, read page text, click, fill forms, select options, press keys, upload files, screenshot, wait, and close tabs.',
    parameters: {
      action: {
        type: 'string',
        required: true,
        description: `One of ${ACTIONS.join(', ')}.`,
      },
      page: {
        type: 'string',
        description: 'Tab ref from a navigate result. Pass it on EVERY command while working a tab: navigate with a new ref opens that tab, later commands address it. Omit only for single-tab serial work.',
      },
      url: {
        type: 'string',
        description: 'Absolute http(s) URL for navigate; target for waitFor.',
      },
      selector: {
        type: 'string',
        description: 'Element addressing: role:<role>|<name>, label:<text>, placeholder:<text>, text:<text>, bare CSS, optionally prefixed frame(<iframe css>)>>; click also accepts xy:<x>,<y>.',
      },
      format: {
        type: 'string',
        description: 'snapshot capture shape: text (visible text) or aria (accessibility tree with roles and names).',
      },
      value: {
        type: 'string',
        description: 'Value for fill; option value for select.',
      },
      key: {
        type: 'string',
        description: 'Keyboard key for press, for example Enter or Tab.',
      },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'File paths for upload.',
      },
      waitUntil: {
        type: 'string',
        description: 'navigate load state: load, domcontentloaded, or networkidle.',
      },
      timeoutMs: {
        type: 'number',
        description: 'waitFor timeout in milliseconds.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          action: { type: 'string', required: true },
          result: {
            oneOf: [
              {
                type: 'object',
                additionalProperties: false,
                properties: {
                  kind: { type: 'string', required: true, const: 'page' },
                  page: { type: 'string', required: true },
                  url: { type: 'string', required: true },
                  title: { type: 'string', required: true },
                  text: { type: 'string', required: true },
                  truncated: { type: 'boolean', required: true },
                },
              },
              {
                type: 'object',
                additionalProperties: false,
                properties: {
                  kind: { type: 'string', required: true, const: 'acked' },
                },
              },
              {
                type: 'object',
                additionalProperties: false,
                properties: {
                  kind: { type: 'string', required: true, const: 'screenshot' },
                  pngBase64: { type: 'string', required: true },
                },
              },
            ],
          },
        },
      },
      render: (_args, value) => [
        { type: 'text', text: formatBrowserOutput((value as { result: BrowserResult }).result, maxOutputChars) },
      ],
      presentationMeta: (_args, value) => browserMetaFromValue(value),
    },
    timeoutMs,
    // The browser session is stateful shared surface; overlapping calls would interleave page state.
    isConcurrencySafe: browserIsConcurrencySafe,
    async execute(args: Record<string, unknown>, exec) {
      const command = parseBrowserArgs(args)
      const bounded: BrowserCommand = command.kind === 'navigate' || command.kind === 'snapshot'
        ? { ...command, maxChars: maxOutputChars }
        : command
      const result = await ctx.browser.act(bounded, exec.signal)
      return { action: String(args.action), result }
    },
    presentCall: presentBrowserCall,
    presentResult: presentBrowserResult,
  }))
}
