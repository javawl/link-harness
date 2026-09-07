/** Small batch views and a budget-stopped foreground child in the assembled headless app. */

import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeSessionSnapshot } from '@deepseek-ai/dsh-acp-snapshot'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'
import { expect, it } from 'vitest'

const fixtures = fileURLToPath(new URL('./budget-snapshots/', import.meta.url))
const configPath = fileURLToPath(new URL('../budget.cordis.snapshot.yml', import.meta.url))
const binScript = fileURLToPath(new URL('../../headless-agent/tests/fixtures/headless-driver.ts', import.meta.url))

it('bounds backlink batch context and stops a foreground child without parent polling', async () => {
  const result = await runLoaderSmoke({
    label: 'backlinks budget headless snapshot', tempDirPrefix: 'dsh-backlinks-budget-',
    binScript, libBinScript: binScript, configPath,
    binArgs: [configPath, 'Process one item from batch 176 with a bounded child.'],
    tsconfigPath: fileURLToPath(new URL('../../../tsconfig.json', import.meta.url)),
    env: {
      DSH_SNAPSHOT_FILE: join(fixtures, 'parent.override.json'),
      DSH_SNAPSHOT_OVERRIDE: join(fixtures, 'parent.override.json'),
      DSH_SNAPSHOT_CHILD_FILES: join(fixtures, 'child.replay.jsonl'),
    },
    inspect: async (cwd) => {
      const root = join(cwd, '.sessions')
      const files = (await readdir(root, { recursive: true })).filter(file => file.endsWith('.jsonl'))
      const logs = await Promise.all(files.map(async file => readFile(join(root, file), 'utf8')))
      const entries = logs.map(log => ({ log, header: JSON.parse(log.split('\n')[0]!) as { id: string; parentSession?: string } }))
      const parent = entries.find(entry => entry.header.parentSession === undefined)!
      const child = entries.find(entry => entry.header.parentSession !== undefined)!
      expect(entries).toHaveLength(2)
      expect(parent.log).toContain('Work budget exhausted: reported tokens 70 >= 50')
      expect(parent.log).toContain('manual_required')
      expect(child.log).toContain('Subagent work budget exhausted')
      const context = { sessionIds: [parent.header.id, child.header.id], cwd }
      for (const [name, entry] of [['parent', parent], ['child', child]] as const) {
        const normalized = normalizeSessionSnapshot(entry.log, context)
        const expected = join(fixtures, `${name}.expected.jsonl`)
        if (process.env.DSH_SNAPSHOT === 'refresh') await writeFile(expected, normalized)
        expect(normalized).toBe(await readFile(expected, 'utf8'))
      }
    },
  })
  expect(result.stderr).toBe('')
  expect(result.stdout).toContain('724 items remain pending')
}, LOADER_SMOKE_TEST_TIMEOUT_MS)
