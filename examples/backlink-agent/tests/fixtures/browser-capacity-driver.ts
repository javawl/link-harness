/** Keyless real-Chrome probe of page capacity, navigation readiness and locator deadlines. */

import { createServer } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { boot } from '@deepseek-ai/dsh-app-boot'
import { BrowserError } from '@deepseek-ai/dsh-browser'

const configPath = process.argv[2]
if (configPath === undefined) throw new Error('browser-capacity: config path required')
const server = createServer((request, response) => {
  if (request.url === '/slow-image') return
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  if (request.url === '/stuck-input') {
    response.end('<title>Input fixture</title><button id="submit" onkeydown="while(true){}">Submit</button>')
    return
  }
  response.end('<title>Capacity fixture</title><p>Ready</p><img src="/slow-image">')
})
await new Promise<void>((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', resolve)
})
let ctx: Context | undefined
try {
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('missing HTTP listener')
  const url = `http://127.0.0.1:${address.port}/`
  ctx = await boot('browser-capacity', configPath)
  const first = await ctx.browser.act({ kind: 'navigate', page: 'work', url })
  let limit: string | undefined
  try {
    await ctx.browser.act({ kind: 'navigate', page: 'overflow', url })
  } catch (error) {
    if (!(error instanceof BrowserError)) throw error
    limit = error.code
  }
  const preserved = await ctx.browser.act({ kind: 'snapshot', page: 'work' })
  let configuredSnapshotTimeout = false
  try {
    await ctx.browser.act({ kind: 'snapshot', page: 'work', selector: '#absent', format: 'aria' })
  } catch (error) {
    if (!(error instanceof BrowserError)) throw error
    configuredSnapshotTimeout = error.message.includes('Timeout 5000ms exceeded')
  }
  await ctx.browser.act({ kind: 'closePage', page: 'work' })
  const replacement = await ctx.browser.act({ kind: 'navigate', page: 'replacement', url })
  await ctx.browser.act({ kind: 'closePage', page: 'replacement' })
  await ctx.browser.act({ kind: 'closePage' })
  await ctx.browser.act({ kind: 'navigate', page: 'stuck', url: `${url}stuck-input` })
  await ctx.browser.act({ kind: 'click', page: 'stuck', selector: '#submit' })
  let interruptedInput: string | undefined
  try {
    await ctx.browser.act({ kind: 'press', page: 'stuck', key: 'End' })
  } catch (error) {
    if (!(error instanceof BrowserError)) throw error
    interruptedInput = error.code
  }
  let repeatedInput: string | undefined
  try {
    await ctx.browser.act({ kind: 'press', page: 'stuck', key: 'Enter' })
  } catch (error) {
    if (!(error instanceof BrowserError)) throw error
    repeatedInput = error.code
  }
  // A different site gets a separate renderer from the fixture's busy page.
  const otherPage = await ctx.browser.act({ kind: 'navigate', page: 'other', url: url.replace('127.0.0.1', 'localhost') })
  await ctx.browser.act({ kind: 'closePage', page: 'stuck' })
  await ctx.browser.act({ kind: 'closePage', page: 'other' })
  await ctx.fiber.dispose()
  process.env.DSH_CAPACITY_LIMIT = '0'
  ctx = await boot('browser-unlimited', configPath)
  const pages = await Promise.all(Array.from({ length: 7 }, (_, index) => ctx!.browser.act({
    kind: 'newPage', page: `retained-${index}`,
  })))
  const retained = await ctx.browser.act({ kind: 'snapshot', page: 'retained-0' })
  process.stdout.write(JSON.stringify({
    first: first.kind, limit, preserved: preserved.kind,
    configuredSnapshotTimeout, replacement: replacement.kind,
    interruptedInput, repeatedInput, otherPage: otherPage.kind,
    unlimitedPages: pages.length, retained: retained.kind,
  }) + '\n')
} finally {
  try {
    await ctx?.fiber.dispose()
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
  }
}
