/**
 * Console face for the backlinks seam: a Typert Remote service the
 * Web client's publish console renders from. Batch rows use descending ids
 * so newly created batches stay visible even when their planned date is older.
 * Reads use the backlinks provider selection and error taxonomy.
 *
 * @module @deepseek-ai/dsh-backlinks-console
 */

import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-backlinks'
import type {} from '@deepseek-ai/dsh-browser'
import type { BrowserProfile } from '@deepseek-ai/dsh-browser-playwright'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { BacklinkBatchDetail, BacklinkBatchSummary } from '@deepseek-ai/dsh-backlinks/types'

declare module '@deepseek-ai/cordis' {
  interface Context {
    backlinksConsole: BacklinksConsoleRuntime
  }
}

/** Required seam: the backlinks capability this console reads through. */
export const inject = ['backlinks']

/**
 * The Remote console over `ctx.backlinks`. Mounted as a Service
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
  /**
   * Browser choices and durable website defaults for the publish panel.
   * @returns configured browser availability and website-to-browser bindings.
   */
  @Remote
  browsers(): Promise<{ browsers: { id: string; available: boolean }[]; bindings: Record<string, string> }> {
    return Promise.resolve({ browsers: this.ctx.get('browser')?.list() ?? [], bindings: { ...this.ctx.backlinks.browserBindings() } })
  }

  /**
   * Save or clear a website default after verifying both references.
   * @param websiteId - website visible in the current backend's batches.
   * @param browserId - configured browser id; empty clears the binding.
   */
  @Remote
  async bindBrowser(websiteId: number, browserId: string): Promise<void> {
    if (!(await this.ctx.backlinks.listBatches()).some(batch => batch.websiteId === websiteId)) {
      throw new Error('This website is not present in the current publication workspace.')
    }
    if (browserId !== '') {
      const browser = this.ctx.get('browser')
      if (browser === undefined) throw new Error('No browser service is configured.')
      browser.resolve(browserId)
    }
    await this.ctx.backlinks.bindBrowser(websiteId, browserId)
  }

  /**
   * Add a named local browser through the Playwright provider's validated persistent settings.
   * @param id - unique user-facing browser id.
   * @param kind - dedicated profile directory or existing local Chromium connection.
   * @param location - profile directory or HTTP debugging endpoint.
   */
  @Remote
  async addBrowser(id: string, kind: 'profile' | 'cdp', location: string): Promise<void> {
    const settings = this.ctx.get('settings')
    const ns = settingsNamespace('browser-playwright')
    const section = settings?.describe().find(entry => entry.ns === ns)
    if (settings === undefined || section === undefined) throw new Error('Browser configuration requires the Playwright provider and persistent settings.')
    const profile: BrowserProfile = { id, ...kind === 'profile' ? { userDataDir: location } : { cdpEndpoint: location } }
    const { profiles } = section.value as { profiles: BrowserProfile[] }
    await settings.update(ns, { profiles: [...profiles, profile] }, section.revision)
  }

}

export default BacklinksConsoleRuntime
