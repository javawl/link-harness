/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-backlinks-cloud-mail`.
 * @module @deepseek-ai/dsh-backlinks-cloud-mail/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-backlinks-cloud-mail'

/** Cordis companion plugin name. */
export const name = 'backlinks-cloud-mail-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the provider is a stateless HTTP registration over the seam; mailbox state lives in
 * the backend, and the seam owns selection.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
