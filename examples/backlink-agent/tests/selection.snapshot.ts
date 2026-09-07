/** The assembled console and tools preserve ordering and the selected pending scope. */

import { fileURLToPath } from 'node:url'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'
import { expect, it } from 'vitest'

it('shows new batches first and exhausts pending pages without claiming retryable failures', async () => {
  const configPath = fileURLToPath(new URL('../selection.cordis.snapshot.yml', import.meta.url))
  const driver = fileURLToPath(new URL('./fixtures/selection-driver.ts', import.meta.url))
  const result = await runLoaderSmoke({
    label: 'backlinks selection snapshot', tempDirPrefix: 'dsh-backlinks-selection-',
    binScript: driver, libBinScript: driver, configPath, binArgs: [configPath],
    tsconfigPath: fileURLToPath(new URL('../../../tsconfig.json', import.meta.url)),
  })
  expect(result.stderr).toBe('')
  expect(JSON.parse(result.stdout.trim())).toMatchInlineSnapshot(`
    {
      "claimed": [
        2,
        3,
        4,
      ],
      "counts": [
        3,
        2,
        1,
        0,
      ],
      "order": [
        400,
        395,
        176,
      ],
      "retries": {
        "batch": {
          "counts": {
            "executed": 0,
            "failed": 4,
            "pending": 0,
            "skipped": 0,
            "total": 4,
          },
          "executing": false,
          "id": 176,
          "name": "Budget batch",
          "plannedAt": "2026-09-05",
          "websiteHost": "site.test",
          "websiteId": 82,
          "websiteName": "site",
        },
        "eligibleCount": 1,
        "nextItemIds": [
          1,
        ],
        "scope": "retryable",
      },
    }
  `)
}, LOADER_SMOKE_TEST_TIMEOUT_MS)
