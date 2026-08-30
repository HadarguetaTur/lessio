# Sprint 32 — Customer Support System

**Status:** ✅ M1–M3 shipped (migrations live in production), M4 optional
**Depends on:** none (independent of the WhatsApp launch track in Sprint 31)
**Source:** Support architecture session, 2026-08-26

**Goal:** A support stack that scales past a solo founder answering WhatsApp messages
by hand — customers reach us in-product, tickets are triaged automatically, and
production errors that repeat turn themselves into dev issues without anyone
noticing them first.

---

## Closed Decisions

- **Two intake channels, one table.** The in-app widget (M1) and the WhatsApp
  staff menu (M2) both write `support_tickets` with a different `source`. Nothing
  downstream branches on channel.
- **Audience is owners + admins only.** Teachers and parents escalate to their own
  org's owner, not to us. This is also what keeps our queue survivable.
- **Support is never plan-gated.** No `saasFeature`, no `requireFeature`. An org in
  `read_only` billing status is exactly the org that needs to reach us.
- **In-app notification is the only reply channel in M1.** WhatsApp outside the 24h
  window needs a Meta-approved template (approval latency, byte-identical Deno
  mirror); platform email has no sender — `sendEmail` is per-org Gmail-first. Both
  are deferred rather than half-built.
- **Tickets never live in `in_app_notifications`.** The `notification-cleanup` cron
  deletes rows older than 30 days. Notifications carry an `action_url` pointer only.
- **Recurring-bug detection reads our own `error_events` table, not the Sentry API**
  (M3). No external token to rotate, one SQL group-by drives detection, and the
  GitHub issue body is assembled from rows we control. Sentry stays for stack-level
  debugging; dev issues link out to it.
- **Statuses are text + CHECK, not enums** — house convention, and widening a CHECK
  is a one-line migration.

---

## M1 — Ticket core ✅ (shipped)

Migration `20260827090000_support_tickets.sql`: `support_tickets` +
`support_ticket_messages`, deny-all RLS, `update_updated_at()` trigger, partial
status index for the operator queue.

- `src/lib/support/tickets.ts` (+ tests) — `createTicket`, `addMessage`,
  `listTicketsForOrg`, `getTicketWithMessages`, `setStatus`,
  `countRecentTicketsForOrg`.
- `src/components/dashboard/SupportWidget.tsx` — floating help pill (z-40, clear of
  `MobileAdminQuickSheet` at z-30) + sheet with a category picker, subject, and
  description. Mounted in `src/app/(dashboard)/layout.tsx` for owners/admins,
  deliberately **not** in the support-mode branch.
- `/support` + `/support/[ticketId]` — the customer's own list and thread. Real
  pages, not sheet-only, because `NotificationBell` needs a stable `action_url`.
  Not in the sidebar: reachable from the widget and from notifications.
- `/admin/support` + `/admin/support/[ticketId]` — operator queue (default filter:
  everything unfinished, oldest first) and thread with reply + status controls.
- Rate limit: 10 tickets per org per 24h, counted in the action. Fails **open** —
  a counting failure must never block a customer from reaching us.
- Notification types added: `support_ticket_new` and `support_ticket_activity`
  (platform-level, `organization_id IS NULL`), `support_ticket_reply` and
  `support_ticket_resolved` (to the org's owners+admins, titled in the org's
  `default_locale` per the day-off precedent).

**Not in M1:** attachments/screenshots (M2), AI triage (M2), WhatsApp intake (M2).

---

## M2 — WhatsApp intake + AI triage ✅ (shipped)

Migration `20260827100000_support_sessions.sql`.

- `src/lib/support/supportSessions.ts` (+ tests) — `(org, phone)` unique, read-time
  expiry, explicit `step` (the cancellation flow needs none because it is exactly
  two turns; this is three).
- `menu.ts` / `strings.ts` — `support` is the staff menu's 4th row, he+en bot
  strings. The whole flow stays inside the 24h window, so no Meta template.
- `handlers/staff.ts` — tap → prompt → describe → confirm buttons → ticket.
  Dispatch order is load-bearing and covered by tests: confirmation buttons, then
  the menu tap, then free text belonging to an open session. Any *other* menu tap
  abandons the request rather than being read as its description.
- `src/lib/support/classify.ts` (+ tests) — category + severity on every ticket
  regardless of source, on the **platform** OpenAI key. Never throws, and
  deliberately does not call `logAiUsage`: those rows are org-scoped and feed the
  tenant's own usage reporting, so logging our triage there would bill a customer
  for our internal tooling.

**Deferred from M2:** screenshot attachments (bucket + upload UI) and the
self-service KB answer. Neither is load-bearing for the intake loop.

---

## M2 — design for the deferred parts

The rest of the M2 plan shipped as described above; only these two remain.

### Screenshot attachments
`support_ticket_attachments` + a private `support-attachments` storage bucket
(precedent: `20260629120000_student_exams_progress_reports.sql`). Path
`<orgId>/<ticketId>/<uuid>`, service-role upload, signed URLs for viewing.

### Self-service (widget only in v1)
- Knowledge base as curated markdown in the repo (`docs/support-kb/{he,en}/*.md`),
  loaded module-level and capped in the prompt. Versioned with the product; add a
  CLAUDE.md note to update it when shipping features.
- "Question" category → AI answer in the sheet + "did this help?". A no (or an AI
  that declines) files the ticket with an `ai`-authored message showing what was
  already tried, so the operator never repeats it.

---

## M3 — Error telemetry + recurring-bug detection ✅ (shipped)

Migration `20260827110000_error_events_dev_issues.sql`.

- `src/lib/telemetry/fingerprint.ts` (+ 13 tests) — sha256 of name + normalized
  message + normalized route. The digest is deliberately **excluded**: Next
  regenerates it per build, so folding it in would split one long-lived bug into
  a fresh group on every deploy and the threshold would never trip.
- `reportError.ts` / `reportClientError.ts` — never throw, truncate stacks at 8k.
- `instrumentation.ts` — `onRequestError` now writes the feed as well as Sentry.
- `src/app/global-error.tsx` — **created**; a root-layout crash previously
  rendered Next's default page and reported nothing. All four existing boundaries
  now `captureException` + POST telemetry. The dashboard boundary deliberately
  skips reporting a `QUOTA_EXCEEDED` block — that is a product state, not a defect.
- `src/app/api/telemetry/error/route.ts` — unauthenticated by necessity (the
  boundary that most needs to report is the one that fired because the session
  broke), so bounded: 16kB body, field caps, 20/min per IP, always 204.
- `supabase/functions/error-monitor/` — hourly. Threshold mirrored from
  `src/lib/telemetry/threshold.ts`, where the tests live.

**Verified end to end against a real database:** 13 seeded events → 3 groups →
2 promoted (one on volume, one on blast radius), the 4-events-one-org group
correctly held back; three consecutive runs produced no duplicate issue and no
repeat alert; `ON DELETE SET NULL` keeps a customer's ticket when its issue is
deleted.

**Bug found and fixed during that run:** the summary counted alerts it intended
to send rather than ones it wrote, so a run with no active superadmin still
logged `alerted: 2`. Since the run summary is this cron's only visibility, that
would have hidden a broken alert path indefinitely. `alertSuperadmins` now
returns the number actually inserted.

---

## M3 — outstanding manual ops

The build shipped; what is left is environment configuration, done by hand.

- Register the `error-monitor` schedule **in the Supabase Dashboard** (`0 * * * *`).
  The CLI's `schedule` key is unsupported, so `supabase/config.toml` documents it
  in a comment only, and `scripts/setup-crons.sql` predates this function.
- `npx supabase functions deploy error-monitor`.
- Optional, for GitHub filing: a fine-grained PAT (issues:write) via
  `supabase secrets set GITHUB_ISSUES_TOKEN` plus `GITHUB_ISSUES_REPO`, and the
  same in Vercel. Both are **optional** in `src/lib/env.ts` — without them the
  internal `dev_issues` queue works and filing is skipped, rather than the build
  failing.

---

## M4 — Polish (optional)

Aging badges in the queue (>48h open reads destructive), ticket counts on
`/admin/dashboard`, canned responses, `sendPlatformEmail()` (direct Resend) for an
email push on reply, CSAT 👍/👎 on resolve.
