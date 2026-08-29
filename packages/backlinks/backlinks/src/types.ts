/**
 * Vocabulary for the backlinks capability seam (`ctx.backlinks`): one batch-work-source registry (fetch publish
 * batches, claim leases, report per-item results, add reciprocal badges) and one mailbox registry (create
 * addresses, poll verification mail). Providers implement both registries; the model-facing tool lives in the
 * consumer. Result payloads mirror the supermanager `/api/agent/*` contract.
 * @module @deepseek-ai/dsh-backlinks/types
 */

import { HarnessError } from '@deepseek-ai/dsh-llm'

/** One publish batch with per-status counts. */
export interface BacklinkBatchSummary {
  readonly id: number
  readonly name: string
  readonly websiteId: number
  readonly websiteName: string
  readonly websiteHost: string
  readonly plannedAt: string
  readonly counts: {
    readonly pending: number
    readonly executed: number
    readonly skipped: number
    readonly failed: number
    readonly total: number
  }
  /** True while an agent lease is actively executing this batch's items. */
  readonly executing: boolean
}

/** One executable plan item: the target site and its current state. */
export interface BacklinkBatchItem {
  readonly id: number
  readonly sourceId: number
  readonly sourceName: string
  readonly sourceUrl: string
  readonly sourceHost: string
  readonly submitUrl: string | null
  readonly sourceNotes: string | null
  readonly category: string | null
  readonly tags: readonly string[]
  readonly paymentType: string
  readonly linkType: string
  readonly status: string
  readonly failureMode: string | null
  readonly failureReason: string | null
  readonly publishedUrl: string | null
  readonly publishStatus: string | null
  readonly plannedAt: string
}

/** An active anchor/target pair the promoted website offers for form filling. */
export interface BacklinkWebsiteAnchor {
  readonly id: number
  readonly anchorText: string
  readonly targetUrl: string
}

/** Batch detail: everything an executor needs before claiming. */
export interface BacklinkBatchDetail {
  readonly batch: BacklinkBatchSummary
  readonly website: {
    readonly id: number
    readonly name: string
    readonly siteUrl: string
    readonly siteHost: string
    /** 提交资料包：有值时发布方优先使用，缺失时自行获取。 */
    readonly shortDescription?: string
    readonly longDescription?: string
    readonly logoUrl?: string
    readonly screenshotUrl?: string
    readonly keyFeatures?: string
    readonly pricingType?: string
  }
  readonly anchors: readonly BacklinkWebsiteAnchor[]
  readonly items: readonly BacklinkBatchItem[]
}

/** A granted lease plus the claimed items' payloads. */
export interface BacklinkLeaseClaim {
  readonly leaseId: number
  /** Database-clock ISO-like instant; treat as opaque server time. */
  readonly leaseExpiresAt: string
  readonly items: readonly BacklinkBatchItem[]
}

/** Renewed lease window. */
export interface BacklinkHeartbeat {
  readonly leaseId: number
  readonly leaseExpiresAt: string
}

/** Agent-reported item outcome. The union is CLOSED and owned here. */
export type BacklinkItemResult =
  | { readonly status: 'live'; readonly publicUrl: string; readonly anchorText: string; readonly targetUrl: string; readonly evidence?: string }
  | { readonly status: 'submitted'; readonly publicUrl?: string; readonly anchorText: string; readonly targetUrl: string; readonly evidence?: string }
  | { readonly status: 'failed'; readonly failureMode: 'retryable' | 'manual_required'; readonly failureReason: string; readonly evidence?: string }
  | { readonly status: 'skipped'; readonly skipReason: string }

/** Server-side effect of one reported result. */
export interface BacklinkItemOutcome {
  readonly itemStatus: 'executed' | 'failed' | 'skipped'
  readonly publishRecordId: number | null
}

/** Badge name and HTML for one reciprocal footer badge. */
export interface BacklinkBadgeInput {
  readonly name: string
  readonly html: string
  readonly isActive?: boolean
}

/** Reciprocal badge creation effect. */
export interface BacklinkBadgeResult {
  readonly backlinkId: number
  readonly callbackTriggered: boolean
}

/** What one batch-work-source backend must implement (the supermanager agent API shape). */
export interface BacklinkBatchSourceProvider {
  /** Registry key and configured-selection id. */
  readonly id: string
  /** Cheap local usability check; must not make network calls. */
  available(): boolean
  /** @param signal - optional cancellation for the request.
   * @returns every batch in the workspace with per-status counts. */
  listBatches(signal?: AbortSignal): Promise<readonly BacklinkBatchSummary[]>
  /**
   * @param batchId - the batch to detail.
   * @param signal - optional cancellation for the request.
   * @returns batch, website, anchors, and items.
   */
  getBatch(batchId: number, signal?: AbortSignal): Promise<BacklinkBatchDetail>
  /**
   * Claim a batch for execution; `itemIds` omitted claims every pending and
   * retryable item, an explicit list may additionally include manual_required
   * items a human has unblocked.
   * @param batchId - the batch to claim.
   * @param itemIds - optional explicit plan-item subset.
   * @param signal - optional cancellation for the request.
   * @returns the granted lease and claimed item payloads.
   */
  claim(batchId: number, itemIds?: readonly number[], signal?: AbortSignal): Promise<BacklinkLeaseClaim>
  /**
   * Extend the lease window from the server clock.
   * @param leaseId - the lease granted by claim.
   * @param signal - optional cancellation for the request.
   * @returns the renewed lease window.
   */
  heartbeat(leaseId: number, signal?: AbortSignal): Promise<BacklinkHeartbeat>
  /**
   * Release a lease early.
   * @param leaseId - the lease to release.
   * @param signal - optional cancellation for the request.
   */
  release(leaseId: number, signal?: AbortSignal): Promise<void>
  /**
   * Report one item's terminal result; the backend writes publish records and
   * flips the plan item.
   * @param itemId - the claimed plan item.
   * @param result - the closed-union outcome.
   * @param signal - optional cancellation for the request.
   * @returns the server-side item status and created record id.
   */
  reportItemResult(itemId: number, result: BacklinkItemResult, signal?: AbortSignal): Promise<BacklinkItemOutcome>
  /**
   * Add and activate a reciprocal footer badge for one website.
   * @param websiteId - the promoted website.
   * @param badge - badge name and HTML.
   * @param signal - optional cancellation for the request.
   * @returns the created badge id and whether the callback fired.
   */
  addBadge(websiteId: number, badge: BacklinkBadgeInput, signal?: AbortSignal): Promise<BacklinkBadgeResult>
  /**
   * Attach tags to one source by NAME (workspace-local tag ids never cross the
   * provider boundary); missing names are created by the backend, repeats are
   * idempotent no-ops, and nothing is ever detached.
   * @param sourceId - the target site's source id from the batch items.
   * @param names - tag names to attach, 1-10 per call.
   * @param signal - optional cancellation for the request.
   * @returns the resolved tag ids and whether each was newly created.
   */
  tagSource(sourceId: number, names: readonly string[], signal?: AbortSignal): Promise<BacklinkTagResult>
}

/** One attached source tag resolution outcome. */
export interface BacklinkTagResult {
  readonly sourceId: number
  readonly attached: readonly { id: number; name: string; created: boolean }[]
}

/** A created mailbox address. */
export interface MailboxAddress {
  readonly email: string
}

/** One received verification mail with its extracted confirmation facts. */
export interface VerificationMail {
  readonly subject: string
  readonly from: string
  readonly text: string
  /** Backend-extracted verification code, when present. */
  readonly code: string | null
  /** First http(s) URL found in the body, when present. */
  readonly link: string | null
  readonly receivedAt: string
}

/** Poll options: match filters plus a bounded wait. */
export interface MailPollOptions {
  /** Substring the subject must contain, when set. */
  readonly subjectContains?: string
  /** Substring the sender must contain, when set. */
  readonly fromContains?: string
  /** Total wait bound in milliseconds. */
  readonly timeoutMs: number
  /** Delay between polls in milliseconds. */
  readonly intervalMs: number
}

/** What one mailbox backend must implement (the cloud-mail Open API shape). */
export interface MailboxProvider {
  /** Registry key and configured-selection id. */
  readonly id: string
  /** Cheap local usability check; must not make network calls. */
  available(): boolean
  /**
   * Create one mailbox address.
   * @param options - the desired local part and domain.
   * @param signal - optional cancellation for the request.
   * @returns the created address.
   */
  createMailbox(options: { readonly localPart: string; readonly domain: string }, signal?: AbortSignal): Promise<MailboxAddress>
  /**
   * Poll one address until a matching mail arrives or the timeout elapses.
   * @param address - the mailbox to poll.
   * @param options - match filters and the bounded wait.
   * @param signal - optional cancellation for the whole wait.
   * @returns the first matching mail, or `null` on timeout.
   */
  pollMail(address: MailboxAddress, options: MailPollOptions, signal?: AbortSignal): Promise<VerificationMail | null>
}

/** Backlinks seam failure taxonomy; route on `code`, never by parsing `message`. */
export type BacklinksErrorCode =
  | 'BACKLINKS_DUPLICATE_PROVIDER'
  | 'BACKLINKS_PROVIDER_CONFIGURED_MISSING'
  | 'BACKLINKS_PROVIDER_CONFIGURED_UNAVAILABLE'
  | 'BACKLINKS_PROVIDER_UNAVAILABLE'
  | 'BACKLINKS_PROVIDER_AMBIGUOUS'
  | 'BACKLINKS_UNAUTHORIZED'
  | 'BACKLINKS_NOT_FOUND'
  | 'BACKLINKS_CONFLICT'
  | 'BACKLINKS_INVALID_REQUEST'
  | 'BACKLINKS_API_ERROR'
  | 'BACKLINKS_TRANSPORT'
  | 'BACKLINKS_TIMEOUT'
  | 'BACKLINKS_ABORTED'

/** Backlinks seam error with a stable machine-routable code. */
export class BacklinksError extends HarnessError {
  /** Server-advised retry wait in seconds, when the backend supplied one. */
  readonly retryAfterSeconds: number | null

  constructor(message: string, code: BacklinksErrorCode, retryAfterSeconds: number | null = null, options?: ErrorOptions) {
    super(message, code, options)
    this.retryAfterSeconds = retryAfterSeconds
  }
}
