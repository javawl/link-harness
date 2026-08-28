import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import BacklinksRuntime from '@deepseek-ai/dsh-backlinks'
import { FileSettingsProvider } from '@deepseek-ai/dsh-settings-file'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import * as CloudMail from '@deepseek-ai/dsh-backlinks-cloud-mail/src/index.ts'

const NS = settingsNamespace('backlinks-cloud-mail')
const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.CLOUDMAIL_TOKEN
})

/** Boot the backlinks runtime, a settings file provider, and the cloud-mail plugin. */
async function boot(settingsPath: string, config: CloudMail.Config): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(BacklinksRuntime)
  await ctx.plugin(FileSettingsProvider, { path: settingsPath, watch: false })
  await ctx.plugin(CloudMail, config)
  return ctx
}

/** Authorization header captured on the n-th fetch call. */
function bearerOf(call: number): string {
  const init = fetchMock.mock.calls[call]?.[1] as { headers: { authorization: string } } | undefined
  return init?.headers.authorization ?? ''
}

function okEmpty(): Response {
  return new Response(JSON.stringify({ code: 200, message: 'success', data: {} }), { status: 200 })
}

describe('backlinks-cloud-mail settings section', () => {
  it('layers the section over the entry and the environment without a restart', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-cmail-settings-'))
    process.env.CLOUDMAIL_TOKEN = 'mail_env'
    fetchMock.mockImplementation(() => Promise.resolve(okEmpty()))
    const ctx = await boot(join(dir, 'settings.yaml'), { baseUrl: 'https://mail.test/api' })
    try {
      await ctx.backlinks.createMailbox({ localPart: 'op', domain: 'test' })
      expect(fetchMock.mock.calls[0]?.[0]).toBe('https://mail.test/api/public/addUser')
      expect(bearerOf(0)).toBe('mail_env')

      await ctx.settings.update(NS, { token: 'mail_settings' })
      await ctx.backlinks.createMailbox({ localPart: 'op', domain: 'test' })
      expect(bearerOf(1)).toBe('mail_settings')

      await ctx.settings.update(NS, { baseUrl: 'https://mail2.test/api', token: 'mail_settings' })
      await ctx.backlinks.createMailbox({ localPart: 'op', domain: 'test' })
      expect(fetchMock.mock.calls[2]?.[0]).toBe('https://mail2.test/api/public/addUser')
    } finally {
      await ctx.fiber.dispose()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('refuses a non-http settings baseUrl and keeps the previous registration serving', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-cmail-settings-'))
    fetchMock.mockImplementation(() => Promise.resolve(okEmpty()))
    const ctx = await boot(join(dir, 'settings.yaml'), { baseUrl: 'https://mail.test/api', token: 'mail_entry' })
    try {
      await expect(ctx.settings.update(NS, { baseUrl: 'ftp://mail.test' })).rejects.toThrow(/baseUrl/u)
      await ctx.backlinks.createMailbox({ localPart: 'op', domain: 'test' })
      expect(fetchMock.mock.calls[0]?.[0]).toBe('https://mail.test/api/public/addUser')
      expect(bearerOf(0)).toBe('mail_entry')
    } finally {
      await ctx.fiber.dispose()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('is unavailable until a token exists and again once every layer is empty', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-cmail-settings-'))
    fetchMock.mockImplementation(() => Promise.resolve(okEmpty()))
    const ctx = await boot(join(dir, 'settings.yaml'), { baseUrl: 'https://mail.test/api' })
    try {
      await expect(ctx.backlinks.createMailbox({ localPart: 'op', domain: 'test' })).rejects.toThrow(/usable/u)
      await ctx.settings.update(NS, { token: 'mail_settings' })
      await ctx.backlinks.createMailbox({ localPart: 'op', domain: 'test' })
      expect(bearerOf(0)).toBe('mail_settings')
      await ctx.settings.update(NS, { token: '' })
      await expect(ctx.backlinks.createMailbox({ localPart: 'op', domain: 'test' })).rejects.toThrow(/usable/u)
    } finally {
      await ctx.fiber.dispose()
      await rm(dir, { recursive: true, force: true })
    }
  })
})
