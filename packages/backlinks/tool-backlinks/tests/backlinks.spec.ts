import { describe, expect, it } from 'vitest'

import {
  backlinksIsConcurrencySafe,
  backlinksMetaFromMeta,
  backlinksMetaFromValue,
  renderBacklinksValue,
  parseItemResult,
  presentBacklinksCall,
  presentBacklinksResult,
} from '@deepseek-ai/dsh-tool-backlinks/src/backlinks.ts'
import { apply } from '@deepseek-ai/dsh-tool-backlinks/src/index.ts'

describe('parseItemResult', () => {
  it('maps every outcome variant with its evidence passthrough', () => {
    expect(parseItemResult({
      status: 'live', publicUrl: 'https://d/l', anchorText: 'A', targetUrl: 'https://t/', evidence: 'E',
    })).toEqual({
      status: 'live', publicUrl: 'https://d/l', anchorText: 'A', targetUrl: 'https://t/', evidence: 'E',
    })
    expect(parseItemResult({ status: 'submitted', anchorText: 'A', targetUrl: 'https://t/' }))
      .toEqual({ status: 'submitted', anchorText: 'A', targetUrl: 'https://t/' })
    expect(parseItemResult({ status: 'submitted', publicUrl: 'https://d/p', anchorText: 'A', targetUrl: 'https://t/' }))
      .toMatchObject({ publicUrl: 'https://d/p' })
    expect(parseItemResult({ status: 'submitted', anchorText: 'A', targetUrl: 'https://t/', evidence: 'E' }))
      .toMatchObject({ evidence: 'E' })
    expect(parseItemResult({ status: 'failed', failureMode: 'manual_required', failureReason: 'captcha' }))
      .toEqual({ status: 'failed', failureMode: 'manual_required', failureReason: 'captcha' })
    expect(parseItemResult({ status: 'skipped', skipReason: 'gone' }))
      .toEqual({ status: 'skipped', skipReason: 'gone' })
  })

  it('covers optional-string and non-string branches', () => {
    expect(parseItemResult({ status: 'submitted', anchorText: 'A', targetUrl: 'https://t/', evidence: '' }))
      .toEqual({ status: 'submitted', anchorText: 'A', targetUrl: 'https://t/' })
    expect(() => parseItemResult({ status: 'submitted', anchorText: 'A', targetUrl: 'https://t/', evidence: 5 }))
      .toThrow(/evidence/u)
    // live without evidence covers the omitted-evidence branch too
    expect(parseItemResult({ status: 'live', publicUrl: 'https://d/l', anchorText: 'A', targetUrl: 'https://t/' }))
      .toEqual({ status: 'live', publicUrl: 'https://d/l', anchorText: 'A', targetUrl: 'https://t/' })
    expect(parseItemResult({ status: 'failed', failureMode: 'retryable', failureReason: 'x', evidence: 'E' }))
      .toMatchObject({ evidence: 'E' })
    expect(parseItemResult({ status: 'failed', failureMode: 'manual_required', failureReason: 'captcha' }))
      .toEqual({ status: 'failed', failureMode: 'manual_required', failureReason: 'captcha' })
  })

  it('rejects missing required fields per status', () => {
    expect(() => parseItemResult({})).toThrow(/status/u)
    expect(() => parseItemResult({ status: 'live', anchorText: 'A', targetUrl: 'https://t/' })).toThrow(/publicUrl/u)
    expect(() => parseItemResult({ status: 'live', publicUrl: 'https://d/l', anchorText: '', targetUrl: 'https://t/' })).toThrow(/anchorText/u)
    expect(() => parseItemResult({ status: 'submitted', anchorText: 'A' })).toThrow(/targetUrl/u)
    expect(() => parseItemResult({ status: 'failed', failureMode: 'nope', failureReason: 'x' })).toThrow(/failureMode/u)
    expect(() => parseItemResult({ status: 'failed', failureMode: 'retryable' })).toThrow(/failureReason/u)
    expect(() => parseItemResult({ status: 'skipped' })).toThrow(/skipReason/u)
  })
})

describe('renderBacklinksValue', () => {
  it('renders the summary with the embedded payload and degrades missing fields', () => {
    expect(renderBacklinksValue({ summary: '3 batch(es)', data: { count: 3 } }))
      .toBe('3 batch(es)\n{"count":3}')
    expect(renderBacklinksValue(undefined)).toBe('\nnull')
    expect(renderBacklinksValue({ summary: 's' })).toBe('s\nnull')
  })
})

describe('presentation', () => {
  it('names the action and its target in the call card', () => {
    expect(presentBacklinksCall({ action: 'batch_claim', batchId: 7 }))
      .toEqual({ card: 'generic', title: 'backlinks batch_claim', kind: 'execute', rawInput: '7' })
    expect(presentBacklinksCall({ action: 'mail_wait', mailEmail: 'a@b.test' }))
      .toMatchObject({ rawInput: 'a@b.test' })
    expect(presentBacklinksCall({ action: 'batch_list' }))
      .toEqual({ card: 'generic', title: 'backlinks batch_list', kind: 'execute' })
    expect(presentBacklinksCall({})).toEqual({ card: 'generic', title: 'backlinks backlinks', kind: 'execute' })
  })

  it('carries action and summary through the persisted meta', () => {
    expect(backlinksMetaFromValue({ action: 'batch_list', summary: '3 batch(es)' }))
      .toEqual({ kind: 'backlinks', action: 'batch_list', summary: '3 batch(es)' })
    expect(backlinksMetaFromValue(undefined)).toEqual({ kind: 'backlinks', action: 'unknown', summary: '' })
    expect(backlinksMetaFromMeta({ kind: 'backlinks', action: 'x', summary: 'S' })).toEqual({ summary: 'S' })
    expect(backlinksMetaFromMeta({ kind: 'other' })).toBeUndefined()
    expect(backlinksMetaFromMeta(undefined)).toBeUndefined()
    expect(backlinksMetaFromMeta('str')).toBeUndefined()
  })

  it('shows a result card from the meta summary and never claims concurrency safety', () => {
    expect(presentBacklinksResult({}, { meta: { kind: 'backlinks', action: 'x', summary: 'S' } } as never))
      .toEqual({ card: 'generic', title: 'S' })
    expect(presentBacklinksResult({}, {} as never)).toBeUndefined()
    expect(backlinksIsConcurrencySafe()).toBe(false)
  })
})


describe('tool-backlinks plugin apply', () => {
  it('rejects a non-positive timeoutMs', () => {
    expect(() =>{  apply({} as never, { timeoutMs: 0 }) }).toThrow(/timeoutMs/u)
  })
})
