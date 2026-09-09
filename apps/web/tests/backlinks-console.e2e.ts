/** Real Web composition with local batch HTTP data and a no-op model adapter. */
import { createServer, type Server } from 'node:http'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { LlmAdapter, type StreamChunk } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import {
  captureStableAria, compareOrRefreshGolden, launchWebScaffold, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { connectFreshWorkspaceZh, ZH_BROWSER_LOCALE } from './support.ts'

const SNAPSHOTS = fileURLToPath(new URL('./snapshots/backlinks-console/', import.meta.url))
const SHOTS = fileURLToPath(new URL('../../../.playwright-mcp/backlinks-console/', import.meta.url))

/** External-model substitute: records admission without executing publish tools. */
class ConsoleAdapter extends LlmAdapter {
  override async *stream(): AsyncIterable<StreamChunk> {
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

function batch(id: number) {
  return {
    id, name: `Batch ${String(id)}`, websiteId: id, websiteName: `Site ${String(id)}`,
    websiteHost: `${String(id)}.example`, plannedAt: '2026-09-05', executing: false,
    counts: { pending: 1, executed: 1, failed: 1, skipped: 1, total: 4 },
  }
}

describe('web: publish batch selection', () => {
  let server: Server
  let scratch: string
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let zeroCounts = false
  let largeList = false
  const requests: string[] = []
  const events: SessionEvent[] = []

  beforeAll(async () => {
    server = createServer((request, response) => {
      requests.push(`${request.method ?? ''} ${request.url ?? ''}`)
      response.setHeader('content-type', 'application/json')
      if (request.method === 'GET' && request.url === '/api/agent/batches') {
        const summaries = largeList ? Array.from({ length: 125 }, (_, id) => batch(1001 + id)) : [batch(99), batch(389), batch(100)]
        response.end(JSON.stringify({ batches: summaries.map(value => zeroCounts ? {
          ...value, executing: true, counts: { pending: 99, executed: 0, failed: 0, skipped: 0, total: 99 },
        } : value) }))
      } else if (request.method === 'GET' && request.url === '/api/agent/batches/389') {
        response.end(JSON.stringify({
          batch: batch(389), website: { id: 389, name: 'Site 389', siteUrl: 'https://389.example', siteHost: '389.example' },
          anchors: [], items: ['executed', 'failed', 'skipped'].map((status, id) => ({
            id, sourceId: id, sourceHost: `${status}.example`, status,
          })),
        }))
      } else {
        response.writeHead(405)
        response.end('{}')
      }
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('batch server did not bind TCP')
    scratch = await mkdtemp(join(tmpdir(), 'backlinks-console-test-'))
    const overlay = join(scratch, 'cordis.yml')
    await writeFile(overlay, `
- id: agent-default-model
  config:
    provider: console-test
    model: console-test
- insert:
    - id: backlinks
      name: '@deepseek-ai/dsh-backlinks'
    - id: backlinks-console
      name: '@deepseek-ai/dsh-backlinks-console'
    - id: browser
      name: '@deepseek-ai/dsh-browser'
      config:
        provider: playwright
    - id: browser-playwright
      name: '${new URL('../../../packages/browser/browser-playwright/lib/index.js', import.meta.url).href}'
      config:
        userDataDir: ${join(scratch, 'browser-default')}
        headless: true
    - id: backlinks-supermanager
      name: '${new URL('../../../packages/backlinks/backlinks-supermanager/lib/index.js', import.meta.url).href}'
      config:
        baseUrl: http://127.0.0.1:${String(address.port)}
        token: local-test-only
`)
    scaffold = await launchWebScaffold({ extraOverlayPath: overlay })
    scaffold.ctx.effect(() => scaffold.ctx.llm.registerAdapter(['console-test'], new ConsoleAdapter()), 'console test model')
    scaffold.ctx.on('session/event', (_session, event) => { events.push(event) })
    browser = await chromium.launch()
    page = await browser.newPage({ viewport: { width: 1100, height: 850 }, locale: ZH_BROWSER_LOCALE })
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await connectFreshWorkspaceZh(page, scaffold.workspaceCwd)
    await page.getByRole('tab', { name: '发布批次', exact: true }).click()
    await page.getByRole('button', { name: /#389 389.example/ }).waitFor()
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
    if (server !== undefined) {
      await new Promise<void>((resolve, reject) => server.close((error) => {
        if (error) reject(error)
        else resolve()
      }))
    }
    if (scratch !== undefined) await rm(scratch, { recursive: true, force: true })
  })

  it('renders success in green and submits checked batches in descending numeric order', async () => {
    onTestFailed(async () => {
      await mkdir(SHOTS, { recursive: true })
      await writeFile(join(SHOTS, 'failure.txt'), `${requests.join('\n')}\n${await page.locator('body').ariaSnapshot()}`)
      await page.screenshot({ path: join(SHOTS, 'failure.png') })
    })
    const panel = page.getByRole('region', { name: '外链发布控制台' })
    const concurrent = panel.getByRole('checkbox', { name: '并发', exact: true })
    expect(await concurrent.isChecked()).toBe(false)
    expect(await panel.getByRole('checkbox').count()).toBe(5)
    expect(await panel.getByRole('combobox', { name: /^本次浏览器/ }).count()).toBe(0)
    expect(await panel.getByRole('button', { name: '发布', exact: true }).count()).toBe(3)
    await compareOrRefreshGolden(join(SNAPSHOTS, 'compact.expected.md'),
      await captureStableAria(page, '[role="region"][aria-label="外链发布控制台"]', scaffold.workspaceCwd), webSnapshotMode())
    await mkdir(SHOTS, { recursive: true })
    await panel.screenshot({ path: join(SHOTS, '00-compact.png') })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: '打开侧边栏', exact: true }).click()
    await panel.screenshot({ path: join(SHOTS, '00-compact-narrow.png'), animations: 'disabled' })
    expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await page.setViewportSize({ width: 1100, height: 850 })
    await concurrent.check()
    expect(await page.locator('details[open]').count()).toBe(0)
    const rowLabels = await page.getByRole('checkbox', { name: /^选择批次/ }).evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')))
    expect(rowLabels).toEqual(['选择批次 #389 389.example', '选择批次 #100 100.example', '选择批次 #99 99.example'])
    await page.getByText('添加 / 绑定浏览器', { exact: true }).click()
    await page.getByLabel('浏览器名称', { exact: true }).fill('site-a')
    await page.getByLabel('独立登录目录', { exact: true }).fill(join(scratch, 'browser-a'))
    await page.getByRole('button', { name: '保存浏览器', exact: true }).click()
    await page.getByRole('combobox', { name: '本次浏览器 #389' }).selectOption('site-a')
    await page.getByRole('button', { name: '绑定网站', exact: true }).first().click()
    await page.getByRole('button', { name: '解除绑定', exact: true }).waitFor()
    await page.getByText('添加 / 绑定浏览器', { exact: true }).click()
    await page.getByRole('combobox', { name: '本次浏览器 #99' }).selectOption('playwright')
    expect(scaffold.ctx.backlinks.browserBindings()[389]).toBe('site-a')
    await page.getByRole('button', { name: /#389 389.example/ }).click()
    const executed = page.getByText('executed', { exact: true })
    await executed.waitFor({ timeout: 5000 })
    expect(await executed.evaluate(element => getComputedStyle(element).color)).toBe('rgb(5, 150, 105)')
    expect(await executed.evaluate(element => getComputedStyle(element).opacity)).toBe('1')
    expect(await page.getByText('failed', { exact: true }).evaluate(element => getComputedStyle(element).color)).toBe('rgb(220, 38, 38)')
    await mkdir(SHOTS, { recursive: true })
    await panel.screenshot({ path: join(SHOTS, '01-status.png') })
    await page.getByRole('checkbox', { name: '选择批次 #389 389.example' }).check()
    await page.getByRole('checkbox', { name: '选择批次 #99 99.example' }).check()
    await concurrent.uncheck()
    expect(await panel.getByRole('checkbox').count()).toBe(5)
    expect(await panel.getByRole('combobox', { name: /^本次浏览器/ }).count()).toBe(0)
    await concurrent.check()
    expect(await page.getByRole('checkbox', { name: '选择批次 #389 389.example' }).isChecked()).toBe(true)
    expect(await page.getByRole('combobox', { name: '本次浏览器 #389' }).inputValue()).toBe('site-a')
    await compareOrRefreshGolden(join(SNAPSHOTS, 'selected.expected.md'),
      await captureStableAria(page, '[role="region"][aria-label="外链发布控制台"]', scaffold.workspaceCwd), webSnapshotMode())
    await panel.screenshot({ path: join(SHOTS, '02-selected.png') })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: '打开侧边栏', exact: true }).click()
    expect(await concurrent.isChecked()).toBe(true)
    await panel.screenshot({ path: join(SHOTS, '03-narrow.png'), animations: 'disabled' })
    expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await page.setViewportSize({ width: 1100, height: 850 })
    await page.getByRole('button', { name: '批量发布 (2)', exact: true }).click()
    const submitted = () => events.flatMap(event => event.type === 'user/message' && event.data.source.kind === 'user'
      ? event.data.content.flatMap(block => block.type === 'text' ? [block.text] : []) : [])
    await expect.poll(submitted).toEqual(['/backlink-publish 389 99\n浏览器分配：[{"batchId":389,"browserId":"site-a"},{"batchId":99,"browserId":"playwright"}]。仅处理这些批次，保留指定的 browserId。使用 backlink_publish_many 并行发布；同一浏览器或网站的批次由运行时排队。'])
    await page.getByRole('button', { name: '批量发布 (0)', exact: true }).waitFor()
    expect(requests.every(request => request.startsWith('GET '))).toBe(true)
    await compareOrRefreshGolden(join(SNAPSHOTS, 'submitted.expected.md'), submitted().join('\n'), webSnapshotMode())
    await concurrent.uncheck()
    await panel.getByRole('button', { name: '发布', exact: true }).nth(1).click()
    await expect.poll(() => submitted().at(-1)).toBe('/backlink-publish 100')
    expect(submitted()).toHaveLength(2)
  })

  it('keeps zero success and failure visible during publication at desktop and narrow widths', async () => {
    zeroCounts = true
    const panel = page.getByRole('region', { name: '外链发布控制台' })
    await panel.getByRole('button', { name: '刷新', exact: true }).click()
    const row = panel.getByRole('button', { name: /#389 389.example/ })
    await expect.poll(() => row.textContent()).toContain('待 99成 0败 0')
    for (const width of [1100, 390]) {
      await page.setViewportSize({ width, height: 850 })
      if (width === 390) await page.getByRole('button', { name: '打开侧边栏', exact: true }).click()
      for (const text of ['待 99', '成 0', '败 0']) {
        expect(await row.getByText(text, { exact: true }).isVisible()).toBe(true)
      }
      expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
      await panel.screenshot({ path: join(SHOTS, `zero-counts-${String(width)}.png`), animations: 'disabled' })
    }
  })

  it('pages 50 batches at a time and reopens fresh results without fetching again', async () => {
    largeList = true
    await page.setViewportSize({ width: 1100, height: 850 })
    const panel = page.getByRole('region', { name: '外链发布控制台' })
    const rows = panel.getByRole('checkbox', { name: /^选择批次/ })
    const more = panel.getByRole('button', { name: '加载更多（50 批）', exact: true })
    await panel.getByRole('button', { name: '刷新', exact: true }).click()
    await rows.first().filter({ visible: true }).waitFor()
    await expect.poll(() => rows.count()).toBe(50)
    expect(await rows.first().getAttribute('aria-label')).toBe('选择批次 #1125 1125.example')
    expect(await rows.last().getAttribute('aria-label')).toBe('选择批次 #1076 1076.example')
    await more.scrollIntoViewIfNeeded()
    await panel.screenshot({ path: join(SHOTS, 'pagination-50-desktop.png') })
    await compareOrRefreshGolden(join(SNAPSHOTS, 'pagination.expected.md'),
      await captureStableAria(page, '[role="region"][aria-label="外链发布控制台"]', scaffold.workspaceCwd), webSnapshotMode())
    const readCount = requests.filter(request => request === 'GET /api/agent/batches').length
    await more.click()
    expect(await rows.count()).toBe(100)
    await more.click()
    expect(await rows.count()).toBe(125)
    expect(await more.count()).toBe(0)
    const search = panel.getByPlaceholder('搜索批次号或网站域名')
    await search.fill('1001')
    expect(await rows.count()).toBe(1)
    expect(await rows.first().getAttribute('aria-label')).toBe('选择批次 #1001 1001.example')
    await search.fill('')
    expect(await rows.count()).toBe(50)
    await page.getByRole('tab', { name: '会话', exact: true }).click()
    await page.getByRole('tab', { name: '发布批次', exact: true }).click()
    await rows.first().waitFor()
    expect(await rows.count()).toBe(50)
    expect(requests.filter(request => request === 'GET /api/agent/batches')).toHaveLength(readCount)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: '打开侧边栏', exact: true }).click()
    await more.scrollIntoViewIfNeeded()
    await panel.screenshot({ path: join(SHOTS, 'pagination-50-narrow.png'), animations: 'disabled' })
    expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await more.click()
    expect(await rows.count()).toBe(100)
    expect(requests.filter(request => request === 'GET /api/agent/batches')).toHaveLength(readCount)
  })
})
