# Agent Note: Submit selected publish batches as one session request

Status: implemented

English | [中文](2026-09-05-backlinks-batch-selection.zh.md)

## Problem

Operators need to select multiple publish batches without repeatedly creating sessions. Polling the globally selected session after starting a connection can send a publish command into the previously selected conversation.

## Decision

The publish console submits selected batch ids as one descending, deduplicated user request. The store serializes submissions and awaits the workspace connection's returned session id before sending. The publishing skill remains responsible for execution; the browser owns selection and request admission only. The [console README](../../../../packages/client/ui-backlinks-console/README.md) defines selection and failure behavior.

## Alternatives considered

**One session per selected batch.** This creates competing execution contexts for a workflow that can share browser state. One ordered request gives the publishing skill one owner for coordinating the selected batches.

**Polling the current session after starting navigation.** Selection is not proof of connection completion. Awaiting the workspace operation provides the exact destination and propagates connection failures.

## Consequences

Selection survives failed admission, and duplicate clicks cannot submit concurrent requests. Successful admission does not prove publication finished or enforce execution order beyond the user instruction. The existing [backlinks capability decision](../architecture/2026-08-25-backlinks-capability-seam.md) continues to own provider and lease semantics.

## Verification

Store and component tests cover numeric ordering, selection across filtering and refresh, single-request admission, connection and send failures, and duplicate-click containment. The Web scenario boots the real Loader composition with local HTTP batch data and a no-op external-model adapter, checks rendered colors and selection snapshots, and observes the exact durable user message. It does not exercise external publication.
