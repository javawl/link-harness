# Agent Note: backlinks comment-body link — embedding the anchor without a Website field

Status: implemented

English | [中文](2026-09-02-backlinks-comment-body-link.zh.md)

## Problem

The blog-comment playbook carried the target link on exactly one surface: the comment form's Website field. Wix-style comment widgets have no such field — a single body input with a member login — so those sites had no codified route to a link. Past the login wall the executor improvised the body-embedded anchor with no discipline on format, link count, or verification. Worse, the generic live standard ("the public page's text contains the target URL or anchor text") false-positives on escaped HTML: a comment whose `<a href=…>` rendered as plain text still passes a text search, so an ineffective link could be written back as `live`.

## Decision

`playbook-blog.md` branches the link mechanism on the surveyed form shape ([`examples/backlink-agent`](../../../../examples/backlink-agent/skills/backlink-publish/references/playbooks/playbook-blog.md)). A form with a Website field keeps the existing behavior — the link goes in the field, the body carries no link. A single-body-input comment area follows the body-embedded-link section:

1. Input format is chosen by box type: a true plain-text box takes `<a href="targetUrl">anchorText</a>` direct-write; a contenteditable rich editor or a toolbar box must carry the anchor through the toolbar link button, because typed markup renders as literal text (pullcommunityoutreach evidence). Either way the anchor is woven into 2-3 genuine opinion sentences, exactly one link per comment. Bare URLs are off by default (splendorsinglesministry renders them as plain text) and are allowed only where the site provably auto-links them.
2. A platform-precedent table gates the format without per-site recon, split by surface: the Wix group-discussion post composer accepts `<a>` direct-write (a rendered anchor on splendorsinglesministry); the Wix blog comment box is a contenteditable editor that escapes typed markup and requires the toolbar link button (pullcommunityoutreach escaped text; v7cztusuh's rendered link on the same site). Unknown platforms still require one of three per-site signals before submitting (an already-live clickable link in the comments — `role:link` in the aria snapshot; a rich-text toolbar link button; an explicit HTML-allowed hint); with none, the item writes back `skipped` ("no Website field and no body-link precedent — no route to carry the target link") and no probe comment is posted: under the one-final-submission iron rule, a link-less comment is pure noise.
3. Forum-style boxes take BBCode `[url=targetUrl]anchorText[/url]` instead, when the site shows BBCode precedent or a formatting hint. Group-discussion post bodies (Wix groups and the like) follow the same body-embed rules via the forum playbook.
4. Verification is stricter than the generic live standard: the aria snapshot must show `role:link` with the anchor text in the comment body. Escaped `<a href=…>` plain text writes back `failed + manual_required` (a human can edit the posted comment), never an automatic second submission; the failure reason names the platform so the precedent table can be corrected.

## Alternatives considered

- **Probe with an HTML comment, then fix if it escapes** — violates the one-final-submission iron rule; the escaped probe is a posted noise comment and the item's single shot is spent.
- **Require per-site evidence on every platform** — Wix-class sites dominate comment backlink batches and now carry verified platform-level precedent; demanding per-site signals there re-spends recon on every item for no new information. The table keeps the per-site bar only where it discriminates.
- **Also codify markdown `[text](url)` input** — no evidence any target comment box renders markdown; the branch would codify speculation. Revisit when a real site shows it.
- **Tighten the generic live-evidence rule to require `role:link` everywhere** — the escaped-HTML false positive exists only for body-embedded links; the shared standard stays as is and the stricter check lives in this playbook.
- **Keep treating member-login widgets as `manual_required`** — the login decision tree already passes Google-OAuth and disposable-email sites automatically; blanket-parking them keeps viable sites out of automation.

## Consequences

- Comment areas without a Website field become publishable when platform or per-site evidence exists, and cost one recon plus an honest `skipped` when it does not — no more improvised noise comments.
- The precedent table grows with each verified platform; a platform wrongly listed is corrected through the `failed + manual_required` write-back naming it.
- An escaped-HTML comment is reported as `failed + manual_required` instead of a false `live`; publish records stay honest and the human owns the in-browser edit.
- The rule is skill guidance carried by prompt text; no test pins the playbook corpus today (no test references playbook files), so the enforcement bounds remain the backend lease, the claim rules, and the model following the skill.

## Related

Delivery of these rules to parallel subagents is owned by [discipline-delivery-channel](../bug-fix/2026-09-03-backlinks-discipline-delivery-channel.md); the comment-area recon sequence by [comment-lazy-load-recon](../bug-fix/2026-09-03-backlinks-comment-lazy-load-recon.md).
