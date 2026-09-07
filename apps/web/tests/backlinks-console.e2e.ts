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
  const requests: string[] = []
  const events: SessionEvent[] = []

  beforeAll(async () => {
    server = createServer((request, response) => {
      requests.push(`${request.method ?? ''} ${request.url ?? ''}`)
      response.setHeader('content-type', 'application/json')
      if (request.method === 'GET' && request.url === '/api/agent/batches') {
        response.end(JSON.stringify({ batches: [batch(99), batch(389), batch(100)] }))
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
    await page.getByRole('checkbox', { name: '选择批次 #389 389.example' }).waitFor()
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
    const rowLabels = await page.getByRole('checkbox', { name: /^选择批次/ }).evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')))
    expect(rowLabels).toEqual(['选择批次 #389 389.example', '选择批次 #100 100.example', '选择批次 #99 99.example'])
    await page.getByRole('button', { name: /#389 389.example/ }).click()
    const executed = page.getByText('executed', { exact: true })
    await executed.waitFor({ timeout: 5000 })
    expect(await executed.evaluate(element => getComputedStyle(element).color)).toBe('rgb(5, 150, 105)')
    expect(await executed.evaluate(element => getComputedStyle(element).opacity)).toBe('1')
    expect(await page.getByText('failed', { exact: true }).evaluate(element => getComputedStyle(element).color)).toBe('rgb(220, 38, 38)')
    const panel = page.getByRole('region', { name: '外链发布控制台' })
    await mkdir(SHOTS, { recursive: true })
    await panel.screenshot({ path: join(SHOTS, '01-status.png') })
    await page.getByRole('checkbox', { name: '选择批次 #389 389.example' }).check()
    await page.getByRole('checkbox', { name: '选择批次 #99 99.example' }).check()
    await compareOrRefreshGolden(join(SNAPSHOTS, 'selected.expected.md'),
      await captureStableAria(page, '[role="region"][aria-label="外链发布控制台"]', scaffold.workspaceCwd), webSnapshotMode())
    await panel.screenshot({ path: join(SHOTS, '02-selected.png') })
    await page.getByRole('button', { name: '批量发布 (2)', exact: true }).click()
    const submitted = () => events.flatMap(event => event.type === 'user/message' && event.data.source.kind === 'user'
      ? event.data.content.flatMap(block => block.type === 'text' ? [block.text] : []) : [])
    await expect.poll(submitted).toEqual(['/backlink-publish 389 99\n请按以上批次号顺序依次发布，仅处理这些批次。'])
    await page.getByRole('button', { name: '批量发布 (0)', exact: true }).waitFor()
    expect(requests.every(request => request.startsWith('GET '))).toBe(true)
    await compareOrRefreshGolden(join(SNAPSHOTS, 'submitted.expected.md'), submitted().join('\n'), webSnapshotMode())
  })
})
