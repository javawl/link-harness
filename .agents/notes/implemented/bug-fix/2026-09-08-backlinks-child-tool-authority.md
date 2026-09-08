# Agent Note: Publication child tool schemas and authority

Status: implemented

English | [中文](2026-09-08-backlinks-child-tool-authority.zh.md)

## Problem

The schema sent to a model must describe the arguments accepted by its executor. A resolved tool definition already contains JSON Schema; adding compact parameter declarations at its root hides those fields from schema-aware callers. A model may still infer a boolean from prose, so scripted calls with valid booleans do not detect the broken declaration. A general shell also allows external writes outside browser submission tracking, making a recorded failure insufficient evidence that a site received nothing.

## Decision

The [publisher](../../../../packages/backlinks/tool-backlinks/src/publisher.ts) extends each child's browser and backlinks schemas inside properties, retaining inherited fields without mutating global definitions. submission is a boolean; receipt and verificationSelector are strings. The existing execution checks retain the single final submission and result-verification rules.

Publication children expose only browser and backlinks through the native tool restriction. Bash is absent from model tools and denied before execution even when a global shell is registered. Upload files must be prepared before publishing. This replaces the shell allowance in [request budgets](2026-09-05-backlinks-request-budgets.md); its request accounting and native lifecycle remain active. [Publication checkpoints](2026-09-07-backlinks-publication-checkpoints.md) still own durable attempts, outcome reconciliation and unknown-result retention.

## Alternatives considered

**Coerce string booleans or switch models.** Either can conceal malformed declarations without repairing receipt fields or the schema consumed by other callers. The declared JSON types and executor checks remain aligned instead.

**Filter shell commands for POST requests.** Arbitrary scripts, libraries and encodings can perform writes without a recognizable command substring. Removing the shell capability closes this alternate submission path without claiming to parse arbitrary programs safely.

**Raise per-item budgets.** More requests cannot repair missing parameter declarations and allow repeated rejected actions to consume more work.

## Consequences

Models receive complete publication parameters, and external publication stays inside the assigned browser workflow. Children cannot download or transform local assets through a shell; those files require preparation outside publication. Purpose flags still cannot identify every implicit write performed by site scripts. Historical failed attempts require outcome review before any new publication authorization.

The [publisher regressions](../../../../packages/backlinks/tool-backlinks/tests/publisher.spec.ts) inspect actual model requests, retain global schemas, reject string flags and prove shell denial before its registered body runs. The [Loader/Chrome scenario](../../../../examples/backlink-agent/tests/publisher.snapshot.ts) validates persisted request schemas, records a denied Bash call, and verifies actual local form submissions. Scripted model responses do not establish production model compliance or third-party acceptance.
