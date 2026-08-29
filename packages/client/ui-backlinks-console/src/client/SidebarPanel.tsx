/**
 * The publish console as a sidebar panel: compact batch rows with status
 * chips, inline item details, search, auto-refresh, and one-click publish
 * into a fresh session. Pure component: state arrives through the console
 * store share and the locale seat.
 */

import { useEffect, useState, useSyncExternalStore } from 'react'
import type { BacklinkBatchSummary } from '@deepseek-ai/dsh-backlinks/types'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarPanelTabOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { ConsoleStore } from './store.ts'
import css from './SidebarPanel.module.css'

/** Sidebar panel props: the console store plus the locale seat. */
export type SidebarConsolePanelProps = PropsLocale<'backlinksConsole'> & {
  store: ConsoleStore
}

/** The panel's fixed registration id; the tab and the body share it. */
const PANEL_ID = 'backlinks-console'

/**
 * Render the console's tab button in the sidebar strip.
 * @param props - the tab activation share, the console store, and the locale seat.
 * @returns the tab button for this panel.
 */
export function SidebarConsoleTab(
  props: SidebarPanelTabOwnerProps & PropsLocale<'backlinksConsole'> & { store: ConsoleStore },
) {
  const { activeId, activate, t } = props
  return (
    <button
      type="button"
      role="tab"
      aria-selected={activeId === PANEL_ID}
      className={css.tab}
      onClick={() => { activate(PANEL_ID) }}
    >
      {t('sidebar.action')}
    </button>
  )
}

/** One compact batch row: chips + expandable items + publish action. */
function BatchRow(props: SidebarConsolePanelProps & { batch: BacklinkBatchSummary }) {
  const { store, t, batch } = props
  const state = useSyncExternalStore(
    (fn: () => void) => store.store.subscribe(fn),
    () => store.store.getSnapshot(),
  )
  const detail = state.details[batch.id]
  const publishing = state.publishing === batch.id
  return (
    <div className={css.row}>
      <button
        type="button"
        className={css.rowHead}
        onClick={() => { void store.toggleDetail(batch.id) }}
        aria-expanded={detail !== undefined}
      >
        <span className={css.rowTitle}>
          #{String(batch.id)} {batch.websiteHost}
        </span>
        <span className={css.rowChips}>
          {batch.counts.pending > 0 ? <span className={css.pending}>待 {String(batch.counts.pending)}</span> : null}
          {batch.counts.executed > 0 ? <span className={css.done}>成 {String(batch.counts.executed)}</span> : null}
          {batch.counts.failed > 0 ? <span className={css.failed}>败 {String(batch.counts.failed)}</span> : null}
          {batch.executing ? <span className={css.pulseDot} aria-label={t('executing')} /> : null}
        </span>
      </button>
      {detail !== undefined
        ? (
          <div className={css.items}>
            {detail.items.map((item) => (
              <div key={item.id} className={css.itemRow}>
                <span className={css.itemHost}>{item.sourceHost}</span>
                <span className={item.status === 'failed' ? css.itemFailed : css.itemStatus}>{item.status}</span>
              </div>
            ))}
          </div>
        )
        : null}
      <div className={css.rowActions}>
        <button
          type="button"
          className={css.publishButton}
          disabled={publishing}
          onClick={() => { void store.publish(batch.id) }}
        >
          {publishing ? t('publishing') : t('publish')}
        </button>
      </div>
    </div>
  )
}

/**
 * Render the console panel body for the sidebar tab.
 * @param props - the console store plus the locale seat.
 * @returns the compact console list.
 */
export function SidebarConsolePanel(props: SidebarConsolePanelProps) {
  const { store, t } = props
  const state = useSyncExternalStore(
    (fn: () => void) => store.store.subscribe(fn),
    () => store.store.getSnapshot(),
  )
  const [query, setQuery] = useState('')

  useEffect(() => {
    void store.refresh()
    const timer = setInterval(() => { void store.refresh() }, 30_000)
    return () => { clearInterval(timer) }
  }, [store])

  const needle = query.trim().toLowerCase()
  const batches = needle === ''
    ? state.batches
    : state.batches.filter(batch =>
      batch.websiteHost.toLowerCase().includes(needle)
      || String(batch.id).includes(needle)
      || (batch.websiteName ?? '').toLowerCase().includes(needle))

  return (
    <div className={css.panel}>
      <div className={css.toolbar}>
        <input
          className={css.search}
          placeholder={t('search.placeholder')}
          value={query}
          onChange={(e) => { setQuery(e.target.value) }}
        />
        <button type="button" className={css.toolButton} onClick={() => { void store.refresh() }}>
          {t('refresh')}
        </button>
      </div>
      {state.status === 'loading' && state.batches.length === 0
        ? <p className={css.note}>{t('loading')}</p>
        : null}
      {state.error !== null
        ? <p className={css.error}>{t('error')}：{state.error}</p>
        : null}
      {state.status === 'ready' && batches.length === 0
        ? <p className={css.note}>{t('empty')}</p>
        : null}
      <div className={css.list}>
        {batches.map((batch) => <BatchRow key={batch.id} {...props} batch={batch} />)}
      </div>
    </div>
  )
}
