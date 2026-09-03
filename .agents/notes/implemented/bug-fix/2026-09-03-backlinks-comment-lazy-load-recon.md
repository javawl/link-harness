# Agent Note: backlinks comment-area lazy-load recon — never conclude absence from one snapshot

Status: implemented

English | [中文](2026-09-03-backlinks-comment-lazy-load-recon.zh.md)

## Problem

Batch 281 (comment-backlink heavy) skipped most items with the improvised reason "静态博文页面，无公开评论区或外链提交入口" — a phrase with no origin in the skill. Recon took a single aria snapshot immediately after `navigate`. Comment widgets (Disqus, Wix, Blogger iframes, Facebook plugins, giscus) mount after the article body — asynchronously or on viewport approach — so the comment area is routinely absent from the first snapshot, and the model concluded the page had none. The only wait guidance in the skill lived in the verification and pacing references; recon had none.

## Decision

Concluding "no comment area" requires a completed probe sequence, and the SKILL.md recon step inlines it verbatim — batch 310 showed parallel children never load the skill body or playbooks, so the sequence also rides the step-4b subagent prompt template ([discipline delivery](2026-09-03-backlinks-discipline-delivery-channel.md)); playbook-blog.md keeps the extended version. The sequence: `waitFor` common comment anchors (`#comments`, `#respond`, `#commentform`, `[id*='comment']`, `iframe`) or 3-5 seconds before re-snapshotting; `press` End/PageDown to reach the page bottom and re-snapshot (mounting is often viewport-triggered); click any "Load comments"-style affordance and re-snapshot; treat an iframe in the aria snapshot as a lazily mounted comment area and address it with the `frame()` prefix; fall back to navigating to `URL#comments`. Only after the full sequence may the item write back `skipped`, with the fixed reason "评论区延迟加载探测后仍不存在" — the fixed wording forbids one-line "static page" verdicts and makes skip reasons aggregatable.

## Alternatives considered

- **Always wait a fixed interval after `navigate` before any snapshot** — taxes every site for a failure mode concentrated in comment widgets; the sequence waits only when the target region is missing from the first snapshot.
- **Auto-wait at the browser seam (waitUntil networkidle)** — lazy widgets often mount on scroll, which no load-state covers; scrolling is an agent decision, not a provider default. The seam already has `waitFor`; the gap was skill guidance, not capability.
- **Treat comment-area absence as `failed + retryable`** — after probing, absence is usually a true dead end, and `skipped` keeps the honest distinction between "no route" and "transient error".

## Consequences

- Comment items cost one probe sequence before any skip; lazily mounted comment areas become reachable instead of silently dropped.
- The fixed skip reason makes a recurring "probed, still absent" population visible in batch summaries, auditable for real dead ends.
- The rule is prompt-borne guidance that reaches every executor through the template; a model ignoring it can still mis-skip. Resetting the mis-skipped items and re-running is the live check.
