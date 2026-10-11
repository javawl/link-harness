---
description: "Read-only Remote face over the backlinks seam for the Web console."
kind: "package-reference"
---

# @deepseek-ai/dsh-backlinks-console

English | [中文](README.zh.md)

## Summary

The Host half of the Web publish console: a Typert Remote that exposes the backlinks seam's batch listing and batch detail to the browser. The console renders from these reads; publishing itself opens a fresh Session and never rides this Remote. The plugin mounts over any composition that serves `ctx.backlinks`.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The Web client's publish console calls `batches()` for the listing with per-status counts and the executing flag, and `batch(batchId)` for one batch's website, anchors, and items. Both forward to the selected batch work source and surface seam failures unchanged; nothing here writes, launches, or publishes.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

One `TypertRemoteService` subclass (`BacklinksConsoleRuntime`) with `inject: ['backlinks']` and two read methods that call `ctx.backlinks.listBatches` / `getBatch`. The api-remotes bundle mounts the namespace; the browser half of `dsh-client-ui-backlinks-console` renders it.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [backlinks](../backlinks/README.md) — the seam whose reads this Remote projects.
- [ui-backlinks-console](../../client/ui-backlinks-console/README.md) — the Web panel that renders these reads and submits publishes into fresh Sessions.
- [api-remotes](../../api/remotes/README.md) — the Remote gateway that mounts the namespace.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is a browser-facing Remote projection that registers no model surface.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Read-only by design** — item results, leases, and badges ride the model-facing `backlinks` tool inside a Session; adding writes here would bypass the publish discipline.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
