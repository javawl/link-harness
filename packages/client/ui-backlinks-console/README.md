# @deepseek-ai/dsh-client-ui-backlinks-console

English | [中文](README.zh.md)

The Web sidebar's publishing panel lists batches, expands item details, and starts a publishing session. Reads use the [backlinks console Remote](../../backlinks/console/README.md); the [backlink agent](../../../examples/backlink-agent/README.md) owns publication, verification and result reporting.

The browser plugin requires the slots, locale, sessions, workspaces and `remote.backlinksConsole` services. Its host entry registers no behavior. Refresh updates batch counts; expanding a batch loads its details. Publish creates a fresh session and sends the publishing command after the conversation connects.

## Model Experience

### Publication command

#### What the model sees

Clicking Publish sends `/backlink-publish <batchId>` as one user message in a fresh session. The selected skill and deployment own all subsequent instructions and tools.

#### Token effect

Listing or expanding batches makes no model request. Publish starts one ordinary conversation; its execution cost belongs to the selected agent.

#### KV Cache effect

The panel adds no system prompt or tool schema. Publication starts with the new session's configured request prefix.

## Known Limitations and Deferred Work

- Publishing starts a new session; it does not resume a blocked publishing session.
- Batch refresh reads backend state rather than subscribing to item progress events.
