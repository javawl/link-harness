# Agent Note: backlinks discipline delivery — the subagent prompt is the only channel executors read

Status: implemented

English | [中文](2026-09-03-backlinks-discipline-delivery-channel.zh.md)

## Problem

Batch 310 exposed a delivery failure, not a guidance failure. The main session loaded the updated SKILL.md, but the browser-driving work happens in parallel subagents spawned from the step-4b compressed prompt — and session logs show none of the three children ever loaded the skill body (the SKILL.md title phrase appears zero times) or any playbook. Every rule that lived only in SKILL.md's per-item loop or in the playbooks — the lazy-load probe sequence, the fixed skip wording, the body-link formats, the `role:link` verification — never reached the executors. Children improvised skip reasons ("静态博文，无评论区…" variants, never the fixed phrase), and an earlier run typed a literal `<a href=…>` into the Wix blog comment box — a contenteditable rich editor — which published as plain text on pullcommunityoutreach.org. That escaped comment then froze the item: the duplicate guard's string match saw the target URL inside the raw text and wrote back skipped-as-published, so the site's own broken comment blocked republishing. A second 310 run confirmed delivery worked but exposed the template's own trap: its line "CAPTCHA/登录墙回写 manual_required" taught children to park every Wix member-login wall as manual (~30 items) instead of registering with a disposable mailbox — the previous, undelivered-template run had registered freely — and the single registration attempt failed on a missing `domain` argument the children had no way to know.

## Decision

Discipline rides the channel executors actually receive ([`SKILL.md`](../../../../examples/backlink-agent/skills/backlink-publish/SKILL.md)):

1. The step-4b subagent prompt template carries the four hard rules inline — the probe sequence with the fixed skip wording, link-carrying by box type (Website field / contenteditable editor's link button / plain-text `<a>` direct-write / BBCode), verification plus duplicate detection by `role:link`, and self-registration through `mailbox_create` (both `localPart` and `domain`=screwdom.org) before any login requirement is called manual. A login wall with an email sign-up form is a normal flow, not a manual event; only human-verification walls (reCAPTCHA), unavailable social OAuth, or rejected registrations park as `manual_required`. The template states the reason: children do not load skill files.
2. The per-item loop itself inlines the same condensed rules (recon step 3, fill step 6, verify step 7); playbooks remain extended reference and never the only home of a load-bearing rule.
3. Link-carrying by box type replaces "direct-write HTML by default": a contenteditable editor or a toolbar means typed `<a>` markup renders as literal text — the anchor must go in through the toolbar link button. True plain-text boxes take `<a>` direct-write. The Wix precedent table splits by surface (discussion-post composer accepts `<a>`; the blog comment box requires the link button), with pullcommunityoutreach as the counter-evidence and v7cztusuh's rendered link on the same site as the positive one.
4. Verification and duplicate detection count only a clickable link (`role:link` with the anchor text or pointing at the target URL); a bare URL string — including escaped `<a>` text — proves nothing. An executor's own escaped comment therefore does not freeze the item as published. evidence.md carries the same standard.

## Alternatives considered

- **Make subagents load the skill before executing** — the template already said "严格按 backlink-publish 技能的单条目循环执行" and none did; relying on voluntary file reads is the failure being fixed.
- **Auto-inline the whole skill into child prompts** — the SKILL.md body is far larger than the three rules that matter per item; the template would drown the lease and idempotency instructions.
- **Keep rules in playbooks and link them from the template** — a link the child may not follow is the same dead channel; only text physically inside the prompt is guaranteed delivered.

## Consequences

- Every executor now receives the probe, link-carrying, and verification rules verbatim, whatever it chooses to read afterwards; the fixed skip wording makes lazy-load-class skips aggregatable.
- The template grew by the four-rule block — the one prompt cost of guaranteed delivery.
- An escaped comment no longer masquerades as success or as an existing backlink; it writes back `failed + manual_required` and leaves the item recoverable.
- Delivery is still prompt-borne: a model ignoring the inline rules can misbehave, and the playbook corpus stays unpinned by tests. Resetting batch 310's mis-skipped items and re-running is the live check.
