/**
 * The supermanager implementation of the batch work-source seam: a Bearer-token HTTP client over the
 * `/api/agent/*` surface. Every non-2xx response maps into the seam's `BacklinksError` taxonomy; the
 * `Retry-After` header on lease conflicts survives as `retryAfterSeconds`.
 */

import type {
  BacklinkBadgeInput,
  BacklinkBadgeResult,
  BacklinkTagResult,
  BacklinkBatchDetail,
  BacklinkBatchItem,
  BacklinkBatchSourceProvider,
  BacklinkBatchSummary,
  BacklinkHeartbeat,
  BacklinkItemOutcome,
  BacklinkItemResult,
  BacklinkLeaseClaim,
  BacklinkWebsiteAnchor,
} from '@deepseek-ai/dsh-backlinks'
import { BacklinksError } from '@deepseek-ai/dsh-backlinks'

/** Registry id of this provider. */
export const SUPERMANAGER_BATCH_SOURCE_ID = 'supermanager'

/** Resolved HTTP client configuration after schemastery defaults. */
export interface ResolvedSupermanagerConfig {
  /** Base URL of the supermanager deployment, for example `http://127.0.0.1:3000`. */
  readonly baseUrl: string
  /** Bearer agent token; resolves from `SUPERMANAGER_TOKEN` when omitted from config. */
  readonly token: string
  /** Per-request timeout in milliseconds. */
  readonly requestTimeoutMs: number
}

/** @param value - a JSON value asserted by the caller to be an object.
 * @returns the value as a mutable record. */
function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>
}

/** Coerce one wire field to text without invoking an object's default stringification.
 * @param value - the wire value.
 * @returns the field as text, or the empty string for non-strings. */
function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function toNumber(value: unknown): number {
  return Number(value)
}

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function toCounts(value: Record<string, unknown>): BacklinkBatchSummary['counts'] {
  const counts = asRecord(value)
  return {
    pending: toNumber(counts.pending),
    executed: toNumber(counts.executed),
    skipped: toNumber(counts.skipped),
    failed: toNumber(counts.failed),
    total: toNumber(counts.total),
  }
}

function toBatchSummary(value: unknown): BacklinkBatchSummary {
  const row = asRecord(value)
  return {
    id: toNumber(row.id),
    name: str(row.name),
    websiteId: toNumber(row.websiteId),
    websiteName: str(row.websiteName),
    websiteHost: str(row.websiteHost),
    plannedAt: str(row.plannedAt),
    counts: toCounts(asRecord(row.counts)),
  }
}

function toItem(value: unknown): BacklinkBatchItem {
  const row = asRecord(value)
  return {
    id: toNumber(row.id),
    sourceId: toNumber(row.sourceId),
    sourceName: str(row.sourceName),
    sourceUrl: str(row.sourceUrl),
    sourceHost: str(row.sourceHost),
    submitUrl: toNullableString(row.submitUrl),
    sourceNotes: toNullableString(row.sourceNotes),
    category: toNullableString(row.category),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    paymentType: str(row.paymentType),
    linkType: str(row.linkType),
    status: str(row.status),
    failureMode: toNullableString(row.failureMode),
    failureReason: toNullableString(row.failureReason),
    publishedUrl: toNullableString(row.publishedUrl),
    publishStatus: toNullableString(row.publishStatus),
    plannedAt: str(row.plannedAt),
  }
}

function toAnchor(value: unknown): BacklinkWebsiteAnchor {
  const row = asRecord(value)
  return {
    id: toNumber(row.id),
    anchorText: String(row.anchorText),
    targetUrl: String(row.targetUrl),
  }
}

function toDetail(value: Record<string, unknown>): BacklinkBatchDetail {
  const website = asRecord(value.website)
  return {
    batch: toBatchSummary(value.batch),
    website: {
      id: toNumber(website.id),
      name: String(website.name),
      siteUrl: String(website.siteUrl),
      siteHost: String(website.siteHost),
    },
    anchors: Array.isArray(value.anchors) ? value.anchors.map(toAnchor) : [],
    items: Array.isArray(value.items) ? value.items.map(toItem) : [],
  }
}

/** Map one HTTP failure onto the seam taxonomy. */
function httpError(path: string, response: Response, bodyText: string): BacklinksError {
  const retryAfter = Number(response.headers.get('retry-after') ?? '')
  const retryAfterSeconds = Number.isSafeInteger(retryAfter) && retryAfter > 0 ? retryAfter : null
  const detail = bodyText.slice(0, 300)
  switch (response.status) {
    case 400:
      return new BacklinksError(`supermanager rejected ${path}: ${detail}`, 'BACKLINKS_INVALID_REQUEST', null)
    case 401:
    case 403:
      return new BacklinksError(`supermanager denied ${path} (${response.status}): ${detail}`, 'BACKLINKS_UNAUTHORIZED')
    case 404:
      return new BacklinksError(`supermanager has no resource for ${path}: ${detail}`, 'BACKLINKS_NOT_FOUND')
    case 409:
      return new BacklinksError(`supermanager conflict on ${path}: ${detail}`, 'BACKLINKS_CONFLICT', retryAfterSeconds)
    default:
      return new BacklinksError(`supermanager ${path} failed (HTTP ${response.status}): ${detail}`, 'BACKLINKS_API_ERROR')
  }
}

/** supermanager-backed batch work source. */
export class SupermanagerBatchSource implements BacklinkBatchSourceProvider {
  readonly id = SUPERMANAGER_BATCH_SOURCE_ID

  constructor(private readonly config: ResolvedSupermanagerConfig) {}

  /** Usable once a base URL and token are configured; no network is touched. */
  available(): boolean {
    return this.config.baseUrl.length > 0 && this.config.token.length > 0
  }

  async listBatches(signal?: AbortSignal): Promise<readonly BacklinkBatchSummary[]> {
    const body = await this.requestJson('/api/agent/batches', { method: 'GET' }, signal)
    const batches = asRecord(body).batches
    return Array.isArray(batches) ? batches.map(toBatchSummary) : []
  }

  async getBatch(batchId: number, signal?: AbortSignal): Promise<BacklinkBatchDetail> {
    const body = await this.requestJson(`/api/agent/batches/${batchId}`, { method: 'GET' }, signal)
    return toDetail(asRecord(body))
  }

  async claim(batchId: number, itemIds?: readonly number[], signal?: AbortSignal): Promise<BacklinkLeaseClaim> {
    const payload = itemIds === undefined ? {} : { itemIds: [...itemIds] }
    const body = await this.requestJson(`/api/agent/batches/${batchId}/claim`, { method: 'POST', payload }, signal)
    const record = asRecord(body)
    return {
      leaseId: toNumber(record.leaseId),
      leaseExpiresAt: str(record.leaseExpiresAt),
      items: Array.isArray(record.items) ? record.items.map(toItem) : [],
    }
  }

  async heartbeat(leaseId: number, signal?: AbortSignal): Promise<BacklinkHeartbeat> {
    const body = await this.requestJson(`/api/agent/leases/${leaseId}/heartbeat`, { method: 'POST' }, signal)
    const record = asRecord(body)
    return {
      leaseId: toNumber(record.leaseId),
      leaseExpiresAt: str(record.leaseExpiresAt),
    }
  }

  async release(leaseId: number, signal?: AbortSignal): Promise<void> {
    await this.requestJson(`/api/agent/leases/${leaseId}/release`, { method: 'POST' }, signal)
  }

  async reportItemResult(itemId: number, result: BacklinkItemResult, signal?: AbortSignal): Promise<BacklinkItemOutcome> {
    const body = await this.requestJson(`/api/agent/items/${itemId}/result`, {
      method: 'POST',
      payload: this.resultPayload(result),
    }, signal)
    const record = asRecord(body)
    return {
      itemStatus: str(record.itemStatus) as BacklinkItemOutcome['itemStatus'],
      publishRecordId: record.publishRecordId === undefined || record.publishRecordId === null
        ? null
        : toNumber(record.publishRecordId),
    }
  }

  async addBadge(websiteId: number, badge: BacklinkBadgeInput, signal?: AbortSignal): Promise<BacklinkBadgeResult> {
    const body = await this.requestJson(`/api/agent/websites/${websiteId}/footer-backlinks`, {
      method: 'POST',
      payload: {
        name: badge.name,
        html: badge.html,
        ...badge.isActive === undefined ? {} : { isActive: badge.isActive },
      },
    }, signal)
    const record = asRecord(body)
    return {
      backlinkId: toNumber(record.backlinkId),
      callbackTriggered: record.callbackTriggered === true,
    }
  }

  async tagSource(sourceId: number, names: readonly string[], signal?: AbortSignal): Promise<BacklinkTagResult> {
    const body = await this.requestJson(`/api/agent/sources/${sourceId}/tags`, {
      method: 'POST',
      payload: { tags: [...names] },
    }, signal)
    const record = asRecord(body)
    const attached = Array.isArray(record.attached)
      ? record.attached.map((entry: unknown) => {
          const row = asRecord(entry)
          return {
            id: toNumber(row.id),
            name: str(row.name),
            created: row.created === true,
          }
        })
      : []
    return { sourceId: toNumber(record.sourceId), attached }
  }

  /** Flatten the closed union into the wire shape the agent API validates. */
  private resultPayload(result: BacklinkItemResult): Record<string, unknown> {
    switch (result.status) {
      case 'live':
        return {
          status: 'live',
          publicUrl: result.publicUrl,
          anchorText: result.anchorText,
          targetUrl: result.targetUrl,
          ...result.evidence === undefined ? {} : { evidenceZh: result.evidence },
        }
      case 'submitted':
        return {
          status: 'submitted',
          ...result.publicUrl === undefined ? {} : { publicUrl: result.publicUrl },
          anchorText: result.anchorText,
          targetUrl: result.targetUrl,
          ...result.evidence === undefined ? {} : { evidenceZh: result.evidence },
        }
      case 'failed':
        return {
          status: 'failed',
          failureMode: result.failureMode,
          failureReason: result.failureReason,
          ...result.evidence === undefined ? {} : { evidenceZh: result.evidence },
        }
      case 'skipped':
        return { status: 'skipped', skipReason: result.skipReason }
    }
  }

  /** One JSON request with timeout, cancellation, and typed error mapping. */
  private async requestJson(path: string, init: { method: 'GET' | 'POST'; payload?: Record<string, unknown> }, signal?: AbortSignal): Promise<unknown> {
    if (signal?.aborted) throw new BacklinksError('request aborted', 'BACKLINKS_ABORTED')
    const timeout = new AbortController()
    const timer = setTimeout(() =>{  timeout.abort() }, this.config.requestTimeoutMs)
    const onOuterAbort = () =>{  timeout.abort() }
    signal?.addEventListener('abort', onOuterAbort, { once: true })
    try {
      let response: Response
      try {
        response = await fetch(`${this.config.baseUrl}${path}`, {
          method: init.method,
          headers: {
            authorization: `Bearer ${this.config.token}`,
            ...init.payload === undefined ? {} : { 'content-type': 'application/json' },
          },
          ...init.payload === undefined ? {} : { body: JSON.stringify(init.payload) },
          signal: timeout.signal,
        })
      } catch (error) {
        if (signal?.aborted) throw new BacklinksError('request aborted', 'BACKLINKS_ABORTED')
        if (timeout.signal.aborted) {
          throw new BacklinksError(`supermanager ${path} timed out after ${this.config.requestTimeoutMs}ms`, 'BACKLINKS_TIMEOUT')
        }
        throw new BacklinksError(
          `supermanager ${path} transport failure: ${String(error instanceof Error ? error.message : error)}`,
          'BACKLINKS_TRANSPORT',
          null,
          { cause: error },
        )
      }
      const bodyText = await response.text()
      if (!response.ok) throw httpError(path, response, bodyText)
      return JSON.parse(bodyText) as unknown
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onOuterAbort)
    }
  }
}
