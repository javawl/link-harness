/**
 * Console face for the backlinks seam: a read-only Typert Remote service the
 * Web client's publish console renders from. It adds no behavior of its own —
 * every method is a pass-through over `ctx.backlinks`, so the console sees
 * exactly the data the model-facing tool sees, under the same provider
 * selection and error taxonomy.
 *
 * @module @deepseek-ai/dsh-backlinks-console
 */

import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-backlinks'
import type { BacklinkBatchDetail, BacklinkBatchSummary } from '@deepseek-ai/dsh-backlinks/types'

declare module '@deepseek-ai/cordis' {
  interface Context {
    backlinksConsole: BacklinksConsoleRuntime
  }
}

/** Required seam: the backlinks capability this console reads through. */
export const inject = ['backlinks']

/**
 * The read-only Remote console over `ctx.backlinks`. Mounted as a Service
 * plugin (`ctx.plugin(BacklinksConsoleRuntime)` via the composition row), it
 * binds the `backlinksConsole` wire namespace for the gateway.
 */
export class BacklinksConsoleRuntime extends TypertRemoteService {
  /** The seam every read passes through; the console mounts only when it is up. */
  static inject = ['backlinks']

  constructor(ctx: Context) {
    super(ctx, 'backlinksConsole')
  }

  /**
   * Every batch in the workspace with per-status counts and the executing flag.
   * @returns the provider's batch summaries, newest-planned first.
   */
  @Remote
  async batches(): Promise<readonly BacklinkBatchSummary[]> {
    return await this.ctx.backlinks.listBatches()
  }

  /**
   * One batch's full detail: website, anchors, and items.
   * @param batchId - the batch to read.
   * @returns batch, website, anchors, and items.
   */
  @Remote
  async batch(batchId: number): Promise<BacklinkBatchDetail> {
    return await this.ctx.backlinks.getBatch(batchId)
  }
}

export default BacklinksConsoleRuntime
