import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import BacklinksRuntime from '@deepseek-ai/dsh-backlinks'
import * as CloudMail from '@deepseek-ai/dsh-backlinks-cloud-mail/src/index.ts'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.CLOUDMAIL_TOKEN
})

/** Boot the backlinks runtime and the cloud-mail plugin over one config. */
async function boot(config: never): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(BacklinksRuntime)
  await ctx.plugin(CloudMail, config)
  return ctx
}

/** Authorization header captured on the n-th fetch call. */
function authOf(call: number): string {
  const init = fetchMock.mock.calls[call]?.[1] as { headers: { authorization: string } } | undefined
  return init?.headers.authorization ?? ''
}

function okAddress(): Response {
  return new Response(JSON.stringify({}), { status: 200 })
}

describe('backlinks-cloud-mail config resolution', () => {
  it('reads baseUrl from the entry and re-reads the env token per request without a restart', async () => {
    process.env.CLOUDMAIL_TOKEN = 'mail_env'
    fetchMock.mockImplementation(() => Promise.resolve(okAddress()))
    const ctx = await boot({ baseUrl: 'https://mail.test/api' } as never)
    try {
      await ctx.backlinks.createMailbox({ localPart: 'a', domain: 'b.test' })
      expect(fetchMock.mock.calls[0]?.[0]).toBe('https://mail.test/api/public/addUser')
      expect(authOf(0)).toBe('mail_env')

      // The resolver reads the environment at each use, so a rotation needs
      // no restart and no re-registration.
      process.env.CLOUDMAIL_TOKEN = 'mail_rotated'
      await ctx.backlinks.createMailbox({ localPart: 'a', domain: 'b.test' })
      expect(authOf(1)).toBe('mail_rotated')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('prefers a declared token over the environment', async () => {
    process.env.CLOUDMAIL_TOKEN = 'mail_env'
    fetchMock.mockImplementation(() => Promise.resolve(okAddress()))
    const ctx = await boot({ baseUrl: 'https://mail.test/api', token: 'mail_declared' } as never)
    try {
      await ctx.backlinks.createMailbox({ localPart: 'a', domain: 'b.test' })
      expect(authOf(0)).toBe('mail_declared')
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
