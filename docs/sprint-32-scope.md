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

## M2 — original plan (retained for the deferred parts)

### Migrations
1. `support_sessions` — clone `cancellation_sessions` (`UNIQUE(organization_id, phone)`,
   read-time `expires_at`, deny-all RLS) plus a `step` column
   (`awaiting_description` | `awaiting_confirm`) and `draft_text`. The cancellation
   flow needs no step column because it is exactly two turns; this one is three.
2. `support_ticket_attachments` + a private `support-attachments` storage bucket
   (precedent: `20260629120000_student_exams_progress_reports.sql`). Path
   `<orgId>/<ticketId>/<uuid>`, service-role upload, signed URLs for viewing.

### WhatsApp flow
- `src/lib/whatsapp/menu.ts` — add `'support'` to `MenuAction`, `ALL_ACTIONS`, and
  `ROLE_MENUS.staff` (list messages cap at 10 rows; staff has 3 today).
- `src/lib/whatsapp/strings.ts` — `support_prompt`, `support_confirm`,
  `support_created`, `support_cancelled` (he+en). The whole flow stays inside the
  24h session window, so no Meta template is involved.
- `handlers/staff.ts` — menu tap opens a session; free text with an active session
  becomes `draft_text` and asks for confirmation via reply buttons; confirm calls
  `createTicket({source: 'whatsapp'})`. The session check must run before any
  fallthrough, and a menu tap deletes the session (cancellation-flow semantics).

### AI triage
- `src/lib/support/classify.ts` — one prompt, Zod-parsed `{category, severity}`
  enums, `logAiUsage`, stamps `ai_classified_at`. Runs on **every** ticket
  regardless of source, inline in creation with a short timeout and a try/catch —
  fire-and-forget after the response is unreliable on serverless.
- Platform provider helper (`OpenAiProvider` + `OPENAI_API_KEY` directly, no org
  lookup): support AI is a platform cost, not the tenant's. No-op if unset.

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

## M3 — original plan

### Migration
`error_events` (fingerprint, name, message, route, digest, source, organization_id,
url, user_agent, stack, created_at) and `dev_issues` (fingerprint UNIQUE, title,
status, severity, event_count, org_count, first/last_seen, sample_stack,
github_issue_number/url), plus
`ALTER TABLE support_tickets ADD COLUMN dev_issue_id` (many tickets → one issue).

### Instrumentation (this is the prerequisite, not the cron)
Today Sentry is installed but nearly unused by hand: the four error boundaries only
`console.error`, there is no `global-error.tsx`, and the `{error: string}` server
action convention means the most common class of production failure never becomes
an exception at all.

- `src/lib/telemetry/fingerprint.ts` — sha256 of name + normalized message +
  route|digest, first 16 hex. Normalizer strips uuids, numbers, quoted values.
- `src/lib/telemetry/reportError.ts` — insert, never throw.
- `instrumentation.ts` — call it from `onRequestError` (which already sees every
  server request error) alongside Sentry.
- `src/app/api/telemetry/error/route.ts` — POST for client boundaries; add its
  prefix to the `src/proxy.ts` public bypass list; throttle and cap row size.
- Create `global-error.tsx`; add `Sentry.captureException` + telemetry POST to the
  four existing boundaries, keeping their current UI (including the
  `QUOTA_EXCEEDED` upgrade card in the dashboard boundary).

### Detection cron
`supabase/functions/error-monitor/` (hourly): group last-24h events by fingerprint;
threshold **≥5 events in 24h OR ≥3 events across ≥2 orgs** (blast radius beats raw
volume); upsert `dev_issues`; on a new issue file a GitHub issue via REST with
enough context for Claude Code to act from the issue alone; alert superadmins,
throttled by fingerprint via the `hasRecentUnreadSuperadminNotification` query
shape; delete events older than 30 days.

Guard double-filing by only calling GitHub when `github_issue_url IS NULL` and
setting it in the same update.

### Admin UI
`/admin/dev-issues` (queue + detail), "link to dev issue" on a ticket, and marking
an issue `fixed` posts a `system` message on every linked ticket + notifies each
reporter.

### Manual ops
- Fine-grained GitHub PAT (issues:write) → `supabase secrets set GITHUB_ISSUES_TOKEN`
  and Vercel env. `GITHUB_ISSUES_TOKEN` is **optional** in `src/lib/env.ts` — the
  feature degrades rather than failing the build.
- Register the `error-monitor` schedule **by hand in the Supabase Dashboard**: the
  CLI's `schedule` key is unsupported, so `config.toml` documents it in a comment
  only.
- `npx supabase functions deploy error-monitor`.

---

## M4 — Polish (optional)

Aging badges in the queue (>48h open reads destructive), ticket counts on
`/admin/dashboard`, canned responses, `sendPlatformEmail()` (direct Resend) for an
email push on reply, CSAT 👍/👎 on resolve.
