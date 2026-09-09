# Agent Note: Background publication and manual browser control

Status: implemented

English | [中文](2026-09-09-background-publication.zh.md)

## Problem

An offscreen browser position does not prevent Chrome's default new-tab behavior from restoring a minimized window. Blocking explicit bringToFront calls alone does not cover page creation. Closing a login or CAPTCHA page also discards the operator's recovery point even when no submission occurred.

## Decision

The [publisher](../../../../packages/backlinks/tool-backlinks/src/publisher.ts) rejects bringToFront before browser dispatch. Its existing browser/backlinks tool restriction denies shell and system input tools. Playwright/CDP handles page input; the operator controls the dedicated headed Chrome's visibility. General browser guidance requires an explicit user request before surfacing a window.

The [Playwright provider](../../../../packages/browser/browser-playwright/src/provider.ts) creates tabs through [Target.createTarget](https://chromedevtools.github.io/devtools-protocol/tot/Target/#method-createTarget) with background enabled. Playwright's default context.newPage omits that flag. Page events are collected before creation, matched by target id across concurrent requests, and bounded by the operation timeout. Window-position arguments remain placement hints that macOS can adjust.

Saved manual_required failures retain their original pages. Batch results include manualRequired entries with itemId, browserId, page and reason for notification. Other eligible items continue. Only a saved retryable failure with no final submission or uncertain input can release a failed page. This replaces manual-failure cleanup in [page retention](2026-09-07-backlinks-retained-pages.md); its capacity and preflight decisions remain active. [Child tool authority](2026-09-08-backlinks-child-tool-authority.md) still owns schema and tool restrictions.

## Alternatives considered

**Only change the prompt.** A generated bringToFront call still reaches the browser unless the executor rejects it.

**Only reject bringToFront.** Native foreground tab creation can restore the window without invoking that action. Headless page tests cannot establish desktop minimization behavior.

**Use headless Chrome.** It removes the visible recovery point the operator needs for manual intervention.

## Consequences

Manual pages consume memory until the operator reviews them. Notifications accompany batch results; this change adds no desktop alerts or automatic browser relaunch. Publisher and Loader/Chrome regressions verify denial, retained pages, notifications and local publication. A macOS headed Loader scenario creates a minimized test window and verifies that concurrent creation, navigation, filling, clicking and screenshots preserve it. The tests do not measure physical pointer movement or third-party acceptance; website-created popups remain Chromium-controlled.
