# @deepseek-ai/dsh-backlinks-console

English | [中文](README.zh.md)

Read-only Typert Remote service for the Web publishing console. Mount it with `dsh-backlinks`; its methods use that service's configured batch provider and error handling.

## Methods

`batches()` returns every batch summary in descending batch-id order. New batches stay at the top even when copied from an older publishing plan; the provider's original array and planned dates remain intact. `batch(batchId)` returns the provider's full detail for one batch.

## Model Experience

None, as this read-only Remote supplies UI data and registers no model prompt or tool schema.

#### KV Cache effect

None; console ordering does not change model requests.

## Known Limitations and Deferred Work

- No pushed batch updates: clients refresh through these read methods. Published records and lease ownership remain the backend's authority.
