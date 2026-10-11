/**
 * Publish-batch console, browser half: mounts one global panel — a
 * `sidebar.panellist` row beside the built-in sessions list, with its page
 * registered under the `main` slot keyed by the panel id. The console reads
 * batches over the backlinksConsole Remote and publishes by connecting a
 * blank session and sending `/backlink-publish <ids>` through the
 * conversation face. Selected ids are submitted together in descending order.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { createConsoleStore } from './store.ts'
import { BacklinksConsoleIcon, SidebarConsolePanel } from './SidebarPanel.tsx'
import { en, zh, type ConsoleKey } from './locales.ts'

export { createConsoleStore } from './store.ts'
export type { ConsoleStore, ConsoleViewState } from './store.ts'
export { BacklinksConsoleIcon, SidebarConsolePanel } from './SidebarPanel.tsx'
export type { SidebarConsolePanelProps } from './SidebarPanel.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The publish console's copy. */
    backlinksConsole: ConsoleKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'backlinksConsole'

/** The console's fixed global panel id; the sidebar row and the page share it. */
export const PANEL_ID = 'backlinks-console' as MainPanelId

/** Required services: slots, locale, the Remote face, and the sessions/workspaces domains. */
export const inject = ['slots', 'locale', 'remote', 'remote.backlinksConsole', 'sessions', 'workspaces', 'uiWorkspace']

/**
 * Client plugin body: dictionaries, the console store, then the panel's two
 * registrations (sidebar row + main page).
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-backlinks-console: dictionaries')

  const t = ctx.locale.bind(NS)
  const store = createConsoleStore(ctx)

  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      { name: 'sidebar.panellist', id: PANEL_ID, order: 25, locale: NS, label: () => t('sidebar.action') },
      BacklinksConsoleIcon,
    ))

  ctx.slots.inject('main', () =>
    ctx.slots.register(
      { name: 'main', key: PANEL_ID, locale: NS, inject: () => ({ store }) },
      (props: PropsRuntime<'main'> & PropsLocale<'backlinksConsole'> & { store: ReturnType<typeof createConsoleStore> }) =>
        SidebarConsolePanel(props),
    ))
}
