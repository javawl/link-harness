import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import BacklinksRuntime from '@deepseek-ai/dsh-backlinks'
import { FileSettingsProvider } from '@deepseek-ai/dsh-settings-file'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import * as Supermanager from '@deepseek-ai/dsh-backlinks-supermanager/src/index.ts'

const NS = settingsNamespace('backlinks-supermanager')
const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.SUPERMANAGER_TOKEN
})

/** Boot the backlinks runtime, a settings file provider, and the supermanager plugin. */
async function boot(settingsPath: string, config: Supermanager.Config): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(BacklinksRuntime)
  await ctx.plugin(FileSettingsProvider, { path: settingsPath, watch: false })
  await ctx.plugin(Supermanager, config)
  return ctx
}

/** Authorization header captured on the n-th fetch call. */
function bearerOf(call: number): string {
  const init = fetchMock.mock.calls[call]?.[1] as { headers: { authorization: string } } | undefined
  return init?.headers.authorization ?? ''
}

function okBatches(): Response {
  return new Response(JSON.stringify({ batches: [] }), { status: 200 })
}

describe('backlinks-supermanager settings section', () => {
  it('layers the section over the entry and the environment without a restart', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-smg-settings-'))
    process.env.SUPERMANAGER_TOKEN = 'smag_env'
    fetchMock.mockImplementation(() => Promise.resolve(okBatches()))
    const ctx = await boot(join(dir, 'settings.yaml'), { baseUrl: 'http://sm.test' })
    try {
      await ctx.backlinks.listBatches()
      expect(fetchMock.mock.calls[0]?.[0]).toBe('http://sm.test/api/agent/batches')
      expect(bearerOf(0)).toBe('Bearer smag_env')

      await ctx.settings.update(NS, { token: 'smag_settings' })
      await ctx.backlinks.listBatches()
      expect(bearerOf(1)).toBe('Bearer smag_settings')

      await ctx.settings.update(NS, { baseUrl: 'http://sm2.test', token: 'smag_settings' })
      await ctx.backlinks.listBatches()
      expect(fetchMock.mock.calls[2]?.[0]).toBe('http://sm2.test/api/agent/batches')
    } finally {
      await ctx.fiber.dispose()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('refuses a non-http settings baseUrl and keeps the previous registration serving', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-smg-settings-'))
    fetchMock.mockImplementation(() => Promise.resolve(okBatches()))
    const ctx = await boot(join(dir, 'settings.yaml'), { baseUrl: 'http://sm.test', token: 'smag_entry' })
    try {
      await expect(ctx.settings.update(NS, { baseUrl: 'ftp://sm.test' })).rejects.toThrow(/baseUrl/u)
      await ctx.backlinks.listBatches()
      expect(fetchMock.mock.calls[0]?.[0]).toBe('http://sm.test/api/agent/batches')
      expect(bearerOf(0)).toBe('Bearer smag_entry')
    } finally {
      await ctx.fiber.dispose()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('is unavailable until a token exists and again once every layer is empty', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-smg-settings-'))
    fetchMock.mockImplementation(() => Promise.resolve(okBatches()))
    const ctx = await boot(join(dir, 'settings.yaml'), { baseUrl: 'http://sm.test' })
    try {
      await expect(ctx.backlinks.listBatches()).rejects.toThrow(/usable/u)
      await ctx.settings.update(NS, { token: 'smag_settings' })
      await ctx.backlinks.listBatches()
      expect(bearerOf(0)).toBe('Bearer smag_settings')
      await ctx.settings.update(NS, { token: '' })
      await expect(ctx.backlinks.listBatches()).rejects.toThrow(/usable/u)
    } finally {
      await ctx.fiber.dispose()
      await rm(dir, { recursive: true, force: true })
    }
  })
})
