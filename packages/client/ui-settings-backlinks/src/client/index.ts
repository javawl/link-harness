/**
 * The backlinks providers' settings pages, browser half: the supermanager
 * batch source's endpoint and agent token over the `backlinks-supermanager`
 * namespace, and the cloud-mail verification mailbox's endpoint and API token
 * over the `backlinks-cloud-mail` namespace. Each page registers into the
 * Plugins page's `plugins.item` slot while the Host serves its namespace, so
 * a deployment without the provider shows no trace of it. The namespaces are
 * registered by the matching provider packages, not here.
 */

// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the ctx.configForms Context merge. Cross-plugin collaboration
// goes through the service, never a value import (client bundle purity gate).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: the Plugins page's SlotMap merge (the 'plugins.item' entry).
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { CloudMailCard, SupermanagerCard } from './BacklinksCard.tsx'
import type { BacklinksProviderCardProps } from './BacklinksCard.tsx'
import {
  BACKLINKS_CLOUD_MAIL_NS, BACKLINKS_SUPERMANAGER_NS, BacklinksCardController,
} from './backlinks-card-controller.ts'
import { en, zh, type BacklinksSettingsLocaleKey } from './locales.ts'

export { CloudMailCard, SupermanagerCard } from './BacklinksCard.tsx'
export type { BacklinksProviderCardProps } from './BacklinksCard.tsx'
export type { BacklinksCardFace, BacklinksCardState, BacklinksSettings } from './backlinks-card-controller.ts'
export { BACKLINKS_CLOUD_MAIL_NS, BACKLINKS_SUPERMANAGER_NS } from './backlinks-card-controller.ts'
export type { BacklinksSettingsLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Backlinks provider settings pages' copy. */
    'settings.backlinks': BacklinksSettingsLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.backlinks'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'configForms']

/**
 * Mount one provider's page while the Host serves its namespace.
 * @param ctx - the browser plugin context.
 * @param ns - the provider's settings namespace.
 * @param id - the Plugins page entry id.
 * @param title - locale key for the entry's label.
 * @param Card - the provider's page renderer.
 */
function mountCard(
  ctx: ClientContext,
  ns: string,
  id: string,
  title: BacklinksSettingsLocaleKey,
  Card: (props: BacklinksProviderCardProps) => ReturnType<typeof SupermanagerCard>,
): void {
  const t = ctx.locale.bind(NS)
  const card = new BacklinksCardController(ctx.configForms.get(ns), ctx.configForms.describe(), ns)
  ctx.effect(() => () => { card.dispose() }, `ui-settings-backlinks: ${id} form subscription`)
  // The token is a section secret whose literal never rides a response; the
  // describe mirror's secret slots are the only configured-state signal, so
  // the page follows the mirror rather than the form's own snapshot.
  ctx.effect(() => ctx.configForms.whileServed([ns], () => ctx.slots.inject('plugins.item', () => ctx.slots.register({
    name: 'plugins.item', id, order: 30, label: () => t(title), locale: NS, inject: () => card.inject(),
  }, Card))), `ui-settings-backlinks: ${id} page`)
}

/**
 * Mount the backlinks providers' settings pages.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-backlinks: dictionaries')
  mountCard(ctx, BACKLINKS_SUPERMANAGER_NS, 'backlinks-supermanager', 'supermanagerTitle', SupermanagerCard)
  mountCard(ctx, BACKLINKS_CLOUD_MAIL_NS, 'backlinks-cloud-mail', 'cloudMailTitle', CloudMailCard)
}
