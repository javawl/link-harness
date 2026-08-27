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
  | BrowserBringToFrontCommand
  | BrowserClickCommand
  | BrowserFillCommand
  | BrowserSelectCommand
  | BrowserPressCommand
  | BrowserUploadCommand
  | BrowserScreenshotCommand
  | BrowserWaitForCommand
  | BrowserClosePageCommand

/**
 * Address one browser tab by its ref. Every command accepts `page`; a
 * navigate naming an unknown ref opens a new tab under it, any other command
 * naming an unknown or closed ref fails, and omission addresses the most
 * recently opened tab. Callers driving tabs in parallel MUST address every
 * command by ref: refs are the only thing that keeps one caller's actions off
 * another caller's tab.
 */
export interface BrowserPageAddress {
  /** Tab ref from a prior navigate result; omitted = most recent tab. */
  readonly page?: string
}

/** Navigate the addressed page to a URL and return the resulting page snapshot. */
export interface BrowserNavigateCommand extends BrowserPageAddress {
  readonly kind: 'navigate'
  /** Absolute http(s) URL. */
  readonly url: string
  /** Playwright load state to await; omitted = `load`. */
  readonly waitUntil?: 'load' | 'domcontentloaded' | 'networkidle'
  /** Bound on the returned text; over-long text is truncated and flagged. */
  readonly maxChars?: number
}

/** Capture url/title/text of the addressed page (whole page or one selector’s subtree). */
export interface BrowserSnapshotCommand extends BrowserPageAddress {
  readonly kind: 'snapshot'
  /** Selector limiting the capture; omitted = whole page body. */
  readonly selector?: string
  /** Capture shape: `text` = visible text, `aria` = the accessibility tree with element roles and names. */
  readonly format?: 'text' | 'aria'
  /** Bound on the returned text; over-long text is truncated and flagged. */
  readonly maxChars?: number
}

/** Surface the addressed tab: focus its window and bring the tab to front. */
export interface BrowserBringToFrontCommand extends BrowserPageAddress {
  readonly kind: 'bringToFront'
}

/** Click the first element matching the selector on the addressed page. */
export interface BrowserClickCommand extends BrowserPageAddress {
  readonly kind: 'click'
  readonly selector: string
}

/** Replace the value of a text input or textarea on the addressed page. */
export interface BrowserFillCommand extends BrowserPageAddress {
  readonly kind: 'fill'
  readonly selector: string
  readonly value: string
}

/** Choose an option of a `<select>` on the addressed page. */
export interface BrowserSelectCommand extends BrowserPageAddress {
  readonly kind: 'select'
  readonly selector: string
  readonly value: string
}

/** Press one keyboard key (for example `Enter`, `Tab`) on the addressed page. */
export interface BrowserPressCommand extends BrowserPageAddress {
  readonly kind: 'press'
  readonly key: string
}

/** Set files on an `<input type=file>` on the addressed page. */
export interface BrowserUploadCommand extends BrowserPageAddress {
  readonly kind: 'upload'
  readonly selector: string
  /** Absolute or cwd-relative file paths to attach. */
  readonly files: readonly string[]
}

/** Capture a PNG screenshot of the addressed page viewport. */
export interface BrowserScreenshotCommand extends BrowserPageAddress {
  readonly kind: 'screenshot'
}

/** Wait until the addressed page shows a selector or its URL matches, with a timeout. */
export interface BrowserWaitForCommand extends BrowserPageAddress {
  readonly kind: 'waitFor'
  /** CSS selector to wait for. */
  readonly selector?: string
  /** URL, glob, or regex-source string the page URL must match. */
  readonly url?: string
  /** Operation timeout in milliseconds; omitted = provider default. */
  readonly timeoutMs?: number
}

/** Close the addressed page tab (the session stays usable). */
export interface BrowserClosePageCommand extends BrowserPageAddress {
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
  /** Ref of the tab this capture came from; pass it back as `page`. */
  readonly page: string
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
 * One live automation session over a provider-launched browser. Commands
 * addressing the same tab serialize in dispatch order; commands addressing
 * different tabs (by ref) may run concurrently, so a caller must use refs for
 * everything it wants kept off other callers' tabs.
 */
export interface BrowserSession {
  /**
   * Perform one command on the addressed page.
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
