/** One logged tool call starts three real children without a parent polling step. */
import { readFile, readdir } from 'node:fs/promises'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'
import { expect, it } from 'vitest'

const fixtures = fileURLToPath(new URL('./parallel-snapshots/', import.meta.url))

it('starts three native foreground children in one call and logs their ordered outcomes', async () => {
  const configPath = fileURLToPath(new URL('../parallel.cordis.snapshot.yml', import.meta.url))
  const binScript = fileURLToPath(new URL('../../headless-agent/tests/fixtures/headless-driver.ts', import.meta.url))
  const result = await runLoaderSmoke({
    label: 'parallel backlink children', tempDirPrefix: 'dsh-backlinks-parallel-',
    binScript, libBinScript: binScript, configPath,
    binArgs: [configPath, 'Inspect the three independent items together.'],
    tsconfigPath: fileURLToPath(new URL('../../../tsconfig.json', import.meta.url)),
    env: {
      DSH_SNAPSHOT_FILE: join(fixtures, 'parent.override.json'),
      DSH_SNAPSHOT_OVERRIDE: join(fixtures, 'parent.override.json'),
      DSH_SNAPSHOT_CHILD_FILES: Array.from({ length: 3 }, () => join(fixtures, 'child.replay.jsonl')).join(delimiter),
    },
    inspect: async (cwd) => {
      const root = join(cwd, '.sessions')
      const files = (await readdir(root, { recursive: true })).filter(file => file.endsWith('.jsonl'))
      const logs = await Promise.all(files.map(async (file) => {
        const [header, ...events] = (await readFile(join(root, file), 'utf8')).trim().split('\n').map(line => JSON.parse(line) as unknown)
        return { header: header as SessionHeader, events: events as SessionEvent[] }
      }))
      const parent = logs.find(log => log.header.parentSession === undefined)!
      const children = logs.filter(log => log.header.parentSession !== undefined)
      const calls = parent.events.filter(event => event.type === 'tool/call')
      const outcomes = parent.events.filter(event => event.type === 'tool/result')
      expect(calls).toHaveLength(1)
      expect(outcomes).toHaveLength(1)
      const rendered = outcomes[0]!.data.message.content
        .filter(block => block.type === 'tool-result')
        .flatMap(block => block.content)
        .filter(block => block.type === 'text').map(block => block.text).join('')
      expect(rendered.startsWith('Batch results in prompt order:\n')).toBe(true)
      const ordered = JSON.parse(rendered.split('\n')[1]!) as { kind: string; runId: string; output: unknown[] }[]
      expect(children).toHaveLength(3)
      expect(new Set(ordered.map(outcome => outcome.runId)).size).toBe(3)
      expect(ordered.map((outcome) => {
        const child = children.find(log => log.header.id === outcome.runId)!
        expect(child.events.some(event => event.type === 'turn/end')).toBe(true)
        return {
          kind: outcome.kind,
          prompt: child.events.find(event => event.type === 'user/message')?.data.content,
          output: outcome.output,
        }
      })).toMatchInlineSnapshot(`
        [
          {
            "kind": "foreground",
            "output": [
              {
                "text": "Item inspected; no publication attempted.",
                "type": "text",
              },
            ],
            "prompt": [
              {
                "text": "Inspect item A only.",
                "type": "text",
              },
            ],
          },
          {
            "kind": "foreground",
            "output": [
              {
                "text": "Item inspected; no publication attempted.",
                "type": "text",
              },
            ],
            "prompt": [
              {
                "text": "Inspect item B only.",
                "type": "text",
              },
            ],
          },
          {
            "kind": "foreground",
            "output": [
              {
                "text": "Item inspected; no publication attempted.",
                "type": "text",
              },
            ],
            "prompt": [
              {
                "text": "Inspect item C only.",
                "type": "text",
              },
            ],
          },
        ]
      `)
    },
  })
  expect(result.stderr).toBe('')
  expect(result.stdout).toContain('All three items returned.')
}, LOADER_SMOKE_TEST_TIMEOUT_MS)
