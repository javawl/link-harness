/** Local submission site and scripted model; the browser, child lifecycle, and publisher are real. */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import type { BacklinkBatchItem, BacklinkBatchDetail, BacklinkBatchSourceProvider, BacklinkItemResult } from '@deepseek-ai/dsh-backlinks'
import * as Supermanager from '@deepseek-ai/dsh-backlinks-supermanager'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import { MockAdapter, textResponse, toolCallResponse } from '../../../../packages/core/agent-loop/tests/mock-adapter.ts'

export const inject = ['llm', 'backlinks', 'tools', 'skills']

/**
 * Mount a loopback form site, in-memory external backend and scripted LLM adapter.
 * @param ctx - Loader-owned fixture context.
 */
export async function apply(ctx: Context): Promise<void> {
  const quota = process.env.DSH_PUBLISHER_SCENARIO === 'quota'
  const unresolved = process.env.DSH_PUBLISHER_SCENARIO === 'unresolved'
  const missingAnchors = process.env.DSH_PUBLISHER_SCENARIO === 'anchors'
  const invalidProfile = process.env.DSH_PUBLISHER_SCENARIO === 'invalid-profile'
  const budget = process.env.DSH_PUBLISHER_SCENARIO === 'budget'
  const multiBrowser = process.env.DSH_PUBLISHER_SCENARIO === 'multi-browser'
  const guardedTools = process.env.DSH_PUBLISHER_SCENARIO === 'guarded-tools'
  const manualRequired = process.env.DSH_PUBLISHER_SCENARIO === 'manual-required'
  const posted = new Map<number, URLSearchParams>()
  const serve = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const path = request.url ?? '/'
    let body = ''
    if (request.method === 'POST') {
      request.setEncoding('utf8')
      // setEncoding makes the request's otherwise untyped chunks strings.
      for await (const chunk of request as AsyncIterable<string>) body += chunk
    }
    if (/^\/api\/agent\/batches\/[0-9]+$/.test(path)) {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ ok: true, ...detail(Number(path.split('/').at(-1))) }))
      return
    }
    if (path.startsWith('/api/agent/')) {
      const [, , , kind, id, action] = path.split('/')
      let result: object | undefined
      if (kind === 'batches' && action === 'claim') {
        const payload = JSON.parse(body) as { itemIds: number[] }
        result = await backend.claim(Number(id), payload.itemIds)
      } else if (kind === 'leases' && action === 'heartbeat') result = await backend.heartbeat(Number(id))
      else if (kind === 'leases' && action === 'release') await backend.release(Number(id))
      else if (kind === 'items' && action === 'result') result = await backend.reportItemResult(Number(id), JSON.parse(body) as BacklinkItemResult)
      else throw new Error(`Unexpected fixture API path: ${path}`)
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ ok: true, ...result }))
      return
    }
    const id = Number(path.split('/').at(-1))
    if (request.method === 'POST') {
      posted.set(id, new URLSearchParams(body))
      response.end('saved')
      return
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    if (manualRequired && path === '/item/1') {
      response.end('<title>Manual login</title><h1>Complete login manually.</h1>')
    } else if (path === '/item/2') {
      response.end('<title>Nested listing</title><iframe id="outer" src="/outer/2"></iframe>')
    } else if (path === '/outer/2') {
      response.end('<iframe id="inner" src="/form/2"></iframe>')
    } else {
      response.end(`<title>Listing ${id}</title>
        <form aria-label="Publish" onsubmit="event.preventDefault();fetch('/publish/${id}',{method:'POST',body:new URLSearchParams(new FormData(this))}).then(()=>{document.querySelector('#receipt').textContent='Your submission is awaiting review.'})">
          <label>Name<input name="name" required></label>
          <label>Comment<textarea name="comment"></textarea></label>
          <label>Password<input type="PASSWORD" value="fixture-secret"></label>
          <input type="hidden" name="csrf" value="fixture-hidden">
          <label>Category<select name="category"><option value="tools">Tools</option></select></label>
          <button type="submit">Publish</button>
        </form>
        <p id="receipt"></p>
        <a style="visibility:hidden" href="https://hidden.test/">Hidden</a>
        <a href="https://wrong.test/">Site</a>
        <p>&lt;a href="https://site.test/"&gt;Site&lt;/a&gt;</p>
        ${posted.has(id) ? `<a href="https://${multiBrowser && id === 2 ? 'second' : 'site'}.test/">Site</a>` : ''}`)
    }
  }
  const server = createServer((request, response) => {
    void serve(request, response).catch((error: unknown) => {
      response.writeHead(500)
      response.end(error instanceof Error ? error.message : String(error))
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  ctx.effect(() => async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('missing fixture listener')
  const site = `http://127.0.0.1:${address.port}`
  let items: BacklinkBatchItem[] = (quota || unresolved ? [1, 2, 3] : [1, 2]).map(id => ({
    id, sourceId: id, sourceName: `Listing ${id}`, sourceHost: '127.0.0.1', sourceUrl: `${site}/item/${id}`,
    submitUrl: null, sourceNotes: null, category: id === 1 ? null : 'directory', tags: [], paymentType: 'free', linkType: 'dofollow',
    status: 'pending', failureMode: null, failureReason: null, publishStatus: null, publishedUrl: null, plannedAt: 't',
  }))
  const detail = (batchId = 176): BacklinkBatchDetail => ({
    batch: { id: batchId, name: 'Fixture batch', websiteId: 82, websiteName: 'Site', websiteHost: 'site.test', plannedAt: 't', executing: false,
      counts: { pending: items.filter(item => item.status === 'pending').length, executed: items.filter(item => item.status === 'executed').length,
        failed: items.filter(item => item.status === 'failed').length, skipped: 0, total: items.length } },
    website: { id: multiBrowser && batchId === 177 ? 83 : 82, name: invalidProfile ? '' : 'Site',
      siteUrl: multiBrowser && batchId === 177 ? 'https://second.test/' : 'https://site.test/',
      siteHost: multiBrowser && batchId === 177 ? 'second.test' : 'site.test' },
    anchors: missingAnchors || invalidProfile ? [] : [{ id: 1, anchorText: 'Site',
      targetUrl: multiBrowser && batchId === 177 ? 'https://second.test/' : 'https://site.test/' }],
    items: multiBrowser ? items.filter(item => item.id === (batchId === 177 ? 2 : 1)) : items,
  })
  const backend: BacklinkBatchSourceProvider = {
    id: 'fixture', available: () => true, listBatches: async () => [detail().batch], getBatch: async () => detail(),
    claim: async (batchId, ids) => ({ leaseId: batchId + 724, leaseExpiresAt: 'server-clock', items: items.filter(item => ids?.includes(item.id)) }),
    heartbeat: async leaseId => ({ leaseId, leaseExpiresAt: 'server-clock' }),
    release: async () => {
      if (quota && (posted.size !== 0 || items.filter(item => item.status === 'pending').length !== 2)) {
        throw new Error('Quota failure must preserve unstarted items without posting a form.')
      }
    },
    reportItemResult: async (id, result) => {
      if (result.status === 'failed' && (((quota || budget) && result.failureMode === 'retryable')
        || (manualRequired && id === 1 && result.failureMode === 'manual_required'))) {
        if (posted.has(id)) throw new Error('A failed fixture item must not submit its form.')
        items = items.map(item => item.id === id ? { ...item, status: 'failed', failureMode: result.failureMode, failureReason: result.failureReason } : item)
        return { itemStatus: 'failed', publishRecordId: null }
      }
      if (result.status !== 'live') throw new Error(`Fixture item ${id} was not verified live: ${JSON.stringify(result)}`)
      const current = items.find(item => item.id === id)
      if (current?.category === null && result.category !== '导航站') {
        throw new Error(`Fixture item ${id} must report its judged category: ${JSON.stringify(result)}`)
      }
      if (current?.category != null && result.category !== undefined) {
        throw new Error(`Fixture item ${id} is already categorized; no category may be reported: ${JSON.stringify(result)}`)
      }
      const form = posted.get(id)
      if (form?.get('name') !== ' Example ' || form.get('comment')?.replaceAll('\r\n', '\n') !== 'First\nSecond') {
        throw new Error('The submitted form did not preserve the requested values.')
      }
      items = items.map(item => item.id === id ? { ...item, status: 'executed', publishStatus: 'live', publishedUrl: result.publicUrl } : item)
      return { itemStatus: 'executed', publishRecordId: id }
    },
    addBadge: async () => { throw new Error('unexpected badge') }, tagSource: async sourceId => ({ sourceId, attached: [] }),
  }
  await ctx.plugin(Supermanager, { baseUrl: site, token: 'fixture', requestTimeoutMs: 5000 })
  ctx.tools.register(defineContentToolFixture({ name: 'bash', description: 'Unused fixture shell', parameters: {}, execute: async () => { throw new Error('unexpected shell') } }))
  ctx.tools.register(defineContentToolFixture({ name: 'select_fixture_model', description: 'Select the fixture model.', parameters: {},
    execute: async (_args, execution) => {
      if (execution.agent === undefined) throw new Error('A fixture agent is required.')
      installModelSelection(execution.agent.ctx, { current: { provider: 'mock-selected', model: 'selected-model' }, assembled: undefined })
      return [{ type: 'text', text: 'Fixture model selected.' }]
    },
  }))
  ctx.skills.register({ name: 'publish-fixture', description: 'Publish fixture items.', source: 'runtime', content: 'FIXTURE_PUBLICATION_INSTRUCTIONS' })
  let parentStep = 0
  let manualPage: { page: string; browserId: string } | undefined
  const childSteps = new Map<number, number>()
  const response = (request: GenerateOptions): StreamChunk[] => {
    const block = request.messages.flatMap(message => message.content).find(block => block.type === 'text' && block.text.startsWith('{"item":'))
    if (block?.type !== 'text') {
      const step = parentStep++
      if (step === 0) return toolCallResponse('select-model', 'select_fixture_model', {})
      if (step < 3) return toolCallResponse(`skill-${step}`, 'skill', { name: 'publish-fixture' })
      if (unresolved && step === 3) return toolCallResponse('prior-claim', 'backlinks', { action: 'batch_claim', batchId: 176, itemIds: [1] })
      if (unresolved && step === 4) return toolCallResponse('prior-release', 'backlinks', { action: 'lease_release', leaseId: 900 })
      if (multiBrowser && step === 3) return toolCallResponse('publish', 'backlink_publish_many', {
        batches: [{ batchId: 176, browserId: 'playwright' }, { batchId: 177, browserId: 'isolated' }], scope: 'pending', mode: 'all',
      })
      if (step === 3 + (unresolved ? 2 : 0)) return toolCallResponse('publish', 'backlink_publish', { batchId: 176, scope: 'pending', mode: 'all' })
      if (step === 4 + (unresolved ? 2 : 0)) return toolCallResponse('summary', 'backlinks', { action: 'batch_get', batchId: 176 })
      if (manualRequired && step === 5) return toolCallResponse('retained-page', 'browser', { action: 'snapshot', ...manualPage })
      if (manualRequired) return textResponse('Item 1 needs manual login in its retained page; item 2 is published.')
      if (unresolved) return textResponse('Item 1 skipped for manual review; two other listings verified.')
      if (invalidProfile) return textResponse('Complete the website name and URL; two items remain untouched.')
      if (budget) return textResponse('Both item budgets reached; both outcomes saved.')
      return textResponse(quota ? 'Publication paused after QUOTA; two items remain pending.' : 'Two public fixture listings verified.')
    }
    if (request.provider !== 'mock-selected' || request.model !== 'selected-model') throw new Error('Publication inherited the stale model.')
    if (quota) return [{ type: 'finish', reason: { kind: 'error', failure: { code: 'QUOTA', message: 'private provider payload' } } }]
    const prompt = JSON.parse(block.text) as {
      item: BacklinkBatchItem
      leaseId: number
      anchors: { targetUrl: string }[]
      page: string
      browserId: string
    }
    const { item, leaseId } = prompt
    if (budget) return toolCallResponse(`budget-${item.id}`, 'backlinks', {
      action: 'item_result', itemId: item.id, leaseId, status: 'failed', failureMode: 'retryable', failureReason: 'Fixture site unavailable.',
    })
    const step = childSteps.get(item.id) ?? 0
    childSteps.set(item.id, step + 1)
    const frame = item.id === 2 ? 'frame(#outer)>>frame(#inner)>>' : ''
    const call = (name: string, args: object) => toolCallResponse(`item-${item.id}-${step}`, name, args)
    if (manualRequired && item.id === 1) {
      manualPage = { page: prompt.page, browserId: prompt.browserId }
      if (step === 0) return call('browser', { action: 'navigate', url: item.sourceUrl })
      if (step === 1) return call('backlinks', { action: 'item_result', itemId: item.id, leaseId,
        status: 'failed', failureMode: 'manual_required', failureReason: 'Complete login manually.' })
      return textResponse('Manual login required; page retained.')
    }
    const shellProbe = guardedTools && item.id === 1
    if (shellProbe && step === 0) return call('bash', { command: 'osascript -e \'tell application "Google Chrome" to activate\'' })
    if (shellProbe && step === 1) return call('browser', { action: 'bringToFront' })
    switch (step - (shellProbe ? 2 : 0)) {
      case 0: return call('browser', { action: 'navigate', url: item.sourceUrl })
      case 1: return call('browser', { action: 'snapshot', format: 'aria', selector: `${frame}role:form|Publish` })
      case 2: return call('browser', { action: 'fill', fields: [
        { selector: `${frame}label:Name`, value: ' Example ' }, { selector: `${frame}label:Comment`, value: 'First\nSecond' },
      ] })
      case 3: return call('browser', { action: 'snapshot', format: 'form', selector: `${frame}role:form|Publish` })
      case 4: return call('browser', { action: 'snapshot', format: 'links', selector: `${frame}body` })
      case 5: return call('browser', { action: 'click', selector: `${frame}role:button|Publish`, submission: true })
      case 6: return call('browser', { action: 'waitFor', selector: `${frame}text:Your submission is awaiting review.` })
      case 7: return call('backlinks', { action: 'item_result', itemId: item.id, leaseId, status: 'live',
        publicUrl: item.sourceUrl, targetUrl: prompt.anchors[0]!.targetUrl, anchorText: 'Site', evidence: 'Fresh public listing contains the target href.',
        verificationSelector: `${frame}body`,
        ...item.category === null ? { category: '导航站' } : {} })
      default: return textResponse('Live result saved.')
    }
  }
  ctx.llm.registerAdapter(['mock', 'mock-selected'], new MockAdapter(Array.from({ length: 30 }, () => response)))
}
