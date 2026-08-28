/**
 * Publish-batch console, browser half: mounts the full-screen console into
 * `shell.overlay` and a sidebar footer action that opens it. The console reads
 * batches over the backlinksConsole Remote and publishes by starting a fresh
 * session and sending `/backlink-publish <id>` through the conversation face.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarFooterActionOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { createConsoleStore } from './store.ts'
import { BacklinksConsoleOverlay } from './ConsoleOverlay.tsx'
import { SidebarConsoleAction } from './SidebarConsoleAction.tsx'
import { en, zh, type ConsoleKey } from './locales.ts'

export { createConsoleStore } from './store.ts'
export type { ConsoleStore, ConsoleViewState } from './store.ts'

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
 * Client plugin body: dictionaries, the console store, then the two slot
 * registrations (overlay page + sidebar footer action).
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-backlinks-console: dictionaries')

  const store = createConsoleStore(ctx)

  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      { name: 'shell.overlay', id: 'backlinks-console', order: 50, locale: NS },
      (props: PropsLocale<'backlinksConsole'>) => BacklinksConsoleOverlay({ ...props, store }),
    ))

  ctx.slots.inject('sidebar.footer.action', () =>
    ctx.slots.register(
      { name: 'sidebar.footer.action', id: 'backlinks-console', locale: NS },
      (props: SidebarFooterActionOwnerProps & PropsLocale<'backlinksConsole'>) =>
        SidebarConsoleAction({ ...props, store }),
    ))
}
