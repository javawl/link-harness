---
description: "The backlinks providers' settings pages on the dsh web client's Plugins page: the supermanager batch source and the cloud-mail verification mailbox, each with its endpoint and agent token."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-backlinks

English | [中文](README.zh.md)

## Summary

Open **Plugins** in the sidebar and select **Supermanager** or **Cloud-mail** in the group of backlinks providers to set each provider's endpoint and agent token. The pages stage what is typed and write it only on save; the token is a section secret whose literal never rides a response, so its control starts blank and only reports whether one is configured. Each page exists while the Host serves its provider's namespace (`backlinks-supermanager` / `backlinks-cloud-mail`).

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

The **Supermanager** and **Cloud-mail** cards open the two provider pages. **Backend endpoint** / **API endpoint** renders the effective value, carries an **Overridden** badge with **Reset to default** once overridden, and saves as a reset when emptied. The token control starts blank on every load and reports only whether a token is configured; a blank draft keeps the stored token. Nothing is written until **Save**; leaving the page drops the drafts.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The Host half is an empty `apply`, present only so the package holds a Loader row the client module system serves the browser half for. The browser half binds each provider's namespace through `ctx.configForms.get` and keeps the staged form in `BacklinksCardController` over the shared `SettingsFormModel` of `ui-primitives`; the two providers share one controller class and one renderer, pinned to their own locale keys by the wrapper components. The token is the form's one secret control: its write goes back into the section through the form's revision-fenced mutate, and the configured badge derives from the shared describe mirror's secret slots, because the redacted response could never answer a read-back. Each page registers its card into the Plugins page's `plugins.item` slot through `ctx.configForms.whileServed`.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [ui-plugin-manager](../ui-plugin-manager/README.md) — the Plugins page and the `plugins.item` slot the pages register into.
- [ui-settings](../ui-settings/README.md) — the settings forms and the served-namespace watch the pages ride.
- [ui-primitives](../ui-primitives/README.md) — the settings form model and fields the pages render.
- [backlinks-supermanager](../../backlinks/backlinks-supermanager/README.md) — the batch-source provider that registers the namespace.
- [backlinks-cloud-mail](../../backlinks/backlinks-cloud-mail/README.md) — the mailbox provider that registers the namespace.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is a browser-side settings surface that registers no model surface.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **One shared dictionary namespace** — both provider pages read `settings.backlinks`; splitting them would only be needed if their copy ever diverges beyond the shared form frame.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
