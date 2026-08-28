import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Page } from 'playwright-core'

const { launchPersistentContext } = vi.hoisted(() => ({ launchPersistentContext: vi.fn() }))

vi.mock('playwright-core', () => ({ chromium: { launchPersistentContext } }))

import { apply, Config } from '@deepseek-ai/dsh-browser-playwright/src/index.ts'
import {
  PlaywrightBrowserProvider,
  PLAYWRIGHT_BROWSER_PROVIDER_ID,
  type ResolvedPlaywrightConfig,
} from '@deepseek-ai/dsh-browser-playwright/src/provider.ts'

function resolvedConfig(overrides: Partial<ResolvedPlaywrightConfig> = {}): ResolvedPlaywrightConfig {
  return {
    userDataDir: '.test-profile',
    headless: false,
    channel: 'chrome',
    defaultTimeoutMs: 5_000,
    launchArgs: [],
    ignoreDefaultArgs: [],
    windowPosition: undefined,
    ...overrides,
  }
}

/** One recorded locator action: which selector addressed what, and how. */
interface RecordedAction {
  selector: string
  method: string
  args: readonly unknown[]
}

/** Every playwright surface the session touches, as held mock handles. */
function fakePage(overrides: { innerText?: (selector: string) => Promise<string>; aria?: string } = {}) {
  const actions: RecordedAction[] = []
  const failures: { method: string; fn: () => void }[] = []
  const fire = (method: string): void => {
    const next = failures.shift()
    if (next !== undefined && next.method === method) next.fn()
  }
  const makeLocator = (selector: string): unknown => ({
    click: async (...args: unknown[]) => {
      fire('click')
      actions.push({ selector, method: 'click', args })
    },
    fill: async (...args: unknown[]) => {
      fire('fill')
      actions.push({ selector, method: 'fill', args })
    },
    selectOption: async (...args: unknown[]) => {
      fire('select')
      actions.push({ selector, method: 'select', args })
    },
    setInputFiles: async (...args: unknown[]) => {
      fire('upload')
      actions.push({ selector, method: 'upload', args })
    },
    waitFor: async (...args: unknown[]) => {
      fire('waitFor')
      actions.push({ selector, method: 'waitFor', args })
    },
    ariaSnapshot: async () => overrides.aria ?? '- button "Go"',
  })
  const frameScope = (frameSelector: string) => ({
    getByRole: (role: string, ...opts: unknown[]) =>
      makeLocator(`frame(${frameSelector})>>role:${role}${(opts[0] as { name?: string } | undefined)?.name !== undefined ? `|${(opts[0] as { name: string }).name}` : ''}`),
    getByLabel: (text: string) => makeLocator(`frame(${frameSelector})>>label:${text}`),
    getByPlaceholder: (text: string) => makeLocator(`frame(${frameSelector})>>placeholder:${text}`),
    getByText: (text: string) => makeLocator(`frame(${frameSelector})>>text:${text}`),
    locator: (css: string) => makeLocator(`frame(${frameSelector})>>${css}`),
  })
  const mocks = {
    goto: vi.fn(async () => null),
    screenshot: vi.fn(async () => Buffer.from('png-bytes')),
    waitForURL: vi.fn(async () => null),
    close: vi.fn(async () => undefined),
    press: vi.fn(async () => undefined),
    bringToFront: vi.fn(async () => undefined),
    xyClick: vi.fn(async () => undefined),
    on: vi.fn(),
    actions,
    failOnce: (method: string, fn: () => void) => {
      failures.push({ method, fn })
    },
  }
  const page = {
    url: () => 'https://example.com/listing',
    title: async () => 'Example Listing',
    innerText: overrides.innerText ?? (async () => 'page text'),
    goto: mocks.goto,
    screenshot: mocks.screenshot,
    waitForURL: mocks.waitForURL,
    close: mocks.close,
    bringToFront: mocks.bringToFront,
    keyboard: { press: mocks.press },
    mouse: { click: mocks.xyClick },
    on: mocks.on,
    isClosed: () => false,
    locator: (css: string) => makeLocator(css),
    frameLocator: (css: string) => frameScope(css),
    getByRole: (role: string, ...opts: unknown[]) =>
      makeLocator(`role:${role}${(opts[0] as { name?: string } | undefined)?.name !== undefined ? `|${(opts[0] as { name: string }).name}` : ''}`),
    getByLabel: (text: string) => makeLocator(`label:${text}`),
    getByPlaceholder: (text: string) => makeLocator(`placeholder:${text}`),
    getByText: (text: string) => makeLocator(`text:${text}`),
  } as unknown as Page
  return { page, mocks }
}

function fakeContext(pages: Page[]) {
  const allPages = [...pages]
  const created: ReturnType<typeof fakePage>[] = []
  const newPage = vi.fn(async () => {
    const fresh = fakePage()
    created.push(fresh)
    allPages.push(fresh.page)
    return fresh.page
  })
  const context = {
    pages: () => allPages,
    newPage,
    close: vi.fn(async () => undefined),
    on: vi.fn(),
  }
  return { context, mocks: { newPage, created } }
}

beforeEach(() => {
  launchPersistentContext.mockReset()
})

describe('PlaywrightBrowserProvider', () => {
  it('is always available without launching anything', () => {
    const provider = new PlaywrightBrowserProvider(resolvedConfig())
    expect(provider.id).toBe(PLAYWRIGHT_BROWSER_PROVIDER_ID)
    expect(provider.available()).toBe(true)
    expect(launchPersistentContext).not.toHaveBeenCalled()
  })

  it('launches a persistent context with the resolved options', async () => {
    const { context } = fakeContext([fakePage().page])
    launchPersistentContext.mockResolvedValueOnce(context)
    const provider = new PlaywrightBrowserProvider(resolvedConfig({
      headless: true,
      channel: '',
      launchArgs: ['--proxy-server=x'],
    }))

    const session = await provider.open()
    expect(launchPersistentContext).toHaveBeenCalledWith('.test-profile', {
      headless: true,
      timeout: 5_000,
      args: ['--proxy-server=x'],
    })
    await session.close()
    expect(context.close).toHaveBeenCalled()
  })

  it('positions the window offscreen when windowPosition is set', async () => {
    const { context } = fakeContext([fakePage().page])
    launchPersistentContext.mockResolvedValueOnce(context)
    const provider = new PlaywrightBrowserProvider(resolvedConfig({
      windowPosition: '-32000,-32000',
    }))

    await provider.open()
    expect(launchPersistentContext).toHaveBeenCalledWith('.test-profile', expect.objectContaining({
      args: ['--window-position=-32000,-32000'],
    }))
  })

  it('omits named Playwright default arguments for automation-hostile pages', async () => {
    const { context } = fakeContext([fakePage().page])
    launchPersistentContext.mockResolvedValueOnce(context)
    const provider = new PlaywrightBrowserProvider(resolvedConfig({
      ignoreDefaultArgs: ['--enable-automation'],
      launchArgs: ['--disable-blink-features=AutomationControlled'],
    }))

    await provider.open()
    expect(launchPersistentContext).toHaveBeenCalledWith('.test-profile', expect.objectContaining({
      ignoreDefaultArgs: ['--enable-automation'],
      args: ['--disable-blink-features=AutomationControlled'],
    }))
  })

  it('wraps launch failures as BROWSER_LAUNCH_FAILED', async () => {
    launchPersistentContext.mockRejectedValueOnce(new Error('chrome missing'))
    const provider = new PlaywrightBrowserProvider(resolvedConfig())

    await expect(provider.open()).rejects.toThrow(expect.objectContaining({ code: 'BROWSER_LAUNCH_FAILED' }))
  })

  it('wraps a non-Error launch failure message', async () => {
    launchPersistentContext.mockRejectedValueOnce('chrome missing')
    const provider = new PlaywrightBrowserProvider(resolvedConfig())
    await expect(provider.open()).rejects.toThrow(/chrome missing/u)
  })

  it('rejects an aborted launch signal', async () => {
    const provider = new PlaywrightBrowserProvider(resolvedConfig())
    const aborted = new AbortController()
    aborted.abort()
    await expect(provider.open(aborted.signal))
      .rejects.toThrow(expect.objectContaining({ code: 'BROWSER_ABORTED' }))
  })

  it('validates defaultTimeoutMs at open time', async () => {
    const provider = new PlaywrightBrowserProvider(resolvedConfig({ defaultTimeoutMs: 0 }))
    await expect(provider.open()).rejects.toThrow(/positive integer/u)
  })
})

describe('PlaywrightSession command dispatch', () => {
  async function mount(pages: Page[]) {
    const { context, mocks } = fakeContext(pages)
    launchPersistentContext.mockResolvedValueOnce(context)
    const provider = new PlaywrightBrowserProvider(resolvedConfig())
    return { session: await provider.open(), context, mocks }
  }

  it('navigates and returns a bounded page result', async () => {
    const made = fakePage()
    const { session } = await mount([made.page])

    const result = await session.act({ kind: 'navigate', url: 'https://example.com/', waitUntil: 'networkidle' })
    expect(result).toEqual({
      kind: 'page',
      page: 'p1',
      url: 'https://example.com/listing',
      title: 'Example Listing',
      text: 'page text',
      truncated: false,
    })
    expect(made.mocks.goto).toHaveBeenCalledWith('https://example.com/', { timeout: 5_000, waitUntil: 'networkidle' })
  })

  it('navigates with the default load state when waitUntil is omitted', async () => {
    const made = fakePage()
    const { session } = await mount([made.page])

    await session.act({ kind: 'navigate', url: 'https://example.com/' })
    expect(made.mocks.goto).toHaveBeenCalledWith('https://example.com/', { timeout: 5_000 })
  })

  it('captures the accessibility tree on an aria snapshot', async () => {
    const made = fakePage({ aria: '- button "Create Account"' })
    const { session } = await mount([made.page])

    const result = await session.act({ kind: 'snapshot', format: 'aria' })
    expect(result).toMatchObject({ kind: 'page', text: '- button "Create Account"', truncated: false })
  })

  it('bounds the aria snapshot at maxChars', async () => {
    const made = fakePage({ aria: '- button "Go"\n' })
    const { session } = await mount([made.page])

    const result = await session.act({ kind: 'snapshot', format: 'aria', maxChars: 5 })
    expect(result).toMatchObject({ truncated: true, text: '- but' })
  })

  it('truncates snapshot text at maxChars and flags it', async () => {
    const made = fakePage({ innerText: async () => 'a'.repeat(50) })
    const { session } = await mount([made.page])

    const result = await session.act({ kind: 'snapshot', maxChars: 10 })
    expect(result).toMatchObject({ kind: 'page', text: 'a'.repeat(10), truncated: true })
  })

  it('captures a selector-scoped snapshot', async () => {
    const made = fakePage({ innerText: async selector => `text of ${selector ?? 'body'}` })
    const { session } = await mount([made.page])

    const result = await session.act({ kind: 'snapshot', selector: '#main' })
    expect(result).toMatchObject({ kind: 'page', text: 'text of #main' })
  })

  it('acks click, fill, select, and upload through addressed locators', async () => {
    const made = fakePage()
    const { session } = await mount([made.page])

    await expect(session.act({ kind: 'click', selector: 'a.submit' })).resolves.toEqual({ kind: 'acked' })
    await expect(session.act({ kind: 'fill', selector: 'input[name=url]', value: 'https://x.test' })).resolves.toEqual({ kind: 'acked' })
    await expect(session.act({ kind: 'select', selector: 'select#cat', value: 'tools' })).resolves.toEqual({ kind: 'acked' })
    await expect(session.act({ kind: 'upload', selector: 'input[type=file]', files: ['/tmp/logo.png'] })).resolves.toEqual({ kind: 'acked' })

    expect(made.mocks.actions).toEqual([
      { selector: 'a.submit', method: 'click', args: [{ timeout: 5_000 }] },
      { selector: 'input[name=url]', method: 'fill', args: ['https://x.test', { timeout: 5_000 }] },
      { selector: 'select#cat', method: 'select', args: ['tools', { timeout: 5_000 }] },
      { selector: 'input[type=file]', method: 'upload', args: [['/tmp/logo.png'], { timeout: 5_000 }] },
    ])
  })

  it('addresses elements semantically by role, label, placeholder, and text', async () => {
    const made = fakePage()
    const { session } = await mount([made.page])

    await session.act({ kind: 'click', selector: 'role:button|Create Account' })
    await session.act({ kind: 'fill', selector: 'label:Email', value: 'a@b.test' })
    await session.act({ kind: 'fill', selector: 'placeholder:you@example.com', value: 'b@c.test' })
    await session.act({ kind: 'click', selector: 'text:Sign in' })
    await session.act({ kind: 'click', selector: 'role:link' })

    expect(made.mocks.actions.map(a => [a.method, a.selector])).toEqual([
      ['click', 'role:button|Create Account'],
      ['fill', 'label:Email'],
      ['fill', 'placeholder:you@example.com'],
      ['click', 'text:Sign in'],
      ['click', 'role:link'],
    ])
  })

  it('chains into iframes through frame(...)>> prefixes', async () => {
    const made = fakePage()
    const { session } = await mount([made.page])

    await session.act({ kind: 'click', selector: 'frame(#pay)>>role:button|Pay' })
    await session.act({ kind: 'fill', selector: 'frame(#pay)>>frame(input)>>#card', value: '4242' })

    expect(made.mocks.actions.map(a => [a.method, a.selector])).toEqual([
      ['click', 'frame(#pay)>>role:button|Pay'],
      ['fill', 'frame(#pay)>>frame(input)>>#card'],
    ])
  })

  it('clicks viewport coordinates from the xy selector', async () => {
    const made = fakePage()
    const { session } = await mount([made.page])

    await expect(session.act({ kind: 'click', selector: 'xy:120,45' })).resolves.toEqual({ kind: 'acked' })
    expect(made.mocks.xyClick).toHaveBeenCalledWith(120, 45)
    expect(made.mocks.actions).toEqual([])
  })

  it('rejects malformed addressing straight from the provider grammar', async () => {
    const { session } = await mount([fakePage().page])
    await expect(session.act({ kind: 'click', selector: 'xy:12,4e5' }))
      .rejects.toThrow(expect.objectContaining({ code: 'BROWSER_ACTION_FAILED' }))
    await expect(session.act({ kind: 'click', selector: 'role:|Pay' }))
      .rejects.toThrow(/role:<role>\|<name>/u)
    await expect(session.act({ kind: 'click', selector: 'role:button|' }))
      .rejects.toThrow(/role:<role>\|<name>/u)
    await expect(session.act({ kind: 'fill', selector: 'label:', value: 'x' }))
      .rejects.toThrow(/must be label:/u)
    await expect(session.act({ kind: 'fill', selector: 'xy:1,2', value: 'x' }))
      .rejects.toThrow(/xy addressing supports click only/u)
  })

  it('surfaces the addressed tab with bringToFront', async () => {
    const made = fakePage()
    const { session } = await mount([made.page])

    await expect(session.act({ kind: 'bringToFront' })).resolves.toEqual({ kind: 'acked' })
    expect(made.mocks.bringToFront).toHaveBeenCalledTimes(1)
  })

  it('presses a key through the keyboard', async () => {
    const made = fakePage()
    const { session } = await mount([made.page])

    await expect(session.act({ kind: 'press', key: 'Enter' })).resolves.toEqual({ kind: 'acked' })
    expect(made.mocks.press).toHaveBeenCalledWith('Enter')
  })

  it('returns a base64 screenshot', async () => {
    const made = fakePage()
    const { session } = await mount([made.page])

    await expect(session.act({ kind: 'screenshot' })).resolves.toEqual({
      kind: 'screenshot',
      pngBase64: Buffer.from('png-bytes').toString('base64'),
    })
    expect(made.mocks.screenshot).toHaveBeenCalledWith({ type: 'png', timeout: 5_000 })
  })

  it('waits for a selector or a url with the command timeout', async () => {
    const made = fakePage()
    const { session } = await mount([made.page])

    await expect(session.act({ kind: 'waitFor', selector: '.done' })).resolves.toEqual({ kind: 'acked' })
    expect(made.mocks.actions).toEqual([
      { selector: '.done', method: 'waitFor', args: [{ state: 'visible', timeout: 5_000 }] },
    ])

    await expect(session.act({ kind: 'waitFor', url: '**/thanks', timeoutMs: 1_000 })).resolves.toEqual({ kind: 'acked' })
    expect(made.mocks.waitForURL).toHaveBeenCalledWith('**/thanks', { timeout: 1_000 })

    await expect(session.act({ kind: 'waitFor', url: '**/again' })).resolves.toEqual({ kind: 'acked' })
    expect(made.mocks.waitForURL).toHaveBeenCalledWith('**/again', { timeout: 5_000 })
  })

  it('rejects waitFor without a selector or url', async () => {
    const { session } = await mount([fakePage().page])
    await expect(session.act({ kind: 'waitFor' }))
      .rejects.toThrow(expect.objectContaining({ code: 'BROWSER_ACTION_FAILED' }))
  })

  it('closes the active page on closePage', async () => {
    const made = fakePage()
    const { session } = await mount([made.page])

    await expect(session.act({ kind: 'closePage' })).resolves.toEqual({ kind: 'acked' })
    expect(made.mocks.close).toHaveBeenCalled()
  })

  it('opens a fresh tab when no page is left', async () => {
    const { session, mocks } = await mount([])

    await expect(session.act({ kind: 'snapshot' })).resolves.toMatchObject({ kind: 'page' })
    expect(mocks.newPage).toHaveBeenCalled()
  })

  it('rejects an unknown command kind through the closed-union default', async () => {
    const { session } = await mount([fakePage().page])
    await expect(session.act({ kind: 'bogus' } as never))
      .rejects.toThrow(/unhandled browser command kind/u)
  })

  it('wraps raw playwright failures as BROWSER_ACTION_FAILED', async () => {
    const made = fakePage()
    made.mocks.failOnce('click', () => {
      throw new Error('detached node')
    })
    const { session } = await mount([made.page])

    await expect(session.act({ kind: 'click', selector: 'a' }))
      .rejects.toThrow(expect.objectContaining({ code: 'BROWSER_ACTION_FAILED' }))
  })

  it('wraps non-Error command failures', async () => {
    const made = fakePage()
    made.mocks.failOnce('click', () => {
      throw 'detached string'
    })
    const { session } = await mount([made.page])
    await expect(session.act({ kind: 'click', selector: 'a' })).rejects.toThrow(/detached string/u)
  })

  it('marks the session closed when the browser context closes underneath', async () => {
    const { session, context } = await mount([fakePage().page])
    const closeHandlers = (context.on as unknown as ReturnType<typeof vi.fn>).mock.calls
      .filter(call => call[0] === 'close')
      .map(call => call[1] as () => void)
    expect(closeHandlers.length).toBeGreaterThan(0)
    for (const handler of closeHandlers) handler()

    await expect(session.act({ kind: 'snapshot' }))
      .rejects.toThrow(/browser session is closed/u)
  })

  it('rejects commands on a closed session and close is idempotent', async () => {
    const { session } = await mount([fakePage().page])
    await session.close()
    await session.close()

    await expect(session.act({ kind: 'snapshot' }))
      .rejects.toThrow(expect.objectContaining({ code: 'BROWSER_ACTION_FAILED' }))
  })

  it('rejects an aborted command signal before touching the browser', async () => {
    const { session } = await mount([fakePage().page])
    const aborted = new AbortController()
    aborted.abort()

    await expect(session.act({ kind: 'snapshot' }, aborted.signal))
      .rejects.toThrow(expect.objectContaining({ code: 'BROWSER_ABORTED' }))
  })

  it('swallows close errors from a dead browser', async () => {
    const { context } = fakeContext([fakePage().page])
    context.close.mockRejectedValue(new Error('already dead'))
    launchPersistentContext.mockResolvedValueOnce(context)
    const provider = new PlaywrightBrowserProvider(resolvedConfig())
    const session = await provider.open()

    await expect(session.close()).resolves.toBeUndefined()
  })

  it('opens a new tab bound to the caller-named ref and reuses it after', async () => {
    const first = fakePage()
    const { session, mocks } = await mount([first.page])

    const opened = await session.act({ kind: 'navigate', page: 'work', url: 'https://a.test/' })
    expect(opened).toMatchObject({ kind: 'page', page: 'work' })
    expect(mocks.newPage).toHaveBeenCalledTimes(1)
    expect(first.mocks.goto).not.toHaveBeenCalled()

    const again = await session.act({ kind: 'navigate', page: 'work', url: 'https://a.test/2' })
    expect(again).toMatchObject({ kind: 'page', page: 'work' })
    expect(mocks.newPage).toHaveBeenCalledTimes(1)
    expect(mocks.created[0]?.mocks.goto).toHaveBeenCalledWith('https://a.test/2', expect.anything())
  })

  it('rejects a command naming an unknown or closed ref', async () => {
    const { session } = await mount([fakePage().page])
    await expect(session.act({ kind: 'click', page: 'nope', selector: 'a' }))
      .rejects.toThrow(/browser page "nope" is not open/u)
  })

  it('orders commands on one ref and overlaps commands across refs', async () => {
    const { session } = await mount([fakePage().page])
    await session.act({ kind: 'navigate', page: 'a', url: 'https://a.test/' })
    await session.act({ kind: 'navigate', page: 'b', url: 'https://b.test/' })

    const done: string[] = []
    const chainA = (async () => {
      await session.act({ kind: 'fill', page: 'a', selector: 'input', value: 'x' })
      done.push('a-fill')
      await session.act({ kind: 'click', page: 'a', selector: 'button' })
      done.push('a-click')
    })()
    const chainB = session.act({ kind: 'snapshot', page: 'b' }).then(() => {
      done.push('b-snapshot')
    })
    await Promise.all([chainA, chainB])
    expect(done.indexOf('b-snapshot')).toBeLessThan(done.indexOf('a-click'))
  })

  it('drops refs whose tab closed on its own and re-adopts the live last tab', async () => {
    const first = fakePage()
    const { session, context, mocks } = await mount([first.page])
    await session.act({ kind: 'navigate', page: 'a', url: 'https://a.test/' })
    await session.act({ kind: 'navigate', page: 'b', url: 'https://b.test/' })
    expect(mocks.created.length).toBe(2)

    const tabB = mocks.created[1]!
    const live = context.pages()
    live.splice(live.indexOf(tabB.page), 1)
    for (const call of (tabB.page.on as unknown as ReturnType<typeof vi.fn>).mock.calls) {
      if (call[0] === 'close') (call[1] as () => void)()
    }
    await expect(session.act({ kind: 'click', page: 'b', selector: 'a' }))
      .rejects.toThrow(/browser page "b" is not open/u)

    const tabA = mocks.created[0]!
    await expect(session.act({ kind: 'click', selector: 'button' })).resolves.toMatchObject({ kind: 'acked' })
    expect(tabA.mocks.actions.some(a => a.method === 'click' && a.selector === 'button')).toBe(true)
    expect(context.pages().length).toBe(2)

    const live2 = context.pages()
    live2.splice(live2.indexOf(first.page), 1)
    for (const call of (first.page.on as unknown as ReturnType<typeof vi.fn>).mock.calls) {
      if (call[0] === 'close') (call[1] as () => void)()
    }
    await session.act({ kind: 'click', page: 'a', selector: 'a' })
    expect(context.pages().length).toBe(1)
  })

  it('adopts a site-opened popup as the no-ref addressing target', async () => {
    const { session, context } = await mount([])
    const popup = fakePage()
    context.pages().push(popup.page)

    await expect(session.act({ kind: 'click', selector: 'a' })).resolves.toMatchObject({ kind: 'acked' })
    expect(popup.mocks.actions.some(a => a.method === 'click' && a.selector === 'a')).toBe(true)
  })

  it('covers the no-ref snapshot fallback and legacy closePage ref', async () => {
    const first = fakePage()
    const { session } = await mount([first.page])
    await expect(session.act({ kind: 'snapshot' })).resolves.toMatchObject({ kind: 'page', page: 'p1' })
    await expect(session.act({ kind: 'closePage' })).resolves.toMatchObject({ kind: 'acked' })
    expect(first.mocks.close).toHaveBeenCalledTimes(1)
    const reopened = await session.act({ kind: 'snapshot', maxChars: 10 })
    expect(reopened).toMatchObject({ kind: 'page' })
  })

  it('closes a page by ref and drops its addressing', async () => {
    const { session } = await mount([fakePage().page])
    await session.act({ kind: 'navigate', page: 'temp', url: 'https://t.test/' })
    await expect(session.act({ kind: 'closePage', page: 'temp' })).resolves.toMatchObject({ kind: 'acked' })
    await expect(session.act({ kind: 'snapshot', page: 'temp' }))
      .rejects.toThrow(/browser page "temp" is not open/u)
  })
})

describe('browser-playwright plugin apply', () => {
  it('registers the provider with defaulted config', () => {
    const registerProvider = vi.fn()
    const defaulted = Config({}) as ResolvedPlaywrightConfig
    expect(defaulted).toMatchObject({ userDataDir: '.browser-profile', headless: false, channel: 'chrome' })

    apply({ browser: { registerProvider } } as never, defaulted as never)
    expect(registerProvider).toHaveBeenCalledWith(expect.objectContaining({ id: 'playwright' }))
  })

  it('rejects an empty userDataDir and a non-positive defaultTimeoutMs', () => {
    expect(() => {
      apply({ browser: { registerProvider: vi.fn() } } as never, { userDataDir: '  ' })
    }).toThrow(/userDataDir/u)
    expect(() => {
      apply({ browser: { registerProvider: vi.fn() } } as never, { userDataDir: '.x', defaultTimeoutMs: -1 })
    }).toThrow(/defaultTimeoutMs/u)
  })
})
