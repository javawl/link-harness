# Publish batch console

English | [中文](README.zh.md)

The Web sidebar's Publish Batches tab reads batch summaries and details through `backlinksConsole`. It requires the backlinks console Host plugin and a configured batch provider.

## Selection and submission

Batches sort by numeric id descending on every refresh. Each top-level row has a checkbox independent of its detail disclosure. Select visible applies to the current search results; hidden selections remain selected. Refresh removes selections whose batches disappeared. Expanded items display `executed` in green, `failed` in red, and other statuses in muted text.

Publish selected sends one request containing the selected ids in descending order into the current session's workspace, falling back to the recent workspace. Submission awaits `connectWorkspace()` and sends to that returned blank session. All publish and selection controls are disabled until submission settles. Success opens the receiving session and clears the submitted selection; a failure retains the selection and displays the error. Single-row Publish uses the same submission path.

## Model Experience

### User-request submission

#### What the model sees

A single batch sends `/backlink-publish <id>`. Multiple batches send `/backlink-publish <ids>`, with unique space-separated ids in descending order, followed by a newline and `请按以上批次号顺序依次发布，仅处理这些批次。`. The conversation service submits this as one ordinary user message.

#### Token effect

The request adds the command, selected ids, and conditional multi-batch sentence to the receiving session. Listing, filtering, selection, and refresh make no model requests.

#### KV Cache effect

Submission appends a user message to the receiving blank session without replacing an existing conversation's messages. Different ids change that message's tokens; provider cache availability remains provider-owned.

## Known Limitations and Deferred Work

- Submission acknowledgment means Harness accepted the request, not that external publication completed. The publishing skill owns execution, confirmations, and result reporting. Selection is local to the current browser plugin instance.
