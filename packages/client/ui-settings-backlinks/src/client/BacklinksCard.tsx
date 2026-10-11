/**
 * The shared renderer for the two backlinks provider pages: one backend
 * endpoint field plus one write-only token control. The per-provider wrappers
 * below pin this renderer's copy to their own locale keys; everything else —
 * staging, save fencing, the configured badge — is the shared controller's.
 */

import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { SettingsForm, SettingsSecretField, SettingsValueField } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { formLabels, type BacklinksSettingsLocaleKey } from './locales.ts'
import type { BacklinksCardFace } from './backlinks-card-controller.ts'

/** The locale keys one provider page renders. */
export interface BacklinksCardCopy {
  /** Page heading. */
  readonly title: BacklinksSettingsLocaleKey
  /** One-line description under the heading. */
  readonly description: BacklinksSettingsLocaleKey
  /** Endpoint field label. */
  readonly baseUrlLabel: BacklinksSettingsLocaleKey
  /** Endpoint field hint. */
  readonly baseUrlHint: BacklinksSettingsLocaleKey
  /** Token field label. */
  readonly tokenLabel: BacklinksSettingsLocaleKey
  /** Token field hint. */
  readonly tokenHint: BacklinksSettingsLocaleKey
  /** Badge copy while a token is stored. */
  readonly tokenSet: BacklinksSettingsLocaleKey
  /** Badge copy while no token is stored. */
  readonly tokenUnset: BacklinksSettingsLocaleKey
}

/** Props the renderer binds for either backlinks page. */
export type BacklinksProviderCardProps =
  PropsRuntime<'plugins.item'>
  & PropsLocale<'settings.backlinks'>
  & InjectFace<BacklinksCardFace>

/**
 * Render one backlinks provider page.
 * @param props - the view asked for, locale copy, the page snapshot, and its form actions.
 * @returns the one-liner, or the form.
 */
export function BacklinksProviderCard(props: BacklinksProviderCardProps & { copy: BacklinksCardCopy }) {
  const { t } = props
  const copy = props.copy
  const state = props.useBacklinksCard(snapshot => snapshot)
  if (props.view === 'summary') return t(copy.description)
  const disabled = !state.writable
  return (
    <SettingsForm labels={formLabels(t)} state={state} onSave={props.save} onDiscard={props.discard}>
      <SettingsValueField
        id={`plugin-config-backlinks-base-url-${copy.title}`}
        label={t(copy.baseUrlLabel)}
        hint={t(copy.baseUrlHint)}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        invalidLabel={t('invalidNumber')}
        disabled={disabled}
        {...state.baseUrl}
        onEdit={(text) => { props.edit('baseUrl', text) }}
        onReset={() => { props.resetField('baseUrl') }}
      />
      <SettingsSecretField
        id={`plugin-config-backlinks-token-${copy.title}`}
        label={t(copy.tokenLabel)}
        hint={t(copy.tokenHint)}
        disabled={disabled}
        text={state.token.text}
        configured={state.tokenConfigured}
        stateLabel={state.tokenConfigured ? t(copy.tokenSet) : t(copy.tokenUnset)}
        onEdit={(text) => { props.edit('token', text) }}
      />
    </SettingsForm>
  )
}

/** Copy for the supermanager batch-source page. */
const SUPERMANAGER_COPY: BacklinksCardCopy = {
  title: 'supermanagerTitle',
  description: 'supermanagerDescription',
  baseUrlLabel: 'supermanagerBaseUrl',
  baseUrlHint: 'supermanagerBaseUrlHint',
  tokenLabel: 'supermanagerToken',
  tokenHint: 'supermanagerTokenHint',
  tokenSet: 'supermanagerTokenSet',
  tokenUnset: 'supermanagerTokenUnset',
}

/** Copy for the cloud-mail mailbox page. */
const CLOUD_MAIL_COPY: BacklinksCardCopy = {
  title: 'cloudMailTitle',
  description: 'cloudMailDescription',
  baseUrlLabel: 'cloudMailBaseUrl',
  baseUrlHint: 'cloudMailBaseUrlHint',
  tokenLabel: 'cloudMailToken',
  tokenHint: 'cloudMailTokenHint',
  tokenSet: 'cloudMailTokenSet',
  tokenUnset: 'cloudMailTokenUnset',
}

/** Render the supermanager page. */
export function SupermanagerCard(props: BacklinksProviderCardProps) {
  return <BacklinksProviderCard {...props} copy={SUPERMANAGER_COPY} />
}

/** Render the cloud-mail page. */
export function CloudMailCard(props: BacklinksProviderCardProps) {
  return <BacklinksProviderCard {...props} copy={CLOUD_MAIL_COPY} />
}
