---
description: "Package map for the backlinks capability family: the batch-source and mailbox seam, its provider backends, the console Remote, and the model-facing tool."
kind: "package-group"
---

# backlinks/ — Backlinks capability family

English | [中文](README.zh.md)

<a id="summary"></a>
## Summary

The backlinks seam and its provider/tool adapters. The `backlinks` package owns the Service Definition role: the abstract service (`ctx.backlinks`), two provider registries (batch work sources and mailboxes), the closed-union item-result vocabulary, and the `BacklinksError` taxonomy. `backlinks-supermanager` and `backlinks-cloud-mail` are the Service Providers. `tool-backlinks` is the Consumer: the model-facing `backlinks` tool. All **product** packages.

<a id="table-of-contents"></a>
## Table of Contents

- [Related documentation](#related-documentation)
- [Packages](#packages)

-----

<a id="related-documentation"></a>
## Related documentation

- [Backlinks subsystem](../../docs/subsystems/backlinks.md) — the exhaustive vocabulary and contracts of the batch-source and mailbox seam.

-----

<a id="packages"></a>
## Packages

| Package | Role | ctx key |
|---|---|---|
| [`backlinks/`](backlinks/README.md) | Backlinks service and item-result vocabulary | `ctx.backlinks` |
| [`backlinks-supermanager/`](backlinks-supermanager/README.md) | Batch work-source provider (supermanager `/api/agent/*`) | registers on `ctx.backlinks` |
| [`backlinks-cloud-mail/`](backlinks-cloud-mail/README.md) | Mailbox provider (cloud-mail Open API) | registers on `ctx.backlinks` |
| [`tool-backlinks/`](tool-backlinks/README.md) | Model-facing `backlinks` tool | `ctx.tools` |

Model-visible names, schemas, and prompt guidance live only in `tool-backlinks`; swapping either backend never changes how the model drives the publish-batch workflow.

-----

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
