/**
 * The full-screen publish console overlay: quick actions, batch cards with
 * status, inline item details, search, and one-click publish into a fresh
 * session. Pure component: state arrives through the console store share and
 * the locale seat.
 */

import { useEffect, useState, useSyncExternalStore } from 'react'
import type { BacklinkBatchSummary } from '@deepseek-ai/dsh-backlinks/types'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConsoleStore } from './store.ts'
import css from './ConsoleOverlay.module.css'

/** Console overlay props: the store share plus the locale seat. */
export type ConsoleOverlayProps = PropsLocale<'backlinksConsole'> & {
  store: ConsoleStore
}

/** One localized label row of the per-batch counts. */
function CountChip(props: { label: string, value: number, tone?: 'danger' | 'muted' }) {
  return (
    <span className={props.tone === 'danger' ? css.chipDanger : css.chip}>
      {props.label} {String(props.value)}
    </span>
  )
}

/** One batch card: status chips, publish/detail actions, inline items table. */
function BatchCard(props: ConsoleOverlayProps & { batch: BacklinkBatchSummary }) {
  const { store, t, batch } = props
  const state = useSyncExternalStore(
    (fn: () => void) => store.store.subscribe(fn),
    () => store.store.getSnapshot(),
  )
  const detail = state.details[batch.id]
  const publishing = state.publishing === batch.id
  return (
    <div className={css.card}>
      <div className={css.cardHead}>
        <div>
          <div className={css.cardTitle}>#{String(batch.id)} {batch.websiteName ?? batch.websiteHost}</div>
          <div className={css.cardHost}>{batch.websiteHost} · {batch.plannedAt.slice(0, 10)}</div>
        </div>
        {batch.executing
          ? <span className={css.execBadge}><span className={css.pulse} />{t('executing')}</span>
          : null}
      </div>
      <div className={css.chips}>
        <CountChip label={t('counts.pending')} value={batch.counts.pending} />
        <CountChip label={t('counts.executed')} value={batch.counts.executed} />
        <CountChip label={t('counts.skipped')} value={batch.counts.skipped} tone="muted" />
        <CountChip label={t('counts.failed')} value={batch.counts.failed} tone="danger" />
      </div>
      {detail !== undefined
        ? (
          <table className={css.items}>
            <tbody>
              {detail.items.map((item) => (
                <tr key={item.id}>
                  <td className={css.itemId}>#{String(item.id)}</td>
                  <td className={css.itemHost}>{item.sourceHost}</td>
                  <td className={item.status === 'failed' ? css.itemFailed : css.itemStatus}>{item.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
        : null}
      <div className={css.actions}>
        <button
          type="button"
          className={css.primaryButton}
          disabled={publishing}
          onClick={() => { void store.publish(batch.id) }}
        >
          {publishing ? t('publishing') : t('publish')}
        </button>
        <button type="button" className={css.button} onClick={() => { void store.toggleDetail(batch.id) }}>
          {detail !== undefined ? t('detail.hide') : t('detail')}
        </button>
      </div>
    </div>
  )
}

/**
 * Render the console while open; null while closed.
 * @param props - the console store plus the locale seat.
 * @returns the full-screen console overlay.
 */
export function BacklinksConsoleOverlay(props: ConsoleOverlayProps) {
  const { store, t } = props
  const state = useSyncExternalStore(
    (fn: () => void) => store.store.subscribe(fn),
    () => store.store.getSnapshot(),
  )
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!state.open) return undefined
    const timer = setInterval(() => { void store.refresh() }, 30_000)
    return () => { clearInterval(timer) }
  }, [state.open, store])

  if (!state.open) return null

  const needle = query.trim().toLowerCase()
  const batches = needle === ''
    ? state.batches
    : state.batches.filter(batch =>
      batch.websiteHost.toLowerCase().includes(needle)
      || String(batch.id).includes(needle)
      || (batch.websiteName ?? '').toLowerCase().includes(needle))

  return (
    <div className={css.overlay} role="dialog" aria-label={t('title')}>
      <div className={css.page}>
        <header className={css.header}>
          <div>
            <h1 className={css.title}>{t('title')}</h1>
            <p className={css.subtitle}>{t('subtitle')}</p>
          </div>
          <div className={css.headerActions}>
            <button type="button" className={css.button} onClick={() => { void store.refresh() }}>
              {t('refresh')}
            </button>
            <button type="button" className={css.button} onClick={() => { store.close() }}>
              {t('close')}
            </button>
          </div>
        </header>
        <input
          className={css.search}
          placeholder={t('search.placeholder')}
          value={query}
          onChange={(e) => { setQuery(e.target.value) }}
        />
        {state.status === 'loading' && state.batches.length === 0
          ? <p className={css.note}>{t('loading')}</p>
          : null}
        {state.error !== null
          ? <p className={css.error}>{t('error')}：{state.error}</p>
          : null}
        {state.status === 'ready' && batches.length === 0
          ? <p className={css.note}>{t('empty')}</p>
          : null}
        <div className={css.grid}>
          {batches.map((batch) => <BatchCard key={batch.id} {...props} batch={batch} />)}
        </div>
      </div>
    </div>
  )
}
