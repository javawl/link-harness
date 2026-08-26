import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import BrowserRuntime, {
  BrowserError,
  type BrowserAutomationProvider,
  type BrowserCommand,
  type BrowserResult,
  type BrowserSession,
} from '@deepseek-ai/dsh-browser'

const pageResult: BrowserResult = {
  kind: 'page',
  url: 'https://example.com/',
  title: 'Example',
  text: 'hello',
  truncated: false,
}

/** A scripted provider that opens a fresh session per call and records commands. */
function makeProvider(options: {
  id?: string
  available?: boolean
  onCommand?: (command: BrowserCommand, session: ScriptedSession) => Promise<BrowserResult> | BrowserResult
  openError?: Error
}): { provider: BrowserAutomationProvider; sessions: ScriptedSession[]; opens: number } {
  const sessions: ScriptedSession[] = []
  const provider: BrowserAutomationProvider = {
    id: options.id ?? 'fake',
    available: () => options.available ?? true,
    open: async () => {
      if (options.openError) throw options.openError
      const session = new ScriptedSession(options.onCommand)
      sessions.push(session)
      return session
    },
  }
  return { provider, sessions, get opens() { return sessions.length } }
}

class ScriptedSession implements BrowserSession {
  closed = false
  commands: BrowserCommand[] = []

  constructor(
    private readonly onCommand?: (command: BrowserCommand, session: ScriptedSession) => Promise<BrowserResult> | BrowserResult,
  ) {}

  async act(command: BrowserCommand): Promise<BrowserResult> {
    if (this.closed) throw new Error('session closed')
    this.commands.push(command)
    const result = this.onCommand ? await this.onCommand(command, this) : pageResult
    return result
  }

  async close(): Promise<void> {
    this.closed = true
  }
}

async function mountBrowser(config: ConstructorParameters<typeof BrowserRuntime>[1] = {}) {
  const ctx = new Context()
  await ctx.plugin(BrowserRuntime, config)
  return { ctx, browser: ctx.browser }
}

afterEach(() => {
  delete process.env.DSH_BROWSER_PROVIDER
})

describe('BrowserRuntime provider registration', () => {
  it('registers a provider and unregisters it via the returned disposer', async () => {
    const { browser } = await mountBrowser()
    const { provider } = makeProvider({})

    const dispose = browser.registerProvider(provider)
    dispose()
    await expect(browser.act({ kind: 'snapshot' }))
      .rejects.toThrow(expect.objectContaining({ code: 'BROWSER_PROVIDER_UNAVAILABLE' }))
  })

  it('keeps serving an already-open session after its provider unregisters', async () => {
    const { browser } = await mountBrowser()
    const made = makeProvider({})
    const dispose = browser.registerProvider(made.provider)

    await expect(browser.act({ kind: 'snapshot' })).resolves.toMatchObject({ kind: 'page' })
    dispose()
    await expect(browser.act({ kind: 'click', selector: 'a' })).resolves.toMatchObject({ kind: 'page' })
    expect(made.opens).toBe(1)
  })

  it('throws BROWSER_DUPLICATE_PROVIDER on a duplicate id', async () => {
    const { browser } = await mountBrowser()
    browser.registerProvider(makeProvider({}).provider)
    expect(() => browser.registerProvider(makeProvider({}).provider))
      .toThrow(expect.objectContaining({ code: 'BROWSER_DUPLICATE_PROVIDER' }))
  })
})

describe('BrowserRuntime provider selection', () => {
  it('rejects a configured id that is not registered', async () => {
    const { browser } = await mountBrowser({ provider: 'ghost' })
    await expect(browser.act({ kind: 'snapshot' }))
      .rejects.toThrow(expect.objectContaining({ code: 'BROWSER_PROVIDER_CONFIGURED_MISSING' }))
  })

  it('rejects a configured id that is registered but unavailable', async () => {
    const { browser } = await mountBrowser({ provider: 'fake' })
    browser.registerProvider(makeProvider({ available: false }).provider)
    await expect(browser.act({ kind: 'snapshot' }))
      .rejects.toThrow(expect.objectContaining({ code: 'BROWSER_PROVIDER_CONFIGURED_UNAVAILABLE' }))
  })

  it('rejects when multiple usable providers are registered and none is configured', async () => {
    const { browser } = await mountBrowser()
    browser.registerProvider(makeProvider({ id: 'a' }).provider)
    browser.registerProvider(makeProvider({ id: 'b' }).provider)
    await expect(browser.act({ kind: 'snapshot' }))
      .rejects.toThrow(expect.objectContaining({ code: 'BROWSER_PROVIDER_AMBIGUOUS' }))
  })

  it('honors $DSH_BROWSER_PROVIDER like the provider config field', async () => {
    process.env.DSH_BROWSER_PROVIDER = 'a'
    const { browser } = await mountBrowser()
    browser.registerProvider(makeProvider({ id: 'a' }).provider)
    browser.registerProvider(makeProvider({ id: 'b' }).provider)
    await expect(browser.act({ kind: 'snapshot' })).resolves.toMatchObject({ kind: 'page' })
  })
})

describe('BrowserRuntime session lifecycle', () => {
  it('opens the session lazily and reuses it across commands', async () => {
    const { browser } = await mountBrowser()
    const made = makeProvider({})
    browser.registerProvider(made.provider)

    await browser.act({ kind: 'navigate', url: 'https://example.com/' })
    await browser.act({ kind: 'click', selector: 'a' })

    expect(made.opens).toBe(1)
    expect(made.sessions[0]?.commands.map(command => command.kind)).toEqual(['navigate', 'click'])
  })

  it('serializes commands so each observes the previous settled state', async () => {
    const { browser } = await mountBrowser()
    const order: string[] = []
    browser.registerProvider(makeProvider({
      onCommand: command => new Promise((resolve) => {
        setTimeout(() => {
          order.push(command.kind)
          resolve(pageResult)
        }, command.kind === 'navigate' ? 20 : 1)
      }),
    }).provider)

    await Promise.all([
      browser.act({ kind: 'navigate', url: 'https://example.com/' }),
      browser.act({ kind: 'snapshot' }),
    ])
    expect(order).toEqual(['navigate', 'snapshot'])
  })

  it('discards the session after a raw provider failure and relaunches on the next command', async () => {
    const { browser } = await mountBrowser()
    let failFirst = true
    const made = makeProvider({
      onCommand: () => {
        if (failFirst) {
          failFirst = false
          throw new Error('page crashed')
        }
        return pageResult
      },
    })
    browser.registerProvider(made.provider)

    await expect(browser.act({ kind: 'snapshot' }))
      .rejects.toThrow(expect.objectContaining({ code: 'BROWSER_ACTION_FAILED' }))
    await expect(browser.act({ kind: 'snapshot' })).resolves.toMatchObject({ kind: 'page' })

    expect(made.opens).toBe(2)
  })

  it('keeps the session when the provider throws a BrowserError itself', async () => {
    const { browser } = await mountBrowser()
    const made = makeProvider({
      onCommand: () => { throw new BrowserError('aborted in provider', 'BROWSER_ABORTED') },
    })
    browser.registerProvider(made.provider)

    await expect(browser.act({ kind: 'snapshot' }))
      .rejects.toThrow(expect.objectContaining({ code: 'BROWSER_ABORTED' }))
    await expect(browser.act({ kind: 'snapshot' }))
      .rejects.toThrow(expect.objectContaining({ code: 'BROWSER_ABORTED' }))
    expect(made.opens).toBe(1)
  })

  it('wraps a raw launch failure as BROWSER_LAUNCH_FAILED', async () => {
    const { browser } = await mountBrowser()
    browser.registerProvider(makeProvider({ openError: new Error('no chrome') }).provider)

    await expect(browser.act({ kind: 'snapshot' }))
      .rejects.toThrow(expect.objectContaining({ code: 'BROWSER_LAUNCH_FAILED' }))
  })

  it('wraps a non-Error launch failure message', async () => {
    const { browser } = await mountBrowser()
    browser.registerProvider(makeProvider({ openError: 'just a string' as never }).provider)

    await expect(browser.act({ kind: 'snapshot' }))
      .rejects.toThrow(/just a string/u)
  })

  it('passes a provider BrowserError from launch through unwrapped', async () => {
    const { browser } = await mountBrowser()
    browser.registerProvider({
      id: 'fail-open',
      available: () => true,
      open: async () => {
        throw new BrowserError('provider refused', 'BROWSER_LAUNCH_FAILED')
      },
    })

    await expect(browser.act({ kind: 'snapshot' }))
      .rejects.toThrow(expect.objectContaining({ code: 'BROWSER_LAUNCH_FAILED', message: 'provider refused' }))
  })

  it('wraps a non-Error command failure message', async () => {
    const { browser } = await mountBrowser()
    browser.registerProvider(makeProvider({
      onCommand: () => {
        throw 'detached string'
      },
    }).provider)

    await expect(browser.act({ kind: 'snapshot' }))
      .rejects.toThrow(/detached string/u)
  })

  it('rejects an already-aborted signal before launch and before dispatch', async () => {
    const { browser } = await mountBrowser()
    const made = makeProvider({})
    browser.registerProvider(made.provider)

    const aborted = new AbortController()
    aborted.abort()
    await expect(browser.act({ kind: 'snapshot' }, aborted.signal))
      .rejects.toThrow(expect.objectContaining({ code: 'BROWSER_ABORTED' }))
    expect(made.opens).toBe(0)

    await browser.act({ kind: 'snapshot' })
    await expect(browser.act({ kind: 'snapshot' }, aborted.signal))
      .rejects.toThrow(expect.objectContaining({ code: 'BROWSER_ABORTED' }))
  })

  it('closeSession closes the browser and the next command reopens it', async () => {
    const { browser } = await mountBrowser()
    const made = makeProvider({})
    browser.registerProvider(made.provider)

    await browser.act({ kind: 'snapshot' })
    await browser.closeSession()
    expect(made.sessions[0]?.closed).toBe(true)

    await browser.act({ kind: 'snapshot' })
    expect(made.opens).toBe(2)
  })

  it('closeSession is safe when no session exists', async () => {
    const { browser } = await mountBrowser()
    await expect(browser.closeSession()).resolves.toBeUndefined()
  })

  it('swallows a provider close error while discarding the session', async () => {
    const { browser } = await mountBrowser()
    let closeCalls = 0
    const session: BrowserSession = {
      act: () => { throw new Error('boom') },
      close: async () => {
        closeCalls += 1
        throw new Error('close failed')
      },
    }
    browser.registerProvider({ id: 'closing', available: () => true, open: async () => session })

    await expect(browser.act({ kind: 'snapshot' }))
      .rejects.toThrow(expect.objectContaining({ code: 'BROWSER_ACTION_FAILED' }))
    await expect(browser.closeSession()).resolves.toBeUndefined()
    expect(closeCalls).toBeGreaterThanOrEqual(1)
  })
})
