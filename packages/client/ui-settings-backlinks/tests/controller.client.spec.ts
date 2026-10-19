import { describe, expect, it, vi } from 'vitest'
import type { SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client'
import { stubConfigForm, type StubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import type { SettingsDescribeFace } from '@deepseek-ai/dsh-client-ui-settings/client'
import { BacklinksCardController, BACKLINKS_SUPERMANAGER_NS, type BacklinksSettings } from '../src/client/backlinks-card-controller.ts'

/** Make the stub behave like a Host that accepts every write. */
function acceptWrites(host: StubConfigForm<BacklinksSettings>): void {
  const section = (): Record<string, unknown> => ({ ...host.scope.getSnapshot().value as object })
  const layer = (): Record<string, unknown> => ({ ...host.scope.getSnapshot().user as object })
  host.mutate.mockImplementation((ops: readonly SettingsPathOpView[]) => {
    const value = { ...section() }
    const user = { ...layer() }
    for (const op of ops) {
      const field = op.path[0]!
      if (op.op === 'set') {
        value[field] = op.value
        user[field] = op.value
      } else {
        Reflect.deleteProperty(user, field)
        value[field] = (host.scope.getSnapshot().base as Record<string, unknown> | undefined)?.[field]
      }
    }
    host.publish({ value, user })
    return Promise.resolve(true)
  })
}

/** The writes the stub Host received, as flat op lists. */
function receivedOps(host: StubConfigForm<BacklinksSettings>): SettingsPathOpView[][] {
  return host.mutate.mock.calls.map(([ops]) => ops as SettingsPathOpView[])
}

/** A describe mirror whose one namespace's token slot answer can flip. */
function describeWith(ns: string, set: boolean): SettingsDescribeFace & { flip: (set: boolean) => void } {
  const listeners = new Set<() => void>()
  let slotSet = set
  const face: SettingsDescribeFace = {
    getSnapshot: () => ({
      status: 'ready',
      error: null,
      view: {
        writable: true,
        hasDocument: true,
        namespaces: [{
          ns, schema: {}, value: {}, applies: 'live', revision: 0, autoGenerate: false,
          secrets: [{ path: ['token'], set: slotSet }],
        }],
      },
    }),
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    ensure: () => Promise.resolve(),
    acceptView: () => { for (const listener of listeners) listener() },
  }
  return Object.assign(face, { flip: (next: boolean) => {
    slotSet = next
    for (const listener of listeners) listener()
  } })
}

describe('BacklinksCardController', () => {
  it('reads the token configured state from the describe mirror secret slots', () => {
    const host = stubConfigForm<BacklinksSettings>()
    const controller = new BacklinksCardController(host.scope, describeWith(BACKLINKS_SUPERMANAGER_NS, true), BACKLINKS_SUPERMANAGER_NS)
    host.publish({ status: 'ready', writable: true, value: { baseUrl: 'https://supermanager.test' }, user: {} })
    const state = () => controller.inject().hooks.backlinksCard.getSnapshot()

    expect(state().tokenConfigured).toBe(true)
    expect(state()).toMatchObject({
      baseUrl: { text: 'https://supermanager.test', overridden: false },
      token: { text: '', overridden: false },
    })
  })

  it('writes the staged token through the section as its own revision-fenced mutate', async () => {
    const host = stubConfigForm<BacklinksSettings>()
    acceptWrites(host)
    const controller = new BacklinksCardController(host.scope, describeWith(BACKLINKS_SUPERMANAGER_NS, false), BACKLINKS_SUPERMANAGER_NS)
    host.publish({ status: 'ready', writable: true, value: {}, user: {} })
    const face = controller.inject()

    face.edit('token', 'ds-secret')
    expect(face.hooks.backlinksCard.getSnapshot().dirty).toBe(true)
    expect(host.mutate).not.toHaveBeenCalled()

    face.save()
    await vi.waitFor(() => { expect(receivedOps(host)).toContainEqual([{ op: 'set', path: ['token'], value: 'ds-secret' }]) })
  })

  it('keeps a blank token draft from writing anything', async () => {
    const host = stubConfigForm<BacklinksSettings>()
    acceptWrites(host)
    const controller = new BacklinksCardController(host.scope, describeWith(BACKLINKS_SUPERMANAGER_NS, true), BACKLINKS_SUPERMANAGER_NS)
    host.publish({ status: 'ready', writable: true, value: { baseUrl: 'https://supermanager.test' }, user: {} })
    const face = controller.inject()

    face.edit('baseUrl', 'https://other.test')
    face.save()
    await vi.waitFor(() => { expect(host.mutate).toHaveBeenCalled() })

    expect(receivedOps(host)).toEqual([[{ op: 'set', path: ['baseUrl'], value: 'https://other.test' }]])
  })

  it('follows the describe mirror when the secret slot state flips', () => {
    const host = stubConfigForm<BacklinksSettings>()
    const describe = describeWith(BACKLINKS_SUPERMANAGER_NS, false)
    const controller = new BacklinksCardController(host.scope, describe, BACKLINKS_SUPERMANAGER_NS)
    host.publish({ status: 'ready', writable: true, value: {}, user: {} })
    const state = () => controller.inject().hooks.backlinksCard.getSnapshot()

    expect(state().tokenConfigured).toBe(false)

    // The mirror folds a write answer that marks the slot set; the badge
    // follows without any settings section change.
    describe.flip(true)

    expect(state().tokenConfigured).toBe(true)
  })
})
