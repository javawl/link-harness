import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import BacklinksRuntime from '@deepseek-ai/dsh-backlinks'
import * as Supermanager from '@deepseek-ai/dsh-backlinks-supermanager/src/index.ts'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.SUPERMANAGER_TOKEN
})

/** Boot the backlinks runtime and the supermanager plugin over one config. */
async function boot(config: never): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(BacklinksRuntime)
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

describe('backlinks-supermanager config resolution', () => {
  it('reads baseUrl from the entry and re-reads the env token per request without a restart', async () => {
    process.env.SUPERMANAGER_TOKEN = 'smag_env'
    fetchMock.mockImplementation(() => Promise.resolve(okBatches()))
    const ctx = await boot({ baseUrl: 'http://sm.test' } as never)
    try {
      await ctx.backlinks.listBatches()
      expect(fetchMock.mock.calls[0]?.[0]).toBe('http://sm.test/api/agent/batches')
      expect(bearerOf(0)).toBe('Bearer smag_env')

      // The resolver reads the environment at each use, so a rotation needs
      // no restart and no re-registration.
      process.env.SUPERMANAGER_TOKEN = 'smag_rotated'
      await ctx.backlinks.listBatches()
      expect(bearerOf(1)).toBe('Bearer smag_rotated')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('prefers a declared token over the environment', async () => {
    process.env.SUPERMANAGER_TOKEN = 'smag_env'
    fetchMock.mockImplementation(() => Promise.resolve(okBatches()))
    const ctx = await boot({ baseUrl: 'http://sm.test', token: 'smag_declared' } as never)
    try {
      await ctx.backlinks.listBatches()
      expect(bearerOf(0)).toBe('Bearer smag_declared')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('is unavailable while no base URL or token resolves', async () => {
    delete process.env.SUPERMANAGER_TOKEN
    const ctx = await boot({} as never)
    try {
      await expect(ctx.backlinks.listBatches()).rejects.toThrow()
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
