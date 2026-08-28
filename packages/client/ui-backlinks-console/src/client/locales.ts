/** `backlinksConsole` namespace dictionaries: the publish console's copy. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'sidebar.action': '发布批次',
  'title': '外链发布控制台',
  'subtitle': '选择批次一键发布，或展开查看条目明细',
  'refresh': '刷新',
  'close': '关闭',
  'publish': '发布',
  'detail': '详情',
  'detail.hide': '收起',
  'publishing': '发布中…',
  'executing': '执行中',
  'counts.pending': '待发布',
  'counts.executed': '已执行',
  'counts.skipped': '已跳过',
  'counts.failed': '失败',
  'empty': '没有可发布的批次',
  'error': '加载失败',
  'retry': '重试',
  'loading': '加载中…',
  'search.placeholder': '搜索批次号或网站域名',
  'items.id': '条目',
  'items.status.pending': '待发布',
  'items.status.executed': '已执行',
  'items.status.skipped': '已跳过',
  'items.status.failed': '失败',
} satisfies Record<string, string>

/** The console namespace key union. */
export type ConsoleKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'sidebar.action': 'Publish Batches',
  'title': 'Backlink Publish Console',
  'subtitle': 'Pick a batch to publish in one click, or expand for item details',
  'refresh': 'Refresh',
  'close': 'Close',
  'publish': 'Publish',
  'detail': 'Details',
  'detail.hide': 'Hide',
  'publishing': 'Publishing…',
  'executing': 'Executing',
  'counts.pending': 'Pending',
  'counts.executed': 'Executed',
  'counts.skipped': 'Skipped',
  'counts.failed': 'Failed',
  'empty': 'No publishable batches',
  'error': 'Failed to load',
  'retry': 'Retry',
  'loading': 'Loading…',
  'search.placeholder': 'Search batch id or site host',
  'items.id': 'Item',
  'items.status.pending': 'Pending',
  'items.status.executed': 'Executed',
  'items.status.skipped': 'Skipped',
  'items.status.failed': 'Failed',
} satisfies Record<ConsoleKey, string>
