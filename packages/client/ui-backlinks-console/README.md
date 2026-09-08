# Publish batch console

English | [中文](README.zh.md)

The Web sidebar's Publish Batches tab reads batch summaries and details through the [backlinks console Remote](../../backlinks/console/README.md). The browser plugin requires slots, locale, sessions, workspaces and `remote.backlinksConsole`, backed by a configured batch provider; its host entry registers no behavior. The [backlink agent](../../../examples/backlink-agent/README.md) owns publication, verification and result reporting.

## Selection and submission

Batches sort by numeric id descending on every refresh. Rows show the batch id, website, status counts and a Publish button. Batch selection and Publish selected remain available in both modes. Enable Concurrent beside Add / connect browser to show browser assignment and binding controls. Turning it off hides only those controls while preserving selections and browser choices. Each selection checkbox is independent of its detail disclosure. Select visible applies to the current search results; hidden selections remain selected. Refresh removes selections whose batches disappeared. Expanded items display `executed` in green, `failed` in red, and other statuses in muted text.

Publish selected sends one request containing the selected ids in descending order into the current session's workspace, falling back to the recent workspace. Submission awaits `connectWorkspace()` and sends to that returned blank session. All publish and selection controls are disabled until submission settles. Success opens the receiving session and clears the submitted selection; a failure retains the selection and displays the error. Single-row Publish uses the same submission path.

The add/connect form persists a separate browser profile or an existing local Chrome/Edge debugging endpoint. Each batch offers a browser override; Bind website saves it as the default for all batches of that website, while Unbind clears the default. Overrides apply only to the submitted request. A single batch with a chosen browser includes its assignment and uses `backlink_publish`; multiple batches use `backlink_publish_many`, allowing different browsers to publish together. Removed bindings are shown as errors and never silently replaced by another browser.

## Model Experience

### User-request submission

#### What the model sees

A single batch sends `/backlink-publish <id>`. Multiple batches send `/backlink-publish <ids>`, with unique space-separated ids in descending order, followed by the selected browser assignments as JSON and instructions to use `backlink_publish_many`. The conversation service submits this as one ordinary user message.

#### Token effect

The request adds the command, selected ids, and conditional multi-batch sentence to the receiving session. Listing, filtering, selection, and refresh make no model requests.

#### KV Cache effect

Submission appends a user message to the receiving blank session without replacing an existing conversation's messages. Different ids change that message's tokens; provider cache availability remains provider-owned.

## Known Limitations and Deferred Work

- Submission acknowledgment means Harness accepted the request, not that external publication completed. The publishing skill owns execution, confirmations, and result reporting. Concurrent mode and selection survive sidebar remounts within the current browser plugin instance.
- Publishing starts a new session; it does not resume a blocked publishing session.
- Batch refresh reads backend state rather than subscribing to item progress events.
