/**
 * Integration: the real seam (`dsh-browser`) + the model tool (`dsh-tool-browser`) + a scripted
 * provider, exercised through `ctx.tools.execute()` — nothing bypasses the tool registry. The
 * provider stands in for `dsh-browser-playwright` so the suite stays keyless and browserless.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import BrowserRuntime from '@deepseek-ai/dsh-browser'
import type { BrowserCommand, BrowserResult } from '@deepseek-ai/dsh-browser'
import * as ToolBrowser from '@deepseek-ai/dsh-tool-browser'

const testToolSignal = new AbortController().signal

let ctx: Context
let disposeProvider: () => void
let received: BrowserCommand[] = []
let opened = 0
let closed = 0

const pageResult: BrowserResult = {
  kind: 'page',
  page: 'p1',
  url: 'https://example.com/listing',
  title: 'Example Listing',
  text: 'listing body',
  truncated: false,
}

beforeEach(async () => {
  received = []
  opened = 0
  closed = 0
  ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(BrowserRuntime)
  disposeProvider = ctx.browser.registerProvider({
    id: 'scripted',
    available: () => true,
    open: async () => {
      opened += 1
      return {
        act: async (command: BrowserCommand): Promise<BrowserResult> => {
          received.push(command)
          return pageResult
        },
        close: async () => {
          closed += 1
        },
      }
    },
  })
  await ctx.plugin(ToolBrowser, { maxOutputChars: 100, timeoutMs: 5_000 })
})

let counter = 0
function call(args: unknown): Promise<ToolExecutionResult> {
  return ctx.tools.execute({
    signal: testToolSignal,
    callId: ToolCallId(`call-${++counter}`),
    name: 'browser',
    arguments: args,
  })
}

describe('browser tool integration over the real seam', () => {
  it('navigates and returns the bounded page capture', async () => {
    const out = await call({ action: 'navigate', url: 'https://example.com' })
    expect(out.isError).toBe(false)
    expect(out.value).toEqual({
      action: 'navigate',
      result: pageResult,
    })
    expect(received).toEqual([{ kind: 'navigate', url: 'https://example.com/', maxChars: 100 }])
  })

  it('acks state-changing actions through the shared session', async () => {
    await call({ action: 'navigate', url: 'https://example.com/submit' })
    const out = await call({ action: 'fill', selector: 'input[name=url]', value: 'https://x.test' })
    expect(out.value).toMatchObject({ action: 'fill', result: { kind: 'page' } })
    expect(received[1]).toEqual({ kind: 'fill', selector: 'input[name=url]', value: 'https://x.test' })
  })

  it('ends the shared session on closeBrowser and relaunches on the next command', async () => {
    await call({ action: 'navigate', url: 'https://example.com' })
    const out = await call({ action: 'closeBrowser' })
    expect(out.isError).toBe(false)
    expect(out.value).toEqual({ action: 'closeBrowser', result: { kind: 'acked' } })
    // discardSession closes through both the effect disposer and its own await;
    // what matters is the session closed and act() never saw a close command.
    expect(closed).toBeGreaterThanOrEqual(1)
    // closeBrowser is session lifecycle through closeSession(); it never reaches the provider's act().
    expect(received).toEqual([{ kind: 'navigate', url: 'https://example.com/', maxChars: 100 }])

    const again = await call({ action: 'snapshot' })
    expect(again.isError).toBe(false)
    expect(opened).toBe(2)
  })

  it('returns a structured error for invalid arguments', async () => {
    const out = await call({ action: 'navigate', url: 'not-a-url' })
    expect(out.isError).toBe(true)
  })

  it('surfaces provider-selection failures as structured errors', async () => {
    disposeProvider()
    const out = await call({ action: 'snapshot' })
    expect(out.isError).toBe(true)
    const text = out.content.map(block => block.type === 'text' ? block.text : '').join('')
    expect(text).toMatch(/no usable browser provider/u)
  })
})
