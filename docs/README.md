# docs/

What each document is for. Read `../CLAUDE.md` first — it carries the
architectural rules that override anything here.

## Start here

| Doc | Why you'd open it |
| --- | --- |
| [`sprint-roadmap.md`](sprint-roadmap.md) | **Source of truth for sprint status.** What is done, what is live, what is planned. Start here to find which sprint is current, then read its scope file |
| [`decisions.md`](decisions.md) | 30 closed architectural decisions, numbered. "Do not revisit" — read before proposing a structural change |
| [`schema.md`](schema.md) | Every table, column, and RLS policy summary. The database reference |
| [`plan.md`](plan.md) | The product vision, roles, and core modules. Why the product is shaped this way |

## Current sprint scopes

Scopes for sprints that are live or planned. Finished ones move to
[`archive/sprint-scopes/`](archive/sprint-scopes/).

| Doc | Status |
| --- | --- |
| [`sprint-29-scope.md`](sprint-29-scope.md) | 🚧 In progress — Google login + Google Calendar conflict detection |
| [`sprint-30-scope.md`](sprint-30-scope.md) | 📝 Planned — revenue integrity: webhook spoofing, SaaS renewals, dunning, rate limiting |
| [`sprint-31-scope.md`](sprint-31-scope.md) | 📝 Partly done — WhatsApp production launch; includes the Meta ops runbook |
| [`sprint-32-scope.md`](sprint-32-scope.md) | ✅ M1–M3 shipped — support tickets, AI triage, recurring-bug detection |
| [`sprint-33-scope.md`](sprint-33-scope.md) | ✅ M1 shipped — Integration Hub: API keys, `/api/v1`, Make payment provider |

## Domain specs

Deep references for a single area of the product. Open the relevant one before
changing that area's logic.

| Doc | Covers |
| --- | --- |
| [`subscription-billing-spec.md`](subscription-billing-spec.md) | The billing domain in full: data model, lesson types, billing rules, what makes a subscription active |
| [`groups-spec.md`](groups-spec.md) | Student groups — and the three things "group" can mean (group of students, group lesson, group subscription) |
| [`student-card-spec.md`](student-card-spec.md) | The student side-drawer card |
| [`security.md`](security.md) | RLS spec, permissions matrix, exact policy definitions, JWT claims, booking JWT |
| [`ui-ux-context-brief.md`](ui-ux-context-brief.md) | Product context written for a UI/UX audience: surfaces, journeys, product map |

## Process

| Doc | When |
| --- | --- |
| [`migration-guide.md`](migration-guide.md) | Writing or promoting a migration (dev → staging → prod) |
| [`release-checklist.md`](release-checklist.md) | Deploying to production |
| [`qa-e2e-staging.md`](qa-e2e-staging.md) | The six staging E2E scenarios that gate a release (Decision #24) |
| [`data-recovery-playbook.md`](data-recovery-playbook.md) | Something went wrong with the data. Backups, full restore, and per-scenario manual fixes |
| [`post-launch-checklist.md`](post-launch-checklist.md) | Manual ops after go-live — cron registration and friends. Still has open items |

## Integrations and ops

| Doc | Covers |
| --- | --- |
| [`meta-app-review-submission.md`](meta-app-review-submission.md) | The Meta App Review runbook. Business verification passed; the review itself is not yet submitted |
| [`google-oauth-verification-submission.md`](google-oauth-verification-submission.md) | The Google OAuth verification runbook — login, Gmail and Calendar under one client. Not yet submitted; `gmail.send` is sensitive, so no CASA is needed |
| [`whatsapp-embedded-signup-manual-test.md`](whatsapp-embedded-signup-manual-test.md) | Manual E2E test of the Connect-WhatsApp flow |
| [`integrations-make-setup.md`](integrations-make-setup.md) | User-facing Hebrew setup guide for the `make` payment provider (the Grow API-fee workaround) |

## Audits

Point-in-time reports. Findings that turn into work belong in a sprint scope —
these stay as the record of what was found.

| Doc | Verdict |
| --- | --- |
| [`ux-audit-4-teacher-findings.md`](ux-audit-4-teacher-findings.md) | 27.08.2026, teacher shell — Conditional Pass, some Mediums still open |
| [`ux-audit-5-settings-integrations.md`](ux-audit-5-settings-integrations.md) | 29–30.08.2026, settings + integrations — **Fail**: 1 Critical, 6 High |
| [`ux-audit-5-visual-interaction.md`](ux-audit-5-visual-interaction.md) | 30.08.2026, visual + responsiveness + interaction — **Fail**: axe Serious on 5 pages |
| [`ux-audit-5-remediation.md`](ux-audit-5-remediation.md) | 04.09.2026 — the change log for both audit-5 docs. 9 of 13 Critical/High were already fixed; F5/F20/F12/F13 fixed here. Open: F1 (needs a product decision) |
| [`ux-audit-7-communications.md`](ux-audit-7-communications.md) | 03–04.09.2026, team ↔ parent communication — Conditional Pass; all findings closed |

## Marketing

| Doc | Covers |
| --- | --- |
| [`video-brand-script.md`](video-brand-script.md) | The 75-second brand video script. Films against the tenant from `scripts/seed-video-demo.ts` |

## archive/

History, kept for context, not for following.
[`archive/sprint-scopes/`](archive/sprint-scopes/) holds the scopes of sprints 1–28;
[`archive/ops/`](archive/ops/) holds one-off operational records. Anything in here
describes a past state of the product — do not treat it as current.

**Reading provenance comments in the code:** ~116 source files cite the scope they
were built from as `docs/sprint-<n>-scope.md`, by name rather than by location. Once
a sprint is archived that path no longer resolves — look for the file under
`docs/archive/sprint-scopes/`.
