# backlinks/ — Backlinks capability family

English | [中文](README.zh.md)

The backlinks seam and its provider/tool adapters. The `backlinks` package owns the Service Definition role: the abstract service (`ctx.backlinks`), two provider registries (batch work sources and mailboxes), the closed-union item-result vocabulary, and the `BacklinksError` taxonomy. `backlinks-supermanager` and `backlinks-cloud-mail` are the Service Providers. `tool-backlinks` is the Consumer: the model-facing `backlinks` tool. All **product** packages.

| Package | Role | ctx key |
|---|---|---|
| [`backlinks/`](backlinks/README.md) | Backlinks service and item-result vocabulary | `ctx.backlinks` |
| [`backlinks-supermanager/`](backlinks-supermanager/README.md) | Batch work-source provider (supermanager `/api/agent/*`) | registers on `ctx.backlinks` |
| [`backlinks-cloud-mail/`](backlinks-cloud-mail/README.md) | Mailbox provider (cloud-mail Open API) | registers on `ctx.backlinks` |
| [`tool-backlinks/`](tool-backlinks/README.md) | Model-facing `backlinks` tool | `ctx.tools` |

Model-visible names, schemas, and prompt guidance live only in `tool-backlinks`; swapping either backend never changes how the model drives the publish-batch workflow.
