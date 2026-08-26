import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import BacklinksRuntime, {
  BacklinksError,
  type BacklinkBatchSourceProvider,
  type MailboxAddress,
  type MailboxProvider,
  type MailPollOptions,
  type VerificationMail,
} from '@deepseek-ai/dsh-backlinks'

const mail: VerificationMail = {
  subject: 'Verify your account',
  from: 'noreply@dir.example',
  text: 'Code 123456 or https://dir.example/verify?x=1',
  code: '123456',
  link: 'https://dir.example/verify?x=1',
  receivedAt: '2026-08-25T10:00:00Z',
}

function makeBatchSource(options: {
  id?: string
  available?: boolean
}): { provider: BacklinkBatchSourceProvider; calls: string[] } {
  const calls: string[] = []
  const provider: BacklinkBatchSourceProvider = {
    id: options.id ?? 'fake',
    available: () => options.available ?? true,
    listBatches: async () => { calls.push('listBatches'); return [] },
    getBatch: async () => { calls.push('getBatch'); throw new Error('unused') },
    claim: async () => { calls.push('claim'); throw new Error('unused') },
    heartbeat: async () => { calls.push('heartbeat'); throw new Error('unused') },
    release: async () => { calls.push('release') },
    reportItemResult: async () => { calls.push('reportItemResult'); throw new Error('unused') },
    addBadge: async () => { calls.push('addBadge'); throw new Error('unused') },
  }
  return { provider, calls }
}

function makeMailbox(options: { id?: string; available?: boolean; mail?: VerificationMail | null }): MailboxProvider {
  return {
    id: options.id ?? 'fake',
    available: () => options.available ?? true,
    createMailbox: async input => ({ email: `${input.localPart}@${input.domain}` }),
    pollMail: async (_address: MailboxAddress, _options: MailPollOptions) => options.mail ?? null,
  }
}

async function mountBacklinks(config: ConstructorParameters<typeof BacklinksRuntime>[1] = {}) {
  const ctx = new Context()
  await ctx.plugin(BacklinksRuntime, config)
  return { ctx, backlinks: ctx.backlinks }
}

afterEach(() => {
  delete process.env.DSH_BACKLINKS_BATCH_SOURCE
  delete process.env.DSH_BACKLINKS_MAILBOX
})

describe('BacklinksRuntime registration', () => {
  it('registers and unregisters providers through the returned disposers', async () => {
    const { backlinks } = await mountBacklinks()
    const { provider } = makeBatchSource({})
    const mailbox = makeMailbox({})

    const disposeSource = backlinks.registerBatchSourceProvider(provider)
    const disposeMailbox = backlinks.registerMailboxProvider(mailbox)
    await expect(backlinks.listBatches()).resolves.toEqual([])
    await expect(backlinks.createMailbox({ localPart: 'a', domain: 'b.test' })).resolves.toEqual({ email: 'a@b.test' })

    disposeSource()
    disposeMailbox()
    await expect(backlinks.listBatches()).rejects.toThrow(expect.objectContaining({ code: 'BACKLINKS_PROVIDER_UNAVAILABLE' }))
    await expect(backlinks.createMailbox({ localPart: 'a', domain: 'b.test' }))
      .rejects.toThrow(expect.objectContaining({ code: 'BACKLINKS_PROVIDER_UNAVAILABLE' }))
  })

  it('rejects duplicate ids per registry but allows the same id across registries', async () => {
    const { backlinks } = await mountBacklinks()
    backlinks.registerBatchSourceProvider(makeBatchSource({}).provider)
    backlinks.registerMailboxProvider(makeMailbox({}))
    expect(() => backlinks.registerBatchSourceProvider(makeBatchSource({}).provider))
      .toThrow(expect.objectContaining({ code: 'BACKLINKS_DUPLICATE_PROVIDER' }))
    expect(() => backlinks.registerMailboxProvider(makeMailbox({})))
      .toThrow(expect.objectContaining({ code: 'BACKLINKS_DUPLICATE_PROVIDER' }))
  })
})

describe('BacklinksRuntime provider selection', () => {
  it('rejects a configured id that is not registered', async () => {
    const { backlinks } = await mountBacklinks({ batchSourceProvider: 'ghost' })
    await expect(backlinks.listBatches())
      .rejects.toThrow(expect.objectContaining({ code: 'BACKLINKS_PROVIDER_CONFIGURED_MISSING' }))
  })

  it('rejects a configured id that is registered but unavailable', async () => {
    const { backlinks } = await mountBacklinks({ mailboxProvider: 'fake' })
    backlinks.registerMailboxProvider(makeMailbox({ available: false }))
    await expect(backlinks.createMailbox({ localPart: 'a', domain: 'b.test' }))
      .rejects.toThrow(expect.objectContaining({ code: 'BACKLINKS_PROVIDER_CONFIGURED_UNAVAILABLE' }))
  })

  it('rejects ambiguity when several usable providers are registered unconfigured', async () => {
    const { backlinks } = await mountBacklinks()
    backlinks.registerBatchSourceProvider(makeBatchSource({ id: 'a' }).provider)
    backlinks.registerBatchSourceProvider(makeBatchSource({ id: 'b' }).provider)
    await expect(backlinks.listBatches())
      .rejects.toThrow(expect.objectContaining({ code: 'BACKLINKS_PROVIDER_AMBIGUOUS' }))
  })

  it('honors the environment selection fields like config', async () => {
    process.env.DSH_BACKLINKS_BATCH_SOURCE = 'a'
    const { backlinks } = await mountBacklinks()
    backlinks.registerBatchSourceProvider(makeBatchSource({ id: 'a' }).provider)
    backlinks.registerBatchSourceProvider(makeBatchSource({ id: 'b' }).provider)
    await expect(backlinks.listBatches()).resolves.toEqual([])
  })
})

describe('BacklinksRuntime passthrough', () => {
  it('delegates every batch-source method to the resolved provider', async () => {
    const { backlinks } = await mountBacklinks()
    const calls: string[] = []
    backlinks.registerBatchSourceProvider({
      id: 'scripted',
      available: () => true,
      listBatches: async () => { calls.push('listBatches'); return [] },
      getBatch: async (id) => { calls.push(`getBatch:${id}`); throw new BacklinksError('no batch', 'BACKLINKS_NOT_FOUND') },
      claim: async (id, itemIds) => { calls.push(`claim:${id}:${itemIds?.join(',') ?? 'default'}`); throw new Error('unused') },
      heartbeat: async (leaseId) => { calls.push(`heartbeat:${leaseId}`); throw new Error('unused') },
      release: async (leaseId) => { calls.push(`release:${leaseId}`) },
      reportItemResult: async (itemId) => { calls.push(`result:${itemId}`); throw new Error('unused') },
      addBadge: async (websiteId) => { calls.push(`badge:${websiteId}`); throw new Error('unused') },
    })

    await backlinks.listBatches()
    await expect(backlinks.getBatch(7)).rejects.toThrow(expect.objectContaining({ code: 'BACKLINKS_NOT_FOUND' }))
    await expect(backlinks.claim(7, [1, 2])).rejects.toThrow()
    await expect(backlinks.claim(8)).rejects.toThrow()
    await expect(backlinks.heartbeat(9)).rejects.toThrow()
    await backlinks.release(9)
    await expect(backlinks.reportItemResult(10, { status: 'skipped', skipReason: 'x' })).rejects.toThrow()
    await expect(backlinks.addBadge(11, { name: 'n', html: '<b/>' })).rejects.toThrow()

    expect(calls).toEqual([
      'listBatches',
      'getBatch:7',
      'claim:7:1,2',
      'claim:8:default',
      'heartbeat:9',
      'release:9',
      'result:10',
      'badge:11',
    ])
  })

  it('polls mail through the resolved mailbox provider and returns null on timeout', async () => {
    const { backlinks } = await mountBacklinks()
    let polled = 0
    backlinks.registerMailboxProvider({
      id: 'scripted',
      available: () => true,
      createMailbox: async input => ({ email: `${input.localPart}@${input.domain}` }),
      pollMail: async (_address, options) => {
        polled += 1
        // The provider owns the bounded wait; the seam delegates once.
        return options.timeoutMs > 0 ? mail : null
      },
    })

    await expect(backlinks.createMailbox({ localPart: 'agent', domain: 'mail.test' }))
      .resolves.toEqual({ email: 'agent@mail.test' })
    await expect(backlinks.pollMail(
      { email: 'agent@mail.test' },
      { timeoutMs: 1_000, intervalMs: 1 },
    )).resolves.toEqual(mail)
    expect(polled).toBe(1)
  })
})
