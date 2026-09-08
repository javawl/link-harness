# @deepseek-ai/dsh-backlinks-console

English | [中文](README.zh.md)

Typert Remote service for the Web publishing console. Mount it with `dsh-backlinks`; its methods use that service's configured batch provider and error handling.

## Methods

`batches()` returns every batch summary in descending batch-id order. New batches stay at the top even when copied from an older publishing plan; the provider's original array and planned dates remain intact. `batch(batchId)` returns the provider's full detail for one batch.

`browsers()` returns browser choices and persisted website bindings. `bindBrowser(websiteId, browserId)` validates references before saving or clearing a default. `addBrowser(id, kind, location)` adds a dedicated profile directory or local CDP connection through the Playwright settings section; its revision check prevents concurrent additions from overwriting each other. Configuration writes require the corresponding provider and settings service and do not launch browsers or publish external content.

## Model Experience

None, as this Remote supplies UI data and registers no model prompt or tool schema.

#### KV Cache effect

None; console ordering does not change model requests.

## Known Limitations and Deferred Work

- No pushed batch updates: clients refresh through these read methods. Published records and lease ownership remain the backend's authority.
