/**
 * Vocabulary for the browser automation capability seam (`ctx.browser`). One command dispatch with a CLOSED
 * discriminated union instead of one method per operation: the browser is one stateful surface, and a single
 * `act()` keeps selection, serialization, cancellation, and error ownership in one place. Providers implement
 * the dispatch; model-facing names and schemas live in the consumer.
 * @module @deepseek-ai/dsh-browser/types
 */

import { HarnessError } from '@deepseek-ai/dsh-llm'

/**
 * What one browser automation backend is asked to perform. The union is CLOSED
 * and owned here: providers `switch` to exhaustiveness so a new kind breaks
 * their compilation until handled.
 */
export type BrowserCommand =
  | BrowserNavigateCommand
  | BrowserSnapshotCommand
  | BrowserClickCommand
  | BrowserFillCommand
  | BrowserSelectCommand
  | BrowserPressCommand
  | BrowserUploadCommand
  | BrowserScreenshotCommand
  | BrowserWaitForCommand
  | BrowserClosePageCommand

/** Navigate the active page to a URL and return the resulting page snapshot. */
export interface BrowserNavigateCommand {
  readonly kind: 'navigate'
  /** Absolute http(s) URL. */
  readonly url: string
  /** Playwright load state to await; omitted = `load`. */
  readonly waitUntil?: 'load' | 'domcontentloaded' | 'networkidle'
  /** Bound on the returned text; over-long text is truncated and flagged. */
  readonly maxChars?: number
}

/** Capture url/title/text of the active page (whole page or one selector's subtree). */
export interface BrowserSnapshotCommand {
  readonly kind: 'snapshot'
  /** CSS selector limiting the capture; omitted = whole page body. */
  readonly selector?: string
  /** Bound on the returned text; over-long text is truncated and flagged. */
  readonly maxChars?: number
}

/** Click the first element matching the selector. */
export interface BrowserClickCommand {
  readonly kind: 'click'
  readonly selector: string
}

/** Replace the value of a text input or textarea matching the selector. */
export interface BrowserFillCommand {
  readonly kind: 'fill'
  readonly selector: string
  readonly value: string
}

/** Choose an option of a `<select>` matching the selector. */
export interface BrowserSelectCommand {
  readonly kind: 'select'
  readonly selector: string
  readonly value: string
}

/** Press one keyboard key (for example `Enter`, `Tab`) on the active page. */
export interface BrowserPressCommand {
  readonly kind: 'press'
  readonly key: string
}

/** Set files on an `<input type=file>` matching the selector. */
export interface BrowserUploadCommand {
  readonly kind: 'upload'
  readonly selector: string
  /** Absolute or cwd-relative file paths to attach. */
  readonly files: readonly string[]
}

/** Capture a PNG screenshot of the active page viewport. */
export interface BrowserScreenshotCommand {
  readonly kind: 'screenshot'
}

/** Wait until a selector appears or the URL matches, with a timeout. */
export interface BrowserWaitForCommand {
  readonly kind: 'waitFor'
  /** CSS selector to wait for. */
  readonly selector?: string
  /** URL, glob, or regex-source string the page URL must match. */
  readonly url?: string
  /** Operation timeout in milliseconds; omitted = provider default. */
  readonly timeoutMs?: number
}

/** Close the active page tab (the session stays usable). */
export interface BrowserClosePageCommand {
  readonly kind: 'closePage'
}

/**
 * Normalized automation outcome. The union is CLOSED and owned here:
 * consumers `switch` to exhaustiveness so a new kind breaks their compilation
 * until handled.
 */
export type BrowserResult =
  | BrowserPageResult
  | BrowserAckedResult
  | BrowserScreenshotResult

/** Page text capture: navigation, snapshot, and extraction all return this. */
export interface BrowserPageResult {
  readonly kind: 'page'
  /** Final URL after redirects. */
  readonly url: string
  readonly title: string
  /** Visible text of the page or the selector's subtree. */
  readonly text: string
  /** True when `maxChars` cut `text` short. */
  readonly truncated: boolean
}

/** Acknowledged state change with no content: click/fill/select/press/upload/waitFor/closePage. */
export interface BrowserAckedResult {
  readonly kind: 'acked'
}

/** Base64-encoded PNG of the active page viewport. */
export interface BrowserScreenshotResult {
  readonly kind: 'screenshot'
  readonly pngBase64: string
}

/**
 * One live automation session over a provider-launched browser. Commands are
 * dispatched one at a time by the seam; the provider guarantees each `act()`
 * observes the previous one's settled state.
 */
export interface BrowserSession {
  /**
   * Perform one command on the active page.
   * @param command - the closed-union command to execute.
   * @param signal - optional cancellation signal checked before dispatch.
   * @returns the closed-union outcome for the command kind.
   */
  act(command: BrowserCommand, signal?: AbortSignal): Promise<BrowserResult>
  /** Close the browser and reject further commands. Idempotent. */
  close(): Promise<void>
}

/** What one browser automation backend must implement to serve the seam. */
export interface BrowserAutomationProvider {
  /** Registry key and configured-selection id. */
  readonly id: string
  /** Cheap local usability check; must not launch a browser or make network calls. */
  available(): boolean
  /**
   * Launch (or attach to) a persistent browser and return its session.
   * @param signal - optional cancellation signal for the launch itself.
   * @returns a live session the caller owns until `close()`.
   */
  open(signal?: AbortSignal): Promise<BrowserSession>
}

/** Browser seam failure taxonomy; route on `code`, never by parsing `message`. */
export type BrowserErrorCode =
  | 'BROWSER_DUPLICATE_PROVIDER'
  | 'BROWSER_PROVIDER_CONFIGURED_MISSING'
  | 'BROWSER_PROVIDER_CONFIGURED_UNAVAILABLE'
  | 'BROWSER_PROVIDER_UNAVAILABLE'
  | 'BROWSER_PROVIDER_AMBIGUOUS'
  | 'BROWSER_LAUNCH_FAILED'
  | 'BROWSER_ABORTED'
  | 'BROWSER_ACTION_FAILED'

/** Browser seam error with a stable machine-routable code. */
export class BrowserError extends HarnessError {}
