/** Real Loader, native children, Chrome, nested forms, and durable model-visible results. */

import { existsSync } from 'node:fs'
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session'
import { assertObjectJsonSchema } from '@deepseek-ai/dsh-tools'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'
import { expect, it } from 'vitest'

const chromeInstalled = existsSync(process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/opt/google/chrome/chrome')

it.skipIf(!chromeInstalled).each(['success', 'quota', 'unresolved', 'anchors', 'invalid-profile', 'budget', 'multi-browser', 'guarded-tools', 'manual-required'])('publishes with the selected model and preserves results after %s', async (scenario) => {
  const configPath = fileURLToPath(new URL('../publisher.cordis.snapshot.yml', import.meta.url))
  const driver = fileURLToPath(new URL('../../headless-agent/tests/fixtures/headless-driver.ts', import.meta.url))
  const result = await runLoaderSmoke({
    label: 'publisher Chrome snapshot', tempDirPrefix: 'dsh-publisher-snapshot-',
    binScript: driver, libBinScript: driver, configPath, binArgs: [configPath, 'Publish fixture batch 176.'],
    tsconfigPath: fileURLToPath(new URL('../../../tsconfig.json', import.meta.url)),
    env: { DSH_PUBLISHER_SCENARIO: scenario },
    inspect: async (cwd) => {
      const files = (await readdir(join(cwd, '.sessions'), { recursive: true })).filter(file => file.endsWith('.jsonl'))
      const logs = await Promise.all(files.map(async (file) => {
        const [header, ...events] = (await readFile(join(cwd, '.sessions', file), 'utf8')).trim().split('\n').map(line => JSON.parse(line) as unknown)
        return { header: header as SessionHeader, events: events as SessionEvent[] }
      }))
      const parent = logs.find(log => log.header.parentSession === undefined)!
      const children = logs.filter(log => log.header.parentSession !== undefined)
      const evidence = process.env.DSH_PUBLISHER_EVIDENCE
      if (evidence !== undefined) {
        await mkdir(evidence, { recursive: true, mode: 0o700 })
        await writeFile(join(evidence, `${scenario}-sessions.json`), JSON.stringify(logs), { mode: 0o600 })
      }
      const errors = logs.flatMap(log => log.events.filter(event => event.type === 'tool/result')
        .flatMap(event => event.data.message.content.filter(block => block.isError)
          .flatMap(block => block.content.filter(block => block.type === 'text').map(block => block.text))))
      expect(children, errors.join('\n')).toHaveLength(scenario === 'invalid-profile' ? 0 : scenario === 'quota' ? 1 : 2)
      expect(parent.events.filter(event => event.type === 'backlinks/attempt').flatMap(event => event.data.itemIds).sort((a, b) => a - b))
        .toEqual(scenario === 'invalid-profile' ? [] : scenario === 'quota' ? [1] : scenario === 'unresolved' ? [1, 2, 3] : [1, 2])
      expect(parent.events.filter(event => event.type === 'request/header').map(event => event.data.header.config.model)).toEqual(['mock', 'selected-model'])
      expect(children.flatMap(child => child.events.filter(event => event.type === 'request/header').map(event => event.data.header.config.model)))
        .toEqual(children.map(() => 'selected-model'))
      for (const child of children) {
        for (const event of child.events.filter(event => event.type === 'request/header')) {
          const tools = event.data.header.tools!
          expect(tools.map(tool => tool.name).sort()).toEqual(['backlinks', 'browser'])
          for (const tool of tools) assertObjectJsonSchema(tool.parameters)
          expect(tools.find(tool => tool.name === 'browser')?.parameters).toHaveProperty('properties.submission.type', 'boolean')
          expect(tools.find(tool => tool.name === 'backlinks')?.parameters).toMatchObject({ properties: {
            receipt: { type: 'string' }, verificationSelector: { type: 'string' },
          } })
        }
      }
      if (scenario === 'guarded-tools') {
        expect(errors).toMatchInlineSnapshot(`
          [
            "Error: unknown tool "bash"",
            "Error: Publication cannot activate browser windows. Report manual_required and let the operator open the retained page.",
          ]
        `)
      }
      const resultText = (events: SessionEvent[]) => events.filter(event => event.type === 'tool/result')
        .flatMap(event => event.data.message.content.flatMap(block => block.content))
        .filter(block => block.type === 'text').map(block => block.text).join('\n')
      const parentText = resultText(parent.events)
      expect(parentText.split('FIXTURE_PUBLICATION_INSTRUCTIONS')).toHaveLength(2)
      expect(parentText).toContain('already loaded in the current context')
      if (scenario === 'invalid-profile') {
        const publication = parent.events.find(event => event.type === 'tool/result' && event.data.message.source.callId === 'publish')!
        expect(resultText([publication])).toMatchInlineSnapshot('"{"attempted":0,"remaining":2,"counts":{},"stoppedReason":"Website 82 needs a name and an absolute http(s) website URL, or a configured publication anchor. Update its website details before continuing; no items were claimed."}"')
        expect(parentText).toContain('"pending":2')
        return
      }
      if (scenario === 'unresolved') {
        const publication = parent.events.find(event => event.type === 'tool/result' && event.data.message.source.callId === 'publish')!
        expect(resultText([publication])).toMatchInlineSnapshot('"{"attempted":2,"remaining":0,"counts":{"live":2},"stoppedReason":null,"unresolvedItemIds":[1]}"')
        expect(parentText).toContain('"pending":1')
        expect(children.map(child => child.events.filter(event => event.type === 'user/message')
          .flatMap(event => event.data.content).find(block => block.type === 'text' && block.text.startsWith('{"item":')))
          .map(block => block?.type === 'text' ? (JSON.parse(block.text) as { item: { id: number } }).item.id : undefined).sort())
          .toEqual([2, 3])
      }
      if (scenario === 'quota') {
        const publication = parent.events.find(event => event.type === 'tool/result' && event.data.message.source.callId === 'publish')!
        expect(resultText([publication])).toMatchInlineSnapshot('"{"attempted":1,"remaining":2,"counts":{"failed":1},"stoppedReason":"Item 1 stopped: Child turn failed (QUOTA). Inspect the child session log for details."}"')
        expect(parentText).toContain('"pending":2')
        expect(children[0]!.events.some(event => event.type === 'tool/call')).toBe(false)
        expect(parentText).not.toContain('private provider payload')
        return
      }
      if (scenario === 'budget') {
        const publication = parent.events.find(event => event.type === 'tool/result' && event.data.message.source.callId === 'publish')!
        expect(resultText([publication])).toMatchInlineSnapshot('"{"attempted":2,"remaining":0,"counts":{"failed":2},"stoppedReason":null}"')
        return
      }
      if (scenario === 'manual-required') {
        const publication = parent.events.find(event => event.type === 'tool/result' && event.data.message.source.callId === 'publish')!
        const output = JSON.parse(resultText([publication])) as { manualRequired: { page: string }[] }
        expect(output).toMatchObject({ attempted: 2, remaining: 0, counts: { failed: 1, live: 1 }, stoppedReason: null,
          manualRequired: [{ itemId: 1, browserId: 'playwright', reason: 'Complete login manually.' }] })
        expect(output.manualRequired[0]!.page).toMatch(/^publish-.*-1$/)
        expect({ ...output, manualRequired: output.manualRequired.map(item => ({ ...item, page: '<page>' })) }).toMatchInlineSnapshot(`
          {
            "attempted": 2,
            "counts": {
              "failed": 1,
              "live": 1,
            },
            "manualRequired": [
              {
                "browserId": "playwright",
                "itemId": 1,
                "page": "<page>",
                "reason": "Complete login manually.",
              },
            ],
            "remaining": 0,
            "stoppedReason": null,
          }
        `)
        const retained = parent.events.find(event => event.type === 'tool/result' && event.data.message.source.callId === 'retained-page')!
        expect(resultText([retained])).toContain('Complete login manually.')
        expect(errors).toEqual([])
        return
      }
      if (scenario === 'anchors') {
        for (const child of children) {
          const task = child.events.filter(event => event.type === 'user/message')
            .flatMap(event => event.data.content).find(block => block.type === 'text' && block.text.startsWith('{"item":'))
          const input = task?.type === 'text' ? JSON.parse(task.text) as { anchors: unknown } : undefined
          expect(input?.anchors).toEqual([{ anchorText: 'Site', targetUrl: 'https://site.test/' }])
        }
      }
      expect(parentText).toContain(scenario === 'multi-browser' ? '"counts":{"live":1}' : '"counts":{"live":2}')
      if (scenario === 'multi-browser') {
        const assignments = children.flatMap(child => child.events.filter(event => event.type === 'user/message')
          .flatMap(event => event.data.content).filter(block => block.type === 'text' && block.text.startsWith('{"item":'))
          .map(block => JSON.parse(block.type === 'text' ? block.text : '{}') as { browserId: string; website: { siteUrl: string } }))
        expect(assignments.map(assignment => assignment.browserId).sort()).toEqual(['isolated', 'playwright'])
        expect(assignments.map(assignment => assignment.website.siteUrl).sort()).toEqual(['https://second.test/', 'https://site.test/'])
        expect(parentText).toContain('"pendingBatchIds":[]')
      }
      const outcomes = children.map((child) => {
        const text = resultText(child.events)
        const formCalls = new Set(child.events.flatMap(event => event.type === 'tool/call'
          && (JSON.parse(event.data.arguments) as { format?: string }).format === 'form' ? [event.data.callId] : []))
        const formText = resultText(child.events.filter(event => event.type === 'tool/result'
          && formCalls.has(event.data.message.source.callId)))
        expect(formText).not.toContain('fixture-secret')
        expect(text).not.toContain('fixture-hidden')
        expect(text).not.toContain('https://hidden.test/')
        expect(text).toContain('"value":" Example "')
        expect(text).toContain('"value":null')
        expect(text).toContain('"href":"https://wrong.test/"')
        expect(text).toContain('item executed')
        return { finished: child.events.some(event => event.type === 'turn/end'),
          fills: child.events.filter(event => event.type === 'tool/call' && event.data.name === 'browser'
            && (JSON.parse(event.data.arguments) as { action: string }).action === 'fill').length }
      })
      expect(outcomes).toMatchInlineSnapshot(`
        [
          {
            "fills": 1,
            "finished": true,
          },
          {
            "fills": 1,
            "finished": true,
          },
        ]
      `)
    },
  })
  expect(result.stderr).toBe('')
  expect(result.stdout).toContain(scenario === 'manual-required' ? 'Item 1 needs manual login in its retained page; item 2 is published.' : scenario === 'budget' ? 'Both item budgets reached; both outcomes saved.' : scenario === 'invalid-profile' ? 'Complete the website name and URL; two items remain untouched.' : scenario === 'unresolved'
    ? 'Item 1 skipped for manual review; two other listings verified.'
    : scenario === 'quota' ? 'Publication paused after QUOTA; two items remain pending.' : 'Two public fixture listings verified.')
}, LOADER_SMOKE_TEST_TIMEOUT_MS)
