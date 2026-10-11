/** Locale bundles for the backlinks providers' settings pages. */

import type { SettingsFormLabels } from '@deepseek-ai/dsh-client-ui-primitives'

/** Locale keys the pages render. */
export type BacklinksSettingsLocaleKey =
  | 'supermanagerTitle' | 'supermanagerDescription'
  | 'supermanagerBaseUrl' | 'supermanagerBaseUrlHint'
  | 'supermanagerToken' | 'supermanagerTokenHint' | 'supermanagerTokenSet' | 'supermanagerTokenUnset'
  | 'cloudMailTitle' | 'cloudMailDescription'
  | 'cloudMailBaseUrl' | 'cloudMailBaseUrlHint'
  | 'cloudMailToken' | 'cloudMailTokenHint' | 'cloudMailTokenSet' | 'cloudMailTokenUnset'
  | 'overridden' | 'reset' | 'readOnly' | 'unavailable'
  | 'save' | 'saving' | 'saveFailed' | 'invalidNumber'

/** English copy. */
export const en: Record<BacklinksSettingsLocaleKey, string> = {
  supermanagerTitle: 'Supermanager',
  supermanagerDescription: 'Set up the backlink batch work source.',
  supermanagerBaseUrl: 'Backend endpoint',
  supermanagerBaseUrlHint: 'Production domain or a local dev instance; leave blank to keep the composed default.',
  supermanagerToken: 'Agent token',
  supermanagerTokenHint: 'Stored in the local settings file. Leave blank to keep the current token.',
  supermanagerTokenSet: 'A token is configured.',
  supermanagerTokenUnset: 'No token is configured; batches are unavailable until one is.',
  cloudMailTitle: 'Cloud-mail',
  cloudMailDescription: 'Set up the verification-mailbox provider.',
  cloudMailBaseUrl: 'API endpoint',
  cloudMailBaseUrlHint: 'Leave blank to keep the composed default.',
  cloudMailToken: 'API token',
  cloudMailTokenHint: 'Stored in the local settings file. Leave blank to keep the current token.',
  cloudMailTokenSet: 'A token is configured.',
  cloudMailTokenUnset: 'No token is configured; mailboxes are unavailable until one is.',
  overridden: 'Overridden',
  reset: 'Reset to default',
  readOnly: 'This deployment stores settings read-only.',
  unavailable: 'This plugin is not loaded, so it cannot be configured right now.',
  save: 'Save',
  saving: 'Saving…',
  saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
  invalidNumber: 'Enter a number, or leave blank to use the default.',
}

/** Simplified Chinese copy. */
export const zh: Record<BacklinksSettingsLocaleKey, string> = {
  supermanagerTitle: 'Supermanager',
  supermanagerDescription: '设置外链批次工作源。',
  supermanagerBaseUrl: '后端地址',
  supermanagerBaseUrlHint: '生产域名或本地开发实例；留空保持组合文件预置值。',
  supermanagerToken: 'Agent 令牌',
  supermanagerTokenHint: '保存在本机设置文件里。留空表示保持当前令牌。',
  supermanagerTokenSet: '已配置令牌。',
  supermanagerTokenUnset: '未配置令牌；配置之前批次功能不可用。',
  cloudMailTitle: 'Cloud-mail',
  cloudMailDescription: '设置验证邮箱提供方。',
  cloudMailBaseUrl: '接口地址',
  cloudMailBaseUrlHint: '留空保持组合文件预置值。',
  cloudMailToken: '接口令牌',
  cloudMailTokenHint: '保存在本机设置文件里。留空表示保持当前令牌。',
  cloudMailTokenSet: '已配置令牌。',
  cloudMailTokenUnset: '未配置令牌；配置之前邮箱功能不可用。',
  overridden: '已覆盖',
  reset: '恢复默认',
  readOnly: '本部署的设置为只读。',
  unavailable: '该插件当前未加载，暂时无法配置。',
  save: '保存',
  saving: '保存中…',
  saveFailed: '本部署没有接受这些值，已保留供你修改。',
  invalidNumber: '请填数字；留空表示使用默认值。',
}

/**
 * The form frame's copy, read from the pages' dictionary.
 * @param t - the pages' locale reader.
 * @returns the labels the shared settings form renders.
 */
export function formLabels(t: (key: BacklinksSettingsLocaleKey) => string): SettingsFormLabels {
  return { unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') }
}
