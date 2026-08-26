import { describe, expect, it } from 'vitest'

import { apply } from '@deepseek-ai/dsh-tool-browser/src/index.ts'
import {
  browserIsConcurrencySafe,
  browserMetaFromMeta,
  browserMetaFromValue,
  formatBrowserOutput,
  parseBrowserArgs,
  presentBrowserCall,
  presentBrowserResult,
} from '@deepseek-ai/dsh-tool-browser/src/browser.ts'

describe('parseBrowserArgs', () => {
  it('maps every action to its command shape', () => {
    expect(parseBrowserArgs({ action: 'navigate', url: 'https://example.com' }))
      .toEqual({ kind: 'navigate', url: 'https://example.com/' })
    expect(parseBrowserArgs({ action: 'navigate', url: 'https://example.com', waitUntil: 'networkidle' }))
      .toEqual({ kind: 'navigate', url: 'https://example.com/', waitUntil: 'networkidle' })
    expect(parseBrowserArgs({ action: 'snapshot' })).toEqual({ kind: 'snapshot' })
    expect(parseBrowserArgs({ action: 'snapshot', selector: '#main' })).toEqual({ kind: 'snapshot', selector: '#main' })
    expect(parseBrowserArgs({ action: 'click', selector: 'a' })).toEqual({ kind: 'click', selector: 'a' })
    expect(parseBrowserArgs({ action: 'fill', selector: 'input', value: 'x' }))
      .toEqual({ kind: 'fill', selector: 'input', value: 'x' })
    expect(parseBrowserArgs({ action: 'select', selector: 'select', value: 'tools' }))
      .toEqual({ kind: 'select', selector: 'select', value: 'tools' })
    expect(parseBrowserArgs({ action: 'press', key: ' Enter ' })).toEqual({ kind: 'press', key: 'Enter' })
    expect(parseBrowserArgs({ action: 'upload', selector: 'input', files: ['/tmp/a.png', '/tmp/b.png'] }))
      .toEqual({ kind: 'upload', selector: 'input', files: ['/tmp/a.png', '/tmp/b.png'] })
    expect(parseBrowserArgs({ action: 'screenshot' })).toEqual({ kind: 'screenshot' })
    expect(parseBrowserArgs({ action: 'waitFor', selector: '.done', timeoutMs: 5_000 }))
      .toEqual({ kind: 'waitFor', selector: '.done', timeoutMs: 5_000 })
    expect(parseBrowserArgs({ action: 'waitFor', url: '**/thanks' }))
      .toEqual({ kind: 'waitFor', url: '**/thanks' })
    expect(parseBrowserArgs({ action: 'closePage' })).toEqual({ kind: 'closePage' })
  })

  it('rejects unknown actions and missing required fields per action', () => {
    expect(() => parseBrowserArgs({ action: 'hover' })).toThrow(/navigate, snapshot/u)
    expect(() => parseBrowserArgs({})).toThrow(/navigate, snapshot/u)
    expect(() => parseBrowserArgs({ action: 'navigate' })).toThrow(/url/u)
    expect(() => parseBrowserArgs({ action: 'navigate', url: 'javascript:alert(1)' })).toThrow(/http\(s\)/u)
    expect(() => parseBrowserArgs({ action: 'navigate', url: 'example.com' })).toThrow(/http\(s\)/u)
    expect(() => parseBrowserArgs({ action: 'click' })).toThrow(/selector/u)
    expect(() => parseBrowserArgs({ action: 'click', selector: '  ' })).toThrow(/selector/u)
    expect(() => parseBrowserArgs({ action: 'fill' })).toThrow(/selector/u)
    expect(() => parseBrowserArgs({ action: 'fill', selector: 'input' })).toThrow(/value/u)
    expect(() => parseBrowserArgs({ action: 'select' })).toThrow(/selector/u)
    expect(() => parseBrowserArgs({ action: 'upload' })).toThrow(/selector/u)
    expect(() => parseBrowserArgs({ action: 'fill', selector: 'input', value: '' })).toThrow(/value/u)
    expect(() => parseBrowserArgs({ action: 'select', selector: 'select' })).toThrow(/value/u)
    expect(() => parseBrowserArgs({ action: 'press' })).toThrow(/key/u)
    expect(() => parseBrowserArgs({ action: 'upload', selector: 'input', files: [] })).toThrow(/files/u)
    expect(() => parseBrowserArgs({ action: 'upload', selector: 'input', files: ['  '] })).toThrow(/files/u)
    expect(() => parseBrowserArgs({ action: 'waitFor' })).toThrow(/selector or a url/u)
    expect(() => parseBrowserArgs({ action: 'waitFor', selector: '.x', timeoutMs: 0 })).toThrow(/timeoutMs/u)
    expect(() => parseBrowserArgs({ action: 'navigate', url: 'https://x.test', waitUntil: 'eager' })).toThrow(/waitUntil/u)
  })
})

describe('formatBrowserOutput', () => {
  it('renders page results with the header and bounded text', () => {
    const text = formatBrowserOutput(
      { kind: 'page', url: 'https://example.com', title: 'Example', text: 'a'.repeat(30), truncated: false },
      10,
    )
    expect(text).toContain('Example\nhttps://example.com')
    expect(text).toContain('… (truncated)')
  })

  it('rejects an unknown result kind through the closed-union default', () => {
    expect(() => formatBrowserOutput({ kind: 'bogus' } as never, 10)).toThrow(/unhandled browser result kind/u)
  })

  it('renders acks and screenshots', () => {
    expect(formatBrowserOutput({ kind: 'acked' }, 10)).toBe('ok')
    expect(formatBrowserOutput({ kind: 'screenshot', pngBase64: 'abcd' }, 10))
      .toMatch(/screenshot captured \(4 base64 characters\)/u)
  })
})

describe('presentation', () => {
  it('names the action and its target in the call card', () => {
    expect(presentBrowserCall({ action: 'navigate', url: 'https://example.com' }))
      .toMatchObject({ card: 'generic', title: 'browser navigate', rawInput: 'https://example.com' })
    expect(presentBrowserCall({ action: 'click', selector: '#go' }))
      .toMatchObject({ title: 'browser click', rawInput: '#go' })
    expect(presentBrowserCall({ action: 'press', key: 'Enter' }))
      .toMatchObject({ title: 'browser press', rawInput: 'Enter' })
    expect(presentBrowserCall({ action: 'screenshot' }))
      .toEqual({ card: 'generic', title: 'browser screenshot', kind: 'execute' })
    expect(presentBrowserCall({})).toMatchObject({ title: 'browser browser' })
  })

  it('shows a result card only for page captures', () => {
    expect(presentBrowserResult({}, { meta: { kind: 'browser-page', title: 'Example', url: 'x' } } as never))
      .toEqual({ card: 'generic', title: 'Example' })

    expect(presentBrowserResult({}, { meta: { kind: 'browser', outcome: 'acked' } } as never)).toBeUndefined()
    expect(presentBrowserResult({}, {} as never)).toBeUndefined()
    expect(browserIsConcurrencySafe()).toBe(false)
  })

  describe('browser presentation meta', () => {
    it('marks page captures and summarizes other outcomes', () => {
      expect(browserMetaFromValue({ result: { kind: 'page', title: 'Example', url: 'https://example.com' } }))
        .toEqual({ kind: 'browser-page', title: 'Example', url: 'https://example.com' })
      expect(browserMetaFromValue({ result: { kind: 'acked' } })).toEqual({ kind: 'browser', outcome: 'acked' })
      expect(browserMetaFromValue({ result: { kind: 'page', title: 'no-url' } }))
        .toEqual({ kind: 'browser', outcome: 'page' })
      expect(browserMetaFromValue(undefined)).toEqual({ kind: 'browser', outcome: 'unknown' })
    })

    it('narrows the persisted meta back to a title', () => {
      expect(browserMetaFromMeta({ kind: 'browser-page', title: 'Example', url: 'x' }))
        .toEqual({ title: 'Example' })
      expect(browserMetaFromMeta({ kind: 'acked' })).toBeUndefined()
      expect(browserMetaFromMeta(undefined)).toBeUndefined()
      expect(browserMetaFromMeta('string')).toBeUndefined()
    })
  })
})


describe('tool-browser plugin apply', () => {
  it('rejects non-positive maxOutputChars and timeoutMs', () => {
    expect(() =>{  apply({} as never, { maxOutputChars: 0, timeoutMs: 1 }) }).toThrow(/maxOutputChars/u)
    expect(() =>{  apply({} as never, { maxOutputChars: 1, timeoutMs: -1 }) }).toThrow(/timeoutMs/u)
  })
})
