/**
 * Console face for the backlinks seam: a read-only Typert Remote service the
 * Web client's publish console renders from. Batch rows use descending ids
 * so newly created batches stay visible even when their planned date is older.
 * Reads use the backlinks provider selection and error taxonomy.
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
   * @returns every batch summary in descending batch-id order.
   */
  @Remote
  async batches(): Promise<readonly BacklinkBatchSummary[]> {
    return [...await this.ctx.backlinks.listBatches()].sort((left, right) => right.id - left.id)
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
