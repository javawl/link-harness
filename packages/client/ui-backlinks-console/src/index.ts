/**
 * Publish-batch console plugin, node half. Pure UI plugin: the empty apply
 * gives Loader a host-side row while the browser half ships through
 * `exports["./client"]` (the full-screen console overlay plus the sidebar
 * footer action).
 * @module @deepseek-ai/dsh-client-ui-backlinks-console
 */

/** Host plugin body — this package contributes browser presentation only. */
export function apply(): void {}
