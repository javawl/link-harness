/**
 * Publish-batch console, browser half: mounts a sidebar panel tab
 * (`sidebar.panel.tab` + `sidebar.panel.body`) beside the Sessions tab. The
 * console reads batches over the backlinksConsole Remote and publishes by
 * connecting a blank session and sending `/backlink-publish <ids>` through
 * the conversation face. Selected ids are submitted together in descending order.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  SidebarPanelBodyOwnerProps, SidebarPanelTabOwnerProps,
} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { createConsoleStore } from './store.ts'
import { SidebarConsolePanel, SidebarConsoleTab } from './SidebarPanel.tsx'
import { en, zh, type ConsoleKey } from './locales.ts'

export { createConsoleStore } from './store.ts'
export type { ConsoleStore, ConsoleViewState } from './store.ts'
export { SidebarConsolePanel, SidebarConsoleTab } from './SidebarPanel.tsx'
export type { SidebarConsolePanelProps } from './SidebarPanel.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The publish console's copy. */
    backlinksConsole: ConsoleKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'backlinksConsole'

/** Required services: slots, locale, the Remote face, and the sessions/workspaces domains. */
export const inject = ['slots', 'locale', 'remote', 'remote.backlinksConsole', 'sessions', 'workspaces']

/**
 * Client plugin body: dictionaries, the console store, then the two panel
 * slot registrations (tab button + body).
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-backlinks-console: dictionaries')

  const store = createConsoleStore(ctx)

  ctx.slots.inject('sidebar.panel.tab', () =>
    ctx.slots.register(
      { name: 'sidebar.panel.tab', id: 'backlinks-console', locale: NS },
      (props: SidebarPanelTabOwnerProps & PropsLocale<'backlinksConsole'>) =>
        SidebarConsoleTab({ ...props, store }),
    ))

  ctx.slots.inject('sidebar.panel.body', () =>
    ctx.slots.register(
      { name: 'sidebar.panel.body', id: 'backlinks-console', locale: NS },
      (props: SidebarPanelBodyOwnerProps & PropsLocale<'backlinksConsole'>) =>
        props.activeId === 'backlinks-console'
          ? SidebarConsolePanel({ ...props, store })
          : null,
    ))
}
