# 外链

[English](backlinks.md) | 中文

外链 seam 是一个能力 seam，在同一个 `ctx.backlinks` 服务上承载**两个提供方注册表**，并拆分到多个包：Service Definition（[dsh-backlinks](../../packages/backlinks/backlinks)，`ctx.backlinks` + 注册表与词汇）、Service Provider（[dsh-backlinks-supermanager](../../packages/backlinks/backlinks-supermanager)，supermanager `/api/agent/*` 批次工作源；[dsh-backlinks-cloud-mail](../../packages/backlinks/backlinks-cloud-mail)，cloud-mail Open-API 邮箱）与 Consumer（[dsh-tool-backlinks](../../packages/backlinks/tool-backlinks)，即 `backlinks` 工具 schema）。外链是**一项可选能力**，不属于 agent loop（智能体循环）主干——其词汇定义在此而非 [core.md](core.zh.md)。更换任一后端都不会改变模型驱动批次发布工作流的方式。

源码：[`packages/backlinks/backlinks/src/types.ts`](../../packages/backlinks/backlinks/src/types.ts)

## 为什么一个 seam 同时承载工作源与邮箱

批次执行与验证邮件不共享请求 schema，但它们被有意设计为同一个 `ctx.backlinks` 中间层：一个提供方选择策略的所有者、一套中止与错误词汇，以及一个面向产品的「此 harness 如何运行发布工作流」配置界面。代价是服务上并行的批次源/邮箱方法对；这种并行是有意为之。提供方注册的是**能力**（`BacklinkBatchSourceProvider` 或 `MailboxProvider`），而非工具；面向模型的名称、schema、提示词引导与展示全部集中在唯一的消费方 `dsh-tool-backlinks`。

## 条目结果词汇

`BacklinkItemResult` 是本包持有的闭合联合——`live`（已核验公开 URL + 锚文本快照）、`submitted`、`failed`（带 `retryable`/`manual_required` 模式）、`skipped`——与后端回写契约一一对应。消费方 `switch` 到穷尽；「绝不重放结果未知的条目」这条规则位于工具的提示词指引中，并映射为 `failed + manual_required`。

## 词汇

批次：`BacklinkBatchSummary` → `BacklinkBatchDetail`（网站、`anchors[]`、含 `submitUrl`/分类/标签/失败模式的 `items[]`）→ `BacklinkLeaseClaim`（`leaseId`、服务器时钟的 `leaseExpiresAt`、被认领条目）→ `BacklinkHeartbeat` → `BacklinkItemOutcome`。邮件：`createMailbox(localPart, domain)` → `pollMail(address, { subjectContains?, fromContains?, timeoutMs, intervalMs })` → `VerificationMail`（后端提取的 `code`、正文首个 `link`）。取消是每个方法直接可选的 `AbortSignal` 参数。完整契约与 `BacklinksError` 错误分类见 `src/types.ts`（HTTP 状态映射到 `BACKLINKS_UNAUTHORIZED`/`NOT_FOUND`/`CONFLICT`，并保留 `retryAfterSeconds`）。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxbacklinks--backlinksruntime"></a>

### `ctx.backlinks` — `BacklinksRuntime`

The backlinks service. Registered as `ctx.backlinks` (one instance per context). Selection follows the shared execution-time rules: a configured id must be registered and `available()`; without one, exactly one usable provider is required.

```ts cordis-catalog
/**
 * Register a batch work source. Throws {@link BacklinksError}
 * `BACKLINKS_DUPLICATE_PROVIDER` on a duplicate id. Returns a disposer;
 * disposed with the calling fiber.
 * @param provider - the provider; its `id` is the registry key.
 * @returns the disposer that unregisters the provider.
 */
registerBatchSourceProvider(provider: BacklinkBatchSourceProvider): () => void

/**
 * Register a mailbox provider. Throws {@link BacklinksError}
 * `BACKLINKS_DUPLICATE_PROVIDER` on a duplicate id. Returns a disposer;
 * disposed with the calling fiber.
 * @param provider - the provider; its `id` is the registry key.
 * @returns the disposer that unregisters the provider.
 */
registerMailboxProvider(provider: MailboxProvider): () => void

/**
 * List every batch in the workspace.
 * @param signal - optional cancellation forwarded to the provider.
 * @returns batch summaries with per-status counts.
 */
async listBatches(signal?: AbortSignal): Promise<readonly BacklinkBatchSummary[]>

/**
 * Fetch one batch's execution inputs.
 * @param batchId - the batch to detail.
 * @param signal - optional cancellation forwarded to the provider.
 * @returns batch, website, anchors, and items.
 */
async getBatch(batchId: number, signal?: AbortSignal): Promise<BacklinkBatchDetail>

/**
 * Claim a batch for execution.
 * @param batchId - the batch to claim.
 * @param itemIds - optional explicit plan-item subset.
 * @param signal - optional cancellation forwarded to the provider.
 * @returns the granted lease and claimed item payloads.
 */
async claim(batchId: number, itemIds?: readonly number[], signal?: AbortSignal): Promise<BacklinkLeaseClaim>

/**
 * Extend a lease from the server clock.
 * @param leaseId - the lease granted by claim.
 * @param signal - optional cancellation forwarded to the provider.
 * @returns the renewed lease window.
 */
async heartbeat(leaseId: number, signal?: AbortSignal): Promise<BacklinkHeartbeat>

/**
 * Release a lease early.
 * @param leaseId - the lease to release.
 * @param signal - optional cancellation forwarded to the provider.
 */
async release(leaseId: number, signal?: AbortSignal): Promise<void>

/**
 * Report one item's terminal result.
 * @param itemId - the claimed plan item.
 * @param result - the closed-union outcome.
 * @param signal - optional cancellation forwarded to the provider.
 * @returns the server-side item status and created record id.
 */
async reportItemResult(itemId: number, result: BacklinkItemResult, signal?: AbortSignal): Promise<BacklinkItemOutcome>

/**
 * Add and activate a reciprocal footer badge.
 * @param websiteId - the promoted website.
 * @param badge - badge name and HTML.
 * @param signal - optional cancellation forwarded to the provider.
 * @returns the created badge id and whether the callback fired.
 */
async addBadge(websiteId: number, badge: BacklinkBadgeInput, signal?: AbortSignal): Promise<BacklinkBadgeResult>

/**
 * Create one mailbox address.
 * @param options - the desired local part and domain.
 * @param signal - optional cancellation forwarded to the provider.
 * @returns the created address.
 */
async createMailbox(options: { readonly localPart: string; readonly domain: string }, signal?: AbortSignal): Promise<MailboxAddress>

/**
 * Poll one address until a matching mail arrives or the timeout elapses.
 * @param address - the mailbox to poll.
 * @param options - match filters and the bounded wait.
 * @param signal - optional cancellation for the whole wait.
 * @returns the first matching mail, or `null` on timeout.
 */
async pollMail(address: MailboxAddress, options: MailPollOptions, signal?: AbortSignal): Promise<VerificationMail | null>
```

Source: [`packages/backlinks/backlinks/src/index.ts`](../../packages/backlinks/backlinks/src/index.ts)
<!-- END GENERATED cordis-surface -->
