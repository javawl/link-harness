/** A real Loader and Chrome enforce page capacity without discarding existing work. */

import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'
import { expect, it } from 'vitest'

const chromeInstalled = existsSync(process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : '/opt/google/chrome/chrome')

it.skipIf(!chromeInstalled)('bounds real browser pages, snapshot waits and stuck input without retrying an uncertain page', async () => {
  const configPath = fileURLToPath(new URL('../browser-capacity.cordis.snapshot.yml', import.meta.url))
  const driver = fileURLToPath(new URL('./fixtures/browser-capacity-driver.ts', import.meta.url))
  const result = await runLoaderSmoke({
    label: 'browser capacity snapshot', tempDirPrefix: 'dsh-browser-capacity-',
    binScript: driver, libBinScript: driver, configPath, binArgs: [configPath],
    tsconfigPath: fileURLToPath(new URL('../../../tsconfig.json', import.meta.url)),
  })
  expect(result.stderr).toBe('')
  expect(JSON.parse(result.stdout.trim())).toMatchInlineSnapshot(`
    {
      "configuredSnapshotTimeout": true,
      "first": "page",
      "interruptedInput": "BROWSER_ACTION_UNCERTAIN",
      "limit": "BROWSER_PAGE_LIMIT",
      "otherPage": "page",
      "preserved": "page",
      "repeatedInput": "BROWSER_ACTION_UNCERTAIN",
      "replacement": "page",
      "retained": "page",
      "unlimitedPages": 7,
    }
  `)
}, LOADER_SMOKE_TEST_TIMEOUT_MS)
