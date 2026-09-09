/** Headed macOS Chrome verifies background page creation without controlling desktop input. */

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import { chromium } from 'playwright-core'
import type { Context } from '@deepseek-ai/cordis'
import { boot } from '@deepseek-ai/dsh-app-boot'
import type { BrowserResult } from '@deepseek-ai/dsh-browser'

const configPath = process.argv[2]
if (configPath === undefined) throw new Error('browser-background: config path required')
const directory = resolve('.background-browser')
await mkdir(directory)
await promisify(execFile)('open', ['-g', '-n', '-a', 'Google Chrome', '--args',
  `--user-data-dir=${directory}`, '--remote-debugging-port=0', '--no-startup-window', '--no-first-run', '--no-default-browser-check',
])
let port: string | undefined
for (let attempt = 0; attempt < 100; attempt++) {
  try {
    port = (await readFile(resolve(directory, 'DevToolsActivePort'), 'utf8')).split('\n')[0]
    break
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  await delay(100)
}
if (port === undefined) throw new Error('browser-background: Chrome did not publish its debugging port')
process.env.DSH_CDP_ENDPOINT = `http://127.0.0.1:${port}`
process.env.DSH_CAPACITY_LIMIT = '0'
const external = await chromium.connectOverCDP(process.env.DSH_CDP_ENDPOINT)
const client = await external.newBrowserCDPSession()
let ctx: Context | undefined
try {
  const { targetId } = await client.send('Target.createTarget', {
    url: 'about:blank', newWindow: true, background: true, windowState: 'minimized',
  })
  const initial = await client.send('Browser.getWindowForTarget', { targetId })
  assert.equal(initial.bounds.windowState, 'minimized')
  ctx = await boot('browser-background', configPath)
  await Promise.all(Array.from({ length: 3 }, (_, index) => ctx!.browser.act({
    kind: 'newPage', page: `background-${index}`,
  }, undefined, 'attached')))
  for (let index = 0; index < 3; index++) {
    const page = `background-${index}`
    const html = '<input id="value"><button onclick="document.querySelector(\'p\').textContent=document.querySelector(\'input\').value">Save</button><p></p>'
    await ctx.browser.act({ kind: 'navigate', page, url: `data:text/html,${encodeURIComponent(html)}` }, undefined, 'attached')
    await ctx.browser.act({ kind: 'fill', page, selector: '#value', value: `saved-${index}` }, undefined, 'attached')
    await ctx.browser.act({ kind: 'click', page, selector: 'button' }, undefined, 'attached')
    await ctx.browser.act({ kind: 'screenshot', page }, undefined, 'attached')
    const snapshot: BrowserResult = await ctx.browser.act({ kind: 'snapshot', page, selector: 'p' }, undefined, 'attached')
    assert.equal(snapshot.kind === 'page' && snapshot.text, `saved-${index}`)
  }
  const { targetInfos } = await client.send('Target.getTargets')
  const pages = targetInfos.filter(target => target.type === 'page')
  assert.equal(pages.length, 4)
  for (const target of pages) {
    const window = await client.send('Browser.getWindowForTarget', { targetId: target.targetId })
    assert.equal(window.windowId, initial.windowId)
    assert.equal(window.bounds.windowState, 'minimized')
  }
  process.stdout.write(JSON.stringify({ backgroundPages: 3, sameWindow: true, minimizedAfterInput: true }) + '\n')
} finally {
  try {
    await ctx?.fiber.dispose()
  } finally {
    try {
      await client.send('Browser.close')
    } catch {}
    await external.close()
    for (let attempt = 0; attempt < 50; attempt++) {
      await delay(100)
      try {
        const testConn = await chromium.connectOverCDP(process.env.DSH_CDP_ENDPOINT, { timeout: 150 })
        await testConn.close()
      } catch {
        break
      }
    }
    await delay(200)
  }
}
