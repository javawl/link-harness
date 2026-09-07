# Agent Note: Publishing discipline must reach each executor

Status: implemented

English | [中文](2026-09-03-backlinks-discipline-delivery-channel.zh.md)

## Problem

Batch 310 exposed a delivery failure, not a guidance failure. The main session loaded the updated SKILL.md, but the browser-driving work happens in parallel subagents spawned from the step-4b compressed prompt — and session logs show none of the three children ever loaded the skill body (the SKILL.md title phrase appears zero times) or any playbook. Every rule that lived only in SKILL.md's per-item loop or in the playbooks — the lazy-load probe sequence, the fixed skip wording, the body-link formats, the `role:link` verification — never reached the executors. Children improvised skip reasons ("静态博文，无评论区…" variants, never the fixed phrase), and an earlier run typed a literal `<a href=…>` into the Wix blog comment box — a contenteditable rich editor — which published as plain text on pullcommunityoutreach.org. That escaped comment then froze the item: the duplicate guard's string match saw the target URL inside the raw text and wrote back skipped-as-published, so the site's own broken comment blocked republishing. A second 310 run confirmed delivery worked but exposed the template's own trap: its line "CAPTCHA/登录墙回写 manual_required" taught children to park every Wix member-login wall as manual (~30 items) instead of registering with a disposable mailbox — the previous, undelivered-template run had registered freely — and the single registration attempt failed on a missing `domain` argument the children had no way to know.

## Decision

Required publishing discipline is installed as the child persona from the [deployment configuration](../../../../examples/backlink-agent/cordis.yml). The parent [skill](../../../../examples/backlink-agent/skills/backlink-publish/SKILL.md) coordinates batch selection; it does not copy rules into per-item prompts. Children receive the probe sequence, link-format rules, href verification and mailbox registration instructions before their first model request. Playbooks remain extended references, never the sole delivery path for a required rule.

A login wall offering email signup is a registration flow. Only human-verification walls, unavailable social OAuth or rejected registration require manual handling. Rich text requires the editor's link control; escaped anchor markup and bare URL text do not prove publication. The publisher verifies actual hrefs and quoted receipts through the [execution and budget mechanism](2026-09-05-backlinks-request-budgets.md).

## Alternatives considered

- **Make subagents load the skill before executing** — the template already said "严格按 backlink-publish 技能的单条目循环执行" and none did; relying on voluntary file reads is the failure being fixed.
- **Auto-inline the whole skill into child prompts** — the SKILL.md body is far larger than the three rules that matter per item; the template would drown the lease and idempotency instructions.
- **Keep rules in playbooks and link them from the template** — a link the child may not follow is the same dead channel; only text physically inside the prompt is guaranteed delivered.

## Consequences

Every executor receives fixed discipline independently of voluntary file reads. The parent carries batch selection only, while child data follows a stable persona and tool schema prefix. Escaped comments do not establish a verified backlink. Purpose declarations and prose still depend on model judgment; href and receipt presence checks do not prove the site's approval semantics. The [real-browser scenario](../../../../examples/backlink-agent/tests/publisher.snapshot.ts) checks instruction delivery and the executable verification path without claiming live-site success.
