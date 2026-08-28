/**
 * The backlinks provider cards' staged form over one provider namespace
 * (`backlinks-supermanager` / `backlinks-cloud-mail`).
 *
 * The token is a section secret: the wire value is redacted, so its control
 * seeds blank and writes through the form's secret channel — a blank draft
 * writes nothing, and the configured badge comes from the describe mirror's
 * secret slots rather than any literal. The read-back verification a plain
 * field performs would always report failure for a secret the response cannot
 * carry, which is why the token never stages as an ordinary text field.
 */

import type { SettingsDescribeFace } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { SettingsScope, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { CardForm, textField } from './card-form.ts'
import type { CardActions, CardFieldState, CardShell } from './card-form.ts'

/**
 * Namespace of the supermanager batch source. Spelled here rather than
 * imported: a client package must not depend on a Host package.
 */
export const BACKLINKS_SUPERMANAGER_NS = 'backlinks-supermanager'

/** Namespace of the cloud-mail mailbox provider, spelled for the same reason. */
export const BACKLINKS_CLOUD_MAIL_NS = 'backlinks-cloud-mail'

/** The provider fields one backlinks card edits. */
export interface BacklinksSettings {
  /** Backend base URL; blank inherits the composition layer's endpoint. */
  readonly baseUrl?: string
  /** Section-declared secret; redacted on the wire, so never read here. */
  readonly token?: string
}

/** What one backlinks provider card renders. */
export interface BacklinksCardState extends CardShell {
  /** Backend base URL field. */
  baseUrl: CardFieldState
  /** The staged token, which starts blank on every load. */
  token: CardFieldState
  /** Whether the describe mirror reports a stored token for this namespace. */
  tokenConfigured: boolean
}

/** The registration-side face one backlinks card's slot entry injects. */
export interface BacklinksCardFace extends CardActions {
  hooks: {
    /** Card snapshot bound by the renderer as useBacklinksCard. */
    backlinksCard: SnapshotStore<BacklinksCardState>
  }
}

/**
 * Bridges one provider's settings scope and the shared describe mirror onto
 * its card.
 */
export class BacklinksCardController {
  private readonly form: CardForm<BacklinksSettings>
  private readonly store: SnapshotStore<BacklinksCardState>
  private readonly unsubscribe: () => void
  private configured = false

  /**
   * @param scope - the bound settings scope for this provider's namespace.
   * @param describe - the shared describe mirror; its refreshes after document
   * commits are what keep the token's configured state current.
   * @param ns - the provider's settings namespace.
   */
  constructor(
    scope: SettingsScope<BacklinksSettings>,
    private readonly describe: SettingsDescribeFace,
    private readonly ns: string,
  ) {
    this.form = new CardForm(
      scope,
      [textField('baseUrl')],
      [{ field: 'token', write: text => BacklinksCardController.writeToken(scope, text) }],
    )
    this.store = this.form.bind(() => this.projection())
    this.unsubscribe = describe.subscribe(() => { this.readConfigured() })
    this.readConfigured()
  }

  /** Release the describe subscription (the scope follows the caller's fiber). */
  dispose(): void {
    this.unsubscribe()
  }

  private projection(): BacklinksCardState {
    return {
      ...this.form.shell(),
      baseUrl: this.form.field('baseUrl'),
      token: this.form.field('token'),
      tokenConfigured: this.configured,
    }
  }

  /** Derive the token's configured state from the describe mirror's secret slots. */
  private readConfigured(): void {
    const entry = this.describe.getSnapshot().view?.namespaces.find(row => row.ns === this.ns)
    const configured = entry?.secrets.some(slot => slot.path[0] === 'token' && slot.set) ?? false
    if (configured === this.configured) return
    this.configured = configured
    this.store.set(this.projection())
  }

  /**
   * Build the face the card's slot registration injects.
   * @returns the card's snapshot and its form actions.
   */
  inject(): BacklinksCardFace {
    return { hooks: { backlinksCard: this.store }, ...this.form.actions() }
  }

  /**
   * Write the staged token literal into the section. The scope's revision
   * fencing rejects a refused write, so a settlement needs no read-back the
   * redacted response could not answer anyway.
   * @param scope - the provider's bound settings scope.
   * @param value - the staged token literal.
   * @returns whether the write crossed without refusal.
   */
  private static async writeToken(scope: SettingsScope<BacklinksSettings>, value: string): Promise<boolean> {
    try {
      await scope.set('token', value)
      return true
    } catch {
      return false
    }
  }
}
