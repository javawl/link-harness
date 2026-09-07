/** Both SDKs retain publisher checkpoints from a real Loader, backend parser and browser flow. */

import { execFile, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client'
import { resolveExampleLaunch } from '@deepseek-ai/dsh-loader-smoke'
import { expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const chrome = existsSync(process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/opt/google/chrome/chrome')
const python = spawnSync('uv', ['--version'], { stdio: 'ignore' }).status === 0

for (const client of ['typescript', 'python'] as const) {
  it.skipIf(!chrome || (client === 'python' && !python))(`projects durable publication attempts through the ${client} SDK`, async () => {
    const cwd = await mkdtemp(join(tmpdir(), `backlinks-${client}-sdk-`))
    const base = resolveExampleLaunch({
      srcBin: join(root, 'packages/examples/jsonrpc-demo/src/bin.ts'),
      tsconfigPath: join(root, 'tsconfig.json'),
    })
    const overrides = {
      ...base.env,
      DSH_CORDIS_CONFIG: join(root, 'examples/backlink-agent/sdk.cordis.snapshot.yml'),
      DSH_PUBLISHER_SCENARIO: 'anchors',
      DSH_CWD: cwd,
      DSH_SESSION_ROOT: join(cwd, '.sessions'),
    }
    const launch = { command: base.command, args: base.args, cwd, env: {
      ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
      ...overrides,
    } }
    try {
      let value: unknown
      if (client === 'typescript') {
        const harness = new DeepSeekHarness({ launch: { ...launch, requestTimeoutMs: 60_000 }, cwd, provider: 'mock', model: 'mock' })
        try {
          const result = await harness.run('Publish fixture batch 176.', { sessionId: 'backlinks-sdk' })
          value = { finalResponse: result.finalResponse,
            attempts: result.events.filter(event => event.type === 'backlinks/attempt').map(event => event.data) }
        } finally {
          await harness.close()
        }
      } else {
        const result = await promisify(execFile)('uv', ['run', '--project', join(root, 'python/sdk'), 'python',
          join(root, 'examples/backlink-agent/tests/fixtures/python-sdk.py'), JSON.stringify({ ...launch, env: overrides })],
        { timeout: 90_000, maxBuffer: 1_000_000 })
        value = JSON.parse(result.stdout)
      }
      const expected = join(root, client === 'typescript'
        ? 'examples/jsonrpc-agent/tests/snapshots/backlink-publication/result.expected.json'
        : 'scripts/snapshots/python-sdk-single-exe/backlink-publication/result.json')
      const actual = `${JSON.stringify(value, null, 2)}\n`
      if (process.env.DSH_SNAPSHOT === 'refresh') await writeFile(expected, actual)
      expect(actual).toBe(await readFile(expected, 'utf8'))
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  }, 120_000)
}
