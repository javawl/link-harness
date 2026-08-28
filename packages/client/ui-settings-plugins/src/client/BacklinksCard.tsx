/**
 * The shared renderer for the two backlinks provider cards: one backend
 * endpoint field plus one write-only token control. The per-provider wrappers
 * below pin this renderer's copy to their own locale keys; everything else —
 * staging, save fencing, the configured badge — is the shared controller's.
 */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { PluginsSettingsLocaleKey } from './locales.ts'
import { SecretField, ValueField } from './fields.tsx'
import { PluginCard } from './PluginCard.tsx'
import type { BacklinksCardFace } from './backlinks-card-controller.ts'
import type {} from './slot-contract.ts'

/** The locale keys one provider card renders. */
export interface BacklinksCardCopy {
  /** Card heading. */
  readonly title: PluginsSettingsLocaleKey
  /** One-line description under the heading. */
  readonly description: PluginsSettingsLocaleKey
  /** Endpoint field label. */
  readonly baseUrlLabel: PluginsSettingsLocaleKey
  /** Endpoint field hint. */
  readonly baseUrlHint: PluginsSettingsLocaleKey
  /** Token field label. */
  readonly tokenLabel: PluginsSettingsLocaleKey
  /** Token field hint. */
  readonly tokenHint: PluginsSettingsLocaleKey
  /** Badge copy while a token is stored. */
  readonly tokenSet: PluginsSettingsLocaleKey
  /** Badge copy while no token is stored. */
  readonly tokenUnset: PluginsSettingsLocaleKey
}

/** Props the renderer binds for either backlinks card. */
export type BacklinksProviderCardProps =
  PropsRuntime<'settings.plugin.item'>
  & PropsLocale<'settings.plugins'>
  & InjectFace<BacklinksCardFace>

/**
 * Render one backlinks provider card.
 * @param props - locale copy, the pinned key set, the card snapshot, and its form actions.
 * @returns the card.
 */
export function BacklinksProviderCard(props: BacklinksProviderCardProps & { copy: BacklinksCardCopy }) {
  const { t } = props
  const copy = props.copy
  const state = props.useBacklinksCard(snapshot => snapshot)
  const disabled = !state.writable
  return (
    <PluginCard
      t={t}
      titleKey={copy.title}
      descriptionKey={copy.description}
      state={state}
      onSave={props.save}
      onDiscard={props.discard}
    >
      <ValueField
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
      <SecretField
        id={`plugin-config-backlinks-token-${copy.title}`}
        label={t(copy.tokenLabel)}
        hint={t(copy.tokenHint)}
        disabled={disabled}
        text={state.token.text}
        configured={state.tokenConfigured}
        stateLabel={state.tokenConfigured ? t(copy.tokenSet) : t(copy.tokenUnset)}
        onEdit={(text) => { props.edit('token', text) }}
      />
    </PluginCard>
  )
}

/** Copy for the supermanager batch-source card. */
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

/** Copy for the cloud-mail mailbox card. */
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

/** Render the supermanager card. */
export function SupermanagerCard(props: BacklinksProviderCardProps) {
  return <BacklinksProviderCard {...props} copy={SUPERMANAGER_COPY} />
}

/** Render the cloud-mail card. */
export function CloudMailCard(props: BacklinksProviderCardProps) {
  return <BacklinksProviderCard {...props} copy={CLOUD_MAIL_COPY} />
}
