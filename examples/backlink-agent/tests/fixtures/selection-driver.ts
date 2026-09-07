/** Loader probe of console ordering and bounded pending-only completion. */

import { boot } from '@deepseek-ai/dsh-app-boot'
import { CallId } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-backlinks-console'
import type {} from '@deepseek-ai/dsh-tools'

const configPath = process.argv[2]
if (configPath === undefined) throw new Error('selection: config path required')
const ctx = await boot('backlinks-selection', configPath)
let sequence = 0
try {
  const call = async (arguments_: object): Promise<{ data: unknown }> => {
    const result = await ctx.tools.execute({
      name: 'backlinks', arguments: arguments_, callId: CallId(`selection-${++sequence}`),
      signal: new AbortController().signal,
    })
    if (result.isError) throw new Error(JSON.stringify(result))
    return result.value as { data: unknown }
  }
  await ctx.backlinks.reportItemResult(1, { status: 'failed', failureMode: 'retryable', failureReason: 'Existing retryable failure' })
  const order = (await ctx.backlinksConsole.batches()).map(batch => batch.id)
  const counts: number[] = []
  const claimed: number[] = []
  for (let page = 0; page < 4; page++) {
    const summary = await call({ action: 'batch_get', batchId: 176, scope: 'pending' })
    const data = summary.data as { eligibleCount: number; nextItemIds: number[] }
    counts.push(data.eligibleCount)
    if (data.eligibleCount === 0) break
    const claim = await call({ action: 'batch_claim', batchId: 176, scope: 'pending' })
    const lease = claim.data as { itemIds: number[]; leaseId: number }
    for (const itemId of lease.itemIds) {
      claimed.push(itemId)
      await call({ action: 'item_result', itemId, status: 'failed', failureMode: 'manual_required',
        failureReason: 'Offline fixture completed without a submission' })
    }
    await call({ action: 'lease_release', leaseId: lease.leaseId })
  }
  const retries = await call({ action: 'batch_get', batchId: 176, scope: 'retryable' })
  process.stdout.write(JSON.stringify({ order, counts, claimed, retries: retries.data }) + '\n')
} finally {
  await ctx.fiber.dispose()
}
