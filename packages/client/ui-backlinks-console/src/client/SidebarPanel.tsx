/**
 * The publish console as a sidebar panel: compact batch rows with status
 * chips, inline item details, search, auto-refresh, and batch selection for
 * submission into a blank session. State arrives through the console
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
  const { concurrent } = state
  const publishing = state.publishing?.includes(batch.id) === true
  const boundBrowser = state.browserBindings[batch.websiteId]
  const selectedBrowser = state.browserOverrides[batch.id] ?? ''
  const unavailableBrowser = selectedBrowser || boundBrowser
  const missingBrowser = unavailableBrowser && !state.browsers.some(browser => browser.id === unavailableBrowser)
  return (
    <div className={css.row} data-selected={state.selectedBatchIds.includes(batch.id)}>
      <div className={css.rowHeader}>
        <input
          type="checkbox"
          className={css.checkbox}
          aria-label={`${t('selection.batch')} #${String(batch.id)} ${batch.websiteHost}`}
          checked={state.selectedBatchIds.includes(batch.id)}
          disabled={state.publishing !== null}
          onChange={(event) => { store.selectBatches([batch.id], event.target.checked) }}
        />
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
      </div>
      {detail !== undefined
        ? (
          <div className={css.items}>
            {detail.items.map(item => (
              <div key={item.id} className={css.itemRow}>
                <span className={css.itemHost}>{item.sourceHost}</span>
                <span className={css.itemStatus} data-status={item.status}>{item.status}</span>
              </div>
            ))}
          </div>
        )
        : null}
      {concurrent ? <div className={css.browserRow}>
        <label className={css.browserLabel}>
          {t('browser.select')}
          <select className={css.search} aria-label={`${t('browser.select')} #${String(batch.id)}`}
            value={selectedBrowser} disabled={state.publishing !== null}
            onChange={(event) => { store.selectBrowser(batch.id, event.target.value) }}>
            <option value="">{boundBrowser ? `${t('browser.bound')}: ${boundBrowser}` : t('browser.default')}</option>
            {missingBrowser && selectedBrowser ? <option value={selectedBrowser}>{selectedBrowser} ({t('browser.unavailable')})</option> : null}
            {state.browsers.map(browser => <option key={browser.id} value={browser.id} disabled={!browser.available}>
              {browser.id}{browser.available ? '' : ` (${t('browser.unavailable')})`}
            </option>)}
          </select>
        </label>
        <button type="button" className={css.toolButton}
          disabled={!selectedBrowser || !!missingBrowser || state.savingBrowser || state.publishing !== null}
          onClick={() => { void store.bindBrowser(batch.websiteId, selectedBrowser) }}>{t('browser.bind')}</button>
        {boundBrowser ? <button type="button" className={css.toolButton}
          disabled={state.savingBrowser || state.publishing !== null}
          onClick={() => { void store.bindBrowser(batch.websiteId, '') }}>{t('browser.unbind')}</button> : null}
      </div> : null}
      {missingBrowser ? <p className={css.error} role="alert">{t('browser.missing')}: {unavailableBrowser}</p> : null}
      <div className={css.rowActions}>
        <button
          type="button"
          className={css.publishButton}
          disabled={state.publishing !== null}
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
  const { concurrent } = state
  const [browserName, setBrowserName] = useState('')
  const [browserKind, setBrowserKind] = useState<'profile' | 'cdp'>('profile')
  const [browserLocation, setBrowserLocation] = useState('')

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
      || batch.websiteName.toLowerCase().includes(needle))
  const selectedVisible = batches.filter(batch => state.selectedBatchIds.includes(batch.id)).length

  return (
    <div className={css.panel} role="region" aria-label={t('title')}>
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
      <div className={css.browserToolbar}>
        <details className={css.browserSetup}>
          <summary>{t('browser.add')}</summary>
          <form className={css.browserForm} onSubmit={(event) => {
            event.preventDefault()
            void store.addBrowser(browserName.trim(), browserKind, browserLocation.trim())
          }}>
            <label>{t('browser.name')}<input className={css.search} required pattern="[a-zA-Z0-9][a-zA-Z0-9_-]*"
              value={browserName} onChange={(event) => { setBrowserName(event.target.value) }} placeholder="site-a" /></label>
            <label>{t('browser.kind')}<select className={css.search} value={browserKind}
              onChange={(event) => { setBrowserKind(event.target.value as 'profile' | 'cdp'); setBrowserLocation('') }}>
              <option value="profile">{t('browser.profile')}</option><option value="cdp">{t('browser.cdp')}</option>
            </select></label>
            <label>{browserKind === 'profile' ? t('browser.directory') : t('browser.endpoint')}
              <input className={css.search} required value={browserLocation}
                onChange={(event) => { setBrowserLocation(event.target.value) }}
                placeholder={browserKind === 'profile' ? './.browser-site-a' : 'http://127.0.0.1:9222'} /></label>
            <p className={css.note}>{browserKind === 'profile' ? t('browser.profileHelp') : t('browser.cdpHelp')}</p>
            <button type="submit" className={css.publishButton} disabled={state.savingBrowser || state.publishing !== null}>
              {state.savingBrowser ? t('browser.saving') : t('browser.save')}
            </button>
          </form>
        </details>
        <label className={css.selectAll}>
          <input type="checkbox" className={css.checkbox} checked={concurrent}
            onChange={(event) => { store.setConcurrent(event.target.checked) }} />
          {t('browser.concurrent')}
        </label>
      </div>
      {concurrent ? <p className={css.note}>{t('browser.parallel')}</p> : null}
      <div className={css.selectionBar}>
        <label className={css.selectAll}>
          <input
            type="checkbox"
            className={css.checkbox}
            checked={batches.length > 0 && selectedVisible === batches.length}
            ref={(input) => { if (input !== null) input.indeterminate = selectedVisible > 0 && selectedVisible < batches.length }}
            disabled={batches.length === 0 || state.publishing !== null}
            onChange={(event) => { store.selectBatches(batches.map(batch => batch.id), event.target.checked) }}
          />
          {t('selection.allVisible')}
        </label>
        <button
          type="button"
          className={css.publishButton}
          disabled={state.selectedBatchIds.length === 0 || state.publishing !== null}
          onClick={() => { void store.publishSelected() }}
        >
          {state.publishing !== null ? t('publishing') : `${t('publish.selected')} (${String(state.selectedBatchIds.length)})`}
        </button>
      </div>
      {state.status === 'loading' && state.batches.length === 0
        ? <p className={css.note}>{t('loading')}</p>
        : null}
      {state.error !== null
        ? <p className={css.error} role="alert">{t('error')}：{state.error}</p>
        : null}
      {state.status === 'ready' && batches.length === 0
        ? <p className={css.note}>{t('empty')}</p>
        : null}
      <div className={css.list}>
        {batches.map(batch => <BatchRow key={batch.id} {...props} batch={batch} />)}
      </div>
    </div>
  )
}
