/**
 * The sidebar footer action that opens the publish console. Pure component:
 * the wide flag shapes the label, the store share carries the open action.
 */

import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarFooterActionOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { ConsoleStore } from './store.ts'

/** Footer action props: the sidebar's owner share plus store and locale seats. */
export type SidebarConsoleActionProps = SidebarFooterActionOwnerProps & PropsLocale<'backlinksConsole'> & {
  store: ConsoleStore
}

/**
 * Render the console opener button.
 * @param props - sidebar column state, the console store, and the locale seat.
 * @returns the footer action button.
 */
export function SidebarConsoleAction(props: SidebarConsoleActionProps) {
  return (
    <button
      type="button"
      className={props.wide ? 'dsh-sidebar-footer-action wide' : 'dsh-sidebar-footer-action'}
      title={props.t('title')}
      onClick={() => { props.store.open() }}
    >
      {props.t('sidebar.action')}
    </button>
  )
}
