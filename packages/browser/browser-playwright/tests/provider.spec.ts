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
    ...overrides,
  }
}

/** Every playwright method the session touches, as held mock handles. */
function fakePage(overrides: { innerText?: (selector: string) => Promise<string> } = {}) {
  const mocks = {
    goto: vi.fn(async () => null),
    click: vi.fn(async () => null),
    fill: vi.fn(async () => null),
    selectOption: vi.fn(async () => [] as string[]),
    setInputFiles: vi.fn(async () => undefined),
    screenshot: vi.fn(async () => Buffer.from('png-bytes')),
    waitForSelector: vi.fn(async () => null),
    waitForURL: vi.fn(async () => null),
    close: vi.fn(async () => undefined),
    press: vi.fn(async () => undefined),
  }
  const page = {
    url: () => 'https://example.com/listing',
    title: async () => 'Example Listing',
    innerText: overrides.innerText ?? (async () => 'page text'),
    goto: mocks.goto,
    click: mocks.click,
    fill: mocks.fill,
    selectOption: mocks.selectOption,
    setInputFiles: mocks.setInputFiles,
    screenshot: mocks.screenshot,
    waitForSelector: mocks.waitForSelector,
    waitForURL: mocks.waitForURL,
    close: mocks.close,
    keyboard: { press: mocks.press },
  } as unknown as Page
  return { page, mocks }
}

function fakeContext(pages: Page[]) {
  const allPages = [...pages]
  const newPage = vi.fn(async () => {
    const fresh = fakePage()
    allPages.push(fresh.page)
    return fresh.page
  })
  const context = {
    pages: () => allPages,
    newPage,
    close: vi.fn(async () => undefined),
    on: vi.fn(),
  }
  return { context, mocks: { newPage } }
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

  it('acks click, fill, select, and upload through their page methods', async () => {
    const made = fakePage()
    const { session } = await mount([made.page])

    await expect(session.act({ kind: 'click', selector: 'a.submit' })).resolves.toEqual({ kind: 'acked' })
    expect(made.mocks.click).toHaveBeenCalledWith('a.submit', { timeout: 5_000 })

    await expect(session.act({ kind: 'fill', selector: 'input[name=url]', value: 'https://x.test' })).resolves.toEqual({ kind: 'acked' })
    expect(made.mocks.fill).toHaveBeenCalledWith('input[name=url]', 'https://x.test', { timeout: 5_000 })

    await expect(session.act({ kind: 'select', selector: 'select#cat', value: 'tools' })).resolves.toEqual({ kind: 'acked' })
    expect(made.mocks.selectOption).toHaveBeenCalledWith('select#cat', 'tools', { timeout: 5_000 })

    await expect(session.act({ kind: 'upload', selector: 'input[type=file]', files: ['/tmp/logo.png'] })).resolves.toEqual({ kind: 'acked' })
    expect(made.mocks.setInputFiles).toHaveBeenCalledWith('input[type=file]', ['/tmp/logo.png'], { timeout: 5_000 })
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
    expect(made.mocks.waitForSelector).toHaveBeenCalledWith('.done', { timeout: 5_000 })

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
    made.mocks.click.mockImplementationOnce(async () => {
      throw new Error('detached node')
    })
    const { session } = await mount([made.page])

    await expect(session.act({ kind: 'click', selector: 'a' }))
      .rejects.toThrow(expect.objectContaining({ code: 'BROWSER_ACTION_FAILED' }))
  })

  it('wraps non-Error command failures', async () => {
    const made = fakePage()
    made.mocks.click.mockImplementationOnce(async () => {
      throw 'detached string'
    })
    const { session } = await mount([made.page])
    await expect(session.act({ kind: 'click', selector: 'a' })).rejects.toThrow(/detached string/u)
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
