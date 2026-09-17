
# LESSIO — Full Sprint Roadmap
*Sprints 1–28 complete · Sprint 29 in progress · Sprint 32 M1–M3 shipped · Sprint 33 M1 shipped · Sprint 34 specced*

**This file is the source of truth for sprint status.** Find the current sprint in the
table below, then read its `docs/sprint-<n>-scope.md`. Scopes for finished sprints live
in `docs/archive/sprint-scopes/`.

---

## Sprint status

| Sprint | Theme | Status |
|--------|-------|--------|
| 1 | Booking vertical slice (WhatsApp → WebView → lesson) | ✅ Done |
| 2 | Internal dashboard (students, parents, teachers, calendar) | ✅ Done |
| 3 | Billing engine (charges, cancellation policy, mark paid) | ✅ Done |
| 4 | External flows (leads, WhatsApp cancellation, payment request) | ✅ Done |
| 5 | Multi-role auth (teacher portal, RBAC hardening) | ✅ Done |
| 6 | Production readiness (audit, logging, env validation, E2E) | ✅ Done |
| 7 | Per-org WhatsApp Embedded Signup + webhook routing | ✅ Done |
| 8 | Payments abstraction (Cardcom + PayPlus, encrypted config) | ✅ Done |
| 9 | KPI dashboard + auto payment request after lesson | ✅ Done |
| 10 | Org holidays + teacher self-service availability/overrides | ✅ Done |
| 11 | Recurring lesson series (create/cancel, UI) | ✅ Done |
| 12 | Automated WhatsApp reminders (lesson + payment Edge Functions) | ✅ Done |
| 13 | Single lesson scheduling + Parent portal (OTP) + UX polish | ✅ Done |
| 14 | Homework module + WhatsApp smart intents | ✅ Done |
| 15 | Tax receipts (חשבוניות ירוקות) + Bit + PayBox | ✅ Done |
| 16 | Custom message templates + iCal export + portal receipt view | ✅ Done |
| 17 | Analytics & reporting (5 report types + CSV export) | ✅ Done |
| 18 | Super Admin dashboard (platform KPIs, org management, support mode) | ✅ Done |
| 19 | AI WhatsApp assistant (OpenAI fallback, conversation log) | ✅ Done |
| 20 | AI assistant + WhatsApp hardening (idempotency, dead-end removal, tests) | ✅ Done |
| 21 | i18n infrastructure + English (next-intl, Hebrew extraction, locale switcher) | ✅ Done |
| 22 | Billing cycle completion + subscription management + i18n cleanup | ✅ Done |
| 23 | International launch readiness (GDPR, Stripe, WhatsApp templates, error boundaries) | ✅ Done |
| 24 | Pedagogical depth (homework v2, lesson notes, student profile, learning goals) | ✅ Done |
| 25 | AI Intelligence + Multi-Channel Communications (multi-provider AI, email, in-app notifications) | ✅ Done |
| 26 | Parent Portal 2.0 (schedule, progress, messaging) | ✅ Done |
| 27 | Billing & Accounting Pro (PDF invoices, tax docs, quotas, credit notes) | ✅ Done |
| 28 | Analytics Pro (KPI deltas, revenue forecasting, teacher performance, student LTV) | ✅ Done |
| 29 | Google Login + Google Calendar Integration | 🚧 In Progress |
| 30 | Revenue Integrity & Reliability | 🚧 Story 2 built (SaaS renewals) |
| 31 | WhatsApp Production Launch | 📝 Planned — stories 5, 7, 9 already done |
| 32 | Customer Support System (tickets, AI triage, recurring-bug detection) | ✅ M1–M3 done |
| 33 | Integration Hub (API keys, `/api/v1`, Make payment provider, webhooks) | ✅ M1 shipped |
| 34 | Platform Admin & Growth Console (SaaS metrics, lead CRM, pixels, attribution) | 🚧 M1 built |
| 35 | Teacher Operations & Economics (activity, attributable revenue, estimated compensation) | ✅ Shipped 15.09.2026 — report recomputed under decision #45 |

---

## Sprint 23 — International Launch Readiness
**Status:** ✅ Done
**Depends on:** Sprint 22 complete

**Goal:** Everything needed to legally and technically operate in the EU and English-speaking markets (UK, Australia, US).

### Completed
- GDPR compliance: deletion request flow (portal → superadmin), data masking, data-retention Edge Function, structured legal pages
- Locale auto-detection from Accept-Language header + portal URL backward-compat 301 redirect
- Stripe payment provider (per-org keys, manual currency, card-only)
- WhatsApp `sendSmartMessage`: session-window check → text or approved template
- Production hardening: error boundaries + server-side feature gate enforcement (`requireFeature`)

### Carried to Sprint 24
- Sumit SaaS Billing E2E staging validation (manual checklist — requires real credentials)

---

## Sprint 24 — Pedagogical Depth
**Status:** ✅ Done
**Depends on:** Sprint 23 complete

**Goal:** Transform homework from a simple text message into a real assignment system with file attachments, submissions, and grading. Add structured lesson notes. Overhaul the student profile into a tabbed view. Introduce learning goals.

**Sprint scope:** See `docs/sprint-24-scope.md`

### Completed
- Homework v2: file attachments (Supabase Storage), student submissions via portal, teacher grading (0–100 + feedback + WhatsApp notification), scheduled sending (homework-sender Edge Function)
- Lesson notes: CRUD with RBAC, integrated on lesson detail page
- Student profile overhaul: 5-tab layout (Overview / Lessons / Homework / Billing / Notes) with KPIs
- Learning goals: CRUD + portal display, 3-status model (active / achieved / abandoned)
- Code review fixes: `sent_at` bug, file type validation, RLS deny policies, AssignForm UI completion, grading notification stabilization, completion rate column, approved templates

### Carried to Sprint 25
- Sumit SaaS Billing E2E staging validation (manual checklist — carried from Sprint 23)

---

## Sprint 25 — AI Intelligence + Multi-Channel Communications
**Status:** ✅ Done
**Depends on:** Sprint 24 complete

**Goal:** Make the AI assistant provider-agnostic and measurable. Add email as a second notification channel. Wire up the unused bell icon into a real in-app notification center.

### Completed
- AI multi-provider: adapter pattern for OpenAI/Anthropic/Google, per-org encrypted API key, settings UI with provider/model selection + test connection, platform-level OpenAI fallback
- AI usage dashboard: per-request token logging, estimated cost calculation, satisfaction tracking via WhatsApp thumbs emoji, usage tab with summary cards + daily bar chart
- Email notifications (Resend): `sendEmail` wrapper (Node + Deno), 5 HTML templates, per-type toggle in reminder settings, wired into 3 Edge Functions + grading + receipt actions
- In-app notification center: `src/lib/notifications/` lib, bell icon with unread badge in TopBar, slide-out drawer with mark-read, triggers for lesson_cancelled/payment_received/homework_submitted/new_lead/goal_achieved, 30-day cleanup Edge Function

### Carried to Sprint 26
- Sumit SaaS Billing E2E staging validation (manual checklist — carried from Sprint 23)

**Schema additions:**
```sql
ALTER TABLE organizations
  ADD COLUMN ai_provider   text NOT NULL DEFAULT 'openai'
    CHECK (ai_provider IN ('openai', 'anthropic', 'google')),
  ADD COLUMN ai_model      text NOT NULL DEFAULT 'gpt-4o-mini',
  ADD COLUMN ai_config_encrypted text; -- encrypted API key

CREATE TABLE ai_usage_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date            date NOT NULL DEFAULT CURRENT_DATE,
  provider        text NOT NULL,
  model           text NOT NULL,
  prompt_tokens   int NOT NULL DEFAULT 0,
  completion_tokens int NOT NULL DEFAULT 0,
  estimated_cost_usd numeric(10,6) NOT NULL DEFAULT 0,
  satisfaction    text CHECK (satisfaction IN ('positive', 'negative', 'none')) DEFAULT 'none',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE in_app_notifications (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  recipient_profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type                text NOT NULL,
  title               text NOT NULL,
  body                text,
  action_url          text,
  read_at             timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);
```

**New dependencies:** `resend`, `@anthropic-ai/sdk`, `@google/generative-ai`

---

## Sprint 26 — Parent Portal 2.0
**Status:** ✅ Done
**Depends on:** Sprint 25 complete

**Goal:** Elevate the parent portal from a minimal payment screen to a genuine parent engagement tool — visible progress, full schedule, homework visibility, and teacher communication.

### Story 1 — Full Schedule & Attendance History
- Portal home: replace "4 upcoming lessons" with full calendar view (week/month toggle)
- Attendance history tab: all past lessons with status (completed / cancelled / no_show)
- Cancel lesson from portal (respects org cancellation policy, sends confirmation)

### Story 2 — Homework Visibility in Portal
- Portal: new "שיעורי בית" tab
- Shows all active assignments: subject, due date, status (pending/done/overdue)
- Submit homework: upload file or type text response
- View teacher feedback + score after grading

### Story 3 — Progress Report
- Portal: new "התקדמות" tab
- Shows: attendance rate (last 30/90 days), homework completion rate, active goals
- Teacher notes: filtered view — only notes marked `visible_to_parent = true`
- Monthly summary card: "החודש הגעת ל-X מתוך Y שיעורים"

### Story 4 — Messaging (Teacher ↔ Parent)
- DB: `portal_messages` (org_id, lesson_id or null, sender_profile_id or parent_id, body, sent_at)
- Parent can send a message to the teacher from portal (not WhatsApp)
- Teacher receives in-app notification + can reply from dashboard lesson page
- Conversation thread per student

---

## Sprint 27 — Billing & Accounting Pro
**Status:** ✅ Done
**Depends on:** Sprint 26 complete

**Goal:** Make billing feel enterprise-grade: downloadable PDF invoices, proper accounting integrations, and hard server-side feature enforcement.

### Story 1 — PDF Invoice Generation
- `src/lib/billing/generateInvoicePdf.ts` — React PDF (`@react-pdf/renderer`) or Puppeteer
- Invoice includes: org logo + name + tax ID + address, line items (lessons, subscriptions, adjustments), totals, VAT if applicable, invoice number (sequential per org)
- Download button on `/billing/[studentId]` + send via WhatsApp/email on approval
- DB: `student_monthly_billing.invoice_number` (auto-incremented per org), `invoice_pdf_url`

### Story 2 — iCount Integration
- `src/lib/receipts/icount.ts` — iCount REST API adapter (`ReceiptProvider` interface)
- Settings → Receipts: add iCount option alongside חשבוניות ירוקות
- Same flow: mark paid → issue receipt → WhatsApp/email receipt URL to parent
- iCount supports full tax invoices (חשבונית מס) not just receipts — configurable

### Story 3 — Server-Side Feature Enforcement
- Move feature gate checks from sidebar (UI-only) to server actions and API routes
- `requireFeature(session, 'homework')` — throws 403 if plan doesn't include feature
- Applies to: AI assistant, homework, parent portal, full reports, leads
- Quota enforcement: `basic` plan capped at 100 students and 200 lessons/month → returns 402 when exceeded

### Story 4 — Accounting Export
- Export billing data as CSV compatible with iCount + QuickBooks format
- Monthly billing export: one row per charge with student, amount, VAT, receipt number
- Available from `/reports/revenue` → "ייצוא לחשבונאות"

---

## Sprint 28 — Analytics Pro
**Status:** ✅ Done
**Depends on:** Sprint 27 complete

**Goal:** Give business owners the visibility they need to make data-driven decisions — trends, forecasts, drill-downs, and teacher performance.

### Story 1 — Dashboard Redesign
- Every KPI card shows `Δ vs. last month` (green/red delta badge)
- KPI cards are clickable → drill into underlying data
- New KPIs: average revenue per student, lessons per teacher (utilization), lead conversion rate
- Revenue trend sparkline (last 12 months) directly on dashboard

### Story 2 — Revenue Forecasting
- "תחזית חודש זה": based on scheduled lessons + subscription billing → projected revenue
- At-risk revenue: scheduled lessons with at-risk students flagged
- Teacher utilization: hours booked / available hours per week

### Story 3 — Teacher Performance Dashboard
- Per-teacher: lessons delivered, cancellation rate, on-time rate, avg lesson rating (from future parent feedback)
- Comparison table: teachers side-by-side
- Trend: month-over-month per teacher

### Story 4 — Student Lifetime Value + Cohort
- LTV: total charged per student since creation
- Cohort retention: of students who started in month X, how many are still active at month X+1, X+3, X+6
- Churn analysis: which months lose the most students

---

## Sprint 29 — Google Login + Google Calendar Integration
**Status:** 🚧 In Progress  
**Depends on:** Sprint 28 complete  
**Scope:** See `docs/sprint-29-scope.md`

### Stories
- Story 1: Google OAuth login/signup (Supabase Google provider + `/signup/complete` onboarding)
- Story 2: Per-org Google Calendar connection (OAuth, encrypt refresh token, settings UI)
- Story 3: Per-teacher Google Calendar connection (teacher sub-shell settings)
- Story 4: Calendar conflict check in lesson creation (soft warning, override-able)

---

## Sprint 30 — Revenue Integrity & Reliability
**Status:** 📝 Planned
**Depends on:** Sprint 29 complete
**Scope:** See `docs/sprint-30-scope.md`
**Source:** Full product review (2026-06-11)

### Stories
- Story 1: Payment webhook security (Stripe signature verification, Cardcom/PayPlus server-side confirmation, receipt idempotency fix, payments test coverage)
- Story 2: ✅ **SaaS renewal engine built (2026-09-02)** — token-charge cron with a 0/3/7 dunning ladder, checkout↔payment binding with replay protection, reconciliation, trial-end interstitial and lifecycle emails. **Sumit E2E cutover against the live company is still outstanding** (carried since Sprint 23); see `docs/release-checklist.md`
- Story 3: Ship WhatsApp automations WIP (Edge template sync, toggle E2E, WABA ID signup)
- Story 4: Reliability hardening (Sentry in Edge Functions, cron send/mark atomicity, webhook rate limiting)
- Story 5 (stretch): Dashboard CRUD completions (edit teacher/goal/note, teacher lesson cancel, subscriptions page links)

> **Note:** Story 3 and the WhatsApp parts of Story 4 (4c webhook rate limit, 4d unknown `phone_number_id`) are absorbed into Sprint 31 — see `docs/sprint-31-scope.md`.

---

## Sprint 31 — WhatsApp Production Launch
**Status:** 📝 Planned
**Depends on:** none (runs in parallel with Sprint 30 Stories 1–2; absorbs Sprint 30 Story 3 + WhatsApp parts of Story 4)
**Scope:** See `docs/sprint-31-scope.md`
**Source:** Full WhatsApp end-to-end audit (2026-08-14)

### Stories
- Story 0: Critical correctness fixes (`from_phone` session-window/PII bug, Node↔Deno template sync, 16-type templates UI)
- Story 1: Connection lifecycle (`waba_id` required, disconnect unsubscribe/cleanup, Embedded Signup `config_id`)
- Story 2: Automation toggle enforcement in Edge Functions + autoSend
- Story 3: Portal OTP via Meta AUTHENTICATION template (cold-start login fix)
- Story 4: Webhook hardening (rate limit 30/phone/5min, unknown `phone_number_id` → Sentry + superadmin notification)
- Story 5: Template approval status tracking (webhook field + status chips in settings) — may slip
- Story 6: Bot improvements (intent collisions, non-greedy cancellation session, group-lesson guard, non-text replies, outbound message log)
- Story 7: Sender role awareness — the bot resolves parent/student/teacher/staff instead of "parent or lead", with a per-role menu (`resolveSender`, `ROLE_MENUS`); teachers and owners stop being filed as leads in their own CRM, and a student can answer the homework reminder sent to their own phone
- Story 8: WhatsApp opt-out — `stop`/`הסר` sets `parents.opted_out_at` and blocks every business-initiated send (Node `sendSmartMessage` + payment-request actions + the Deno cron path); `start`/`התחל` restores. "Opted out" badge on `/parents`. Required by Meta's messaging policy — the App Review screencast previously had no implementation behind it
- Story 9: Parent messaging consent (opt-in) — the first business-initiated message to any parent is preceded by a one-time `welcome_notice` template naming the business and the stop word (`parents.welcome_sent_at`, claimed atomically). Consent evidence recorded per source (`attested`/`import`/`portal`/`booking`/`whatsapp_reply`) on `parents.consent_source`; captured on the parent + student + lead-conversion forms, the import screen, the portal login and the booking confirm. Closes three opt-out leaks Story 8 left open (auto payment request, receipt notice, day-off cancellation notice). Nothing is blocked for a parent without consent — Meta's policy wants the notice, not silence
- Ops: Meta Business App + Business Verification + App Review + Embedded Signup Configuration, cron registration, migrations, WABA backfill
- Ops: English demo tenant for App Review (`scripts/seed-review-demo.ts` / `cleanup-review-demo.ts`) — see `docs/meta-app-review-submission.md`

---

## Sprint 32 — Customer Support System
**Status:** ✅ M1–M3 shipped (migrations live in production), M4 optional
**Depends on:** none (independent of the WhatsApp launch track)
**Scope:** See `docs/sprint-32-scope.md`
**Source:** Support architecture session (2026-08-26)

**Goal:** Support that scales past answering WhatsApp messages by hand — customers reach us in-product, tickets triage themselves, and repeating production errors become dev issues before anyone notices them.

### Milestones
- M1 ✅: Ticket core — `support_tickets` + `support_ticket_messages`, floating help widget for owners/admins, `/support` thread pages, `/admin/support` operator queue with replies and status, in-app notifications both directions, 10-tickets-per-org-per-day limit
- M2 ✅: WhatsApp intake (staff menu 4th action + `support_sessions` three-step state) and AI triage (category + severity on every ticket, platform OpenAI key). Deferred: screenshot attachments, self-service KB answers
- M3 ✅: Error telemetry (`error_events`, fingerprinting, all four boundaries instrumented + the previously missing `global-error.tsx`, `onRequestError` feeding the DB alongside Sentry) and the hourly `error-monitor` cron that promotes a fingerprint into a `dev_issue` + GitHub issue + a throttled superadmin alert
- M4 (optional): SLA/aging badges, admin metrics, canned responses, platform email, CSAT

**Manual ops still outstanding for M3:** register the `error-monitor` schedule in the Supabase Dashboard (`0 * * * *`) — the CLI cannot do it; and optionally `supabase secrets set GITHUB_ISSUES_TOKEN` + `GITHUB_ISSUES_REPO` to enable GitHub filing (without them the internal queue works and filing is skipped).

---

## Sprint 33 — Integration Hub

**M1 ✅ Shipped** · M2 📝 Planned · M3 📝 Planned

Implements decisions #28 (Integration Hub Shape) and #30 (Tenant-Owned Credentials).
Full scope: `docs/sprint-33-scope.md`. Setup guide: `docs/integrations-make-setup.md`.

| Milestone | Contents | Status |
|---|---|---|
| M1 | Org API keys (`organization_api_keys`, sha256), `/api/v1` with per-key rate limiting, `GET /v1/me`, `POST /v1/charges/:id/payments`, the `make` payment provider, Settings → Integrations | ✅ Done |
| M2 | Outbound webhooks (`org_webhook_endpoints` + `webhook_deliveries` outbox, `emitOrgEvent`, Stripe-style HMAC signing, cron retry) and the rest of the REST surface | 📝 Planned |
| M3 | MCP server, so an owner can connect Lessio to Claude Desktop | 📝 Planned |

**Why:** Grow charge ₪500 + VAT/month for API access and confirmed the Make route is not
covered by it. Paying for Make (~$9/month) instead needs exactly the two directions a
general automation integration needs — so the payment workaround and the integration
platform are one feature, not two.

**Also fixed here:** plan quotas were never enforced. `quota.ts` read `students_quota` and
`lessons_monthly_quota` from an object whose `select` in `plans.ts` never fetched them, so
both read back `undefined`, and `undefined == null` short-circuited every check. An
`as Record<string, unknown>` cast hid it from the compiler. Fixed before opening the API,
since M2 will allow bulk record creation.

---

## Sprint 34 — Platform Admin & Growth Console

**Status:** 🚧 M1 built (migration not yet applied) · M2–M4 planned
**Depends on:** none (independent of the Sprint 33 M2/M3 track)
**Scope:** See `docs/sprint-34-scope.md`
**Source:** Full `/admin` review (2026-08-30)

**Goal:** `/admin` was built in Sprint 18 as an ops tool for a pre-revenue product and still
has that shape. It measures the wrong thing (tenant revenue from `charges`, not Lessio's own
MRR), it has no growth layer at all (zero tracking code, no cold-lead path, no attribution),
and it cannot manage a plan or a subscription without SQL.

| Milestone | Contents | Status |
|---|---|---|
| M1 | Grouped nav + `/admin` index + ⌘K palette + shared `AdminTable`; real SaaS metrics (MRR, churn, trial→paid, activation funnel); `organization_activity` / `organization_usage` views replace the O(all-rows) queries; `/admin/subscriptions`, `/admin/revenue`, `/admin/plans`, `/admin/audit`, tabbed org detail, `admin_audit_log` | ✅ Built |
| M2 | Measurement. **Attribution capture shipped early with M1** (`ls_vid` / `ls_attr` cookies in `proxy.ts`, `attribution_touches`, frozen onto the org at signup). Remaining: `tracking_destinations` + screen, `<TrackingScripts />` + consent banner, Meta CAPI + GA4 Measurement Protocol, the four conversion events | 🚧 Capture done |
| M3 | CRM: `platform_leads`, `POST /api/public/leads/:formKey` for external landing pages, inbox + pipeline, lead form and pricing section on the landing page, `saas_plan_inquiries` merged in, campaigns + spend, CAC / LTV | 📝 Planned |
| M4 | Ops depth: `/admin/errors` feed, `/admin/cost` (WhatsApp + AI vs MRR), `org_feature_overrides`, sidebar count badges | 📝 Planned |


**Ops outstanding for M1:** apply `supabase/migrations/20260830210000_platform_admin_console.sql`
(`npx supabase db reset` locally, `npx supabase db push` for production). Until it runs,
`/admin` and `/admin/orgs` fail to read `organization_activity`, `organization_usage`,
`admin_audit_log` and `attribution_touches`, and signup cannot write `organizations.attribution`.

**Ordering note:** M2 must ship before M3 — attribution that starts late leaves a data hole
that cannot be backfilled. The cookie-capture half of M2 has no dependencies and is worth
shipping alongside M1 so it starts accumulating immediately.

**Compliance note:** `src/app/privacy/PrivacyHe.tsx` already names Meta Pixel, GA4, PostHog
and Hotjar as third parties, while `src/` contains no tracking code and no consent banner.
M2 closes that gap in the correct direction.

---

## Scheduling edge cases — breaks + leftover time (2026-09-01)

**Status:** ✅ Built (migration `20260901160000` not yet applied to production)
**Track:** standalone; no sprint dependency
**Amends:** `docs/decisions.md` #2 and #6

Two gaps in slot generation that had been open since Sprint 1.

**Breaks between lessons.** `break_duration_minutes` was only a slot *stride* — the
overlap test still offered a slot starting the instant a lesson ended, so the setting
meant to space lessons out handed out back-to-back pairs. It was also unreachable by
the owner (superadmin console only), and had no per-teacher value even though a break
is a property of the person teaching. Now: a real buffer around lessons and locks in
parent-facing generation and at lock time; `teachers.break_duration_minutes` overrides
the org, NULL inherits, 0 is an explicit "no break". Teachers and admins creating a
lesson by hand get a warning and may proceed — the buffer binds parents and the bot,
not the teacher.

**Leftover time.** The slot loop silently discarded whatever could not fit a whole
lesson at the end of a day. Now `detectDayTail` catches that remainder after a booking
and asks the teacher: block it, extend the day one-off, or leave it. One prompt per
teacher per date, and reads re-derive the remainder so a cancelled lesson retires the
question on its own.

**Also here:** `/settings/scheduling` (first owner-facing home for the break and
`min_booking_notice_hours`), a band-merge bug in the week view that made every slot its
own band whenever a break was set, and `resolveDayWindows` — one implementation of the
"special hours else weekly grid, minus blocks" rule that `getAvailableSlots` and
`checkTeacherAvailability` had each written out separately.

**Follow-up (2026-09-02):** manual lesson creation now analyses the free segment
before saving. If the chosen time strands a fragment shorter than every lesson
duration available to that user, the form shows the exact fragment and offers
edge-packed alternatives; the teacher can still explicitly continue. This is
shared by the owner/admin and teacher creation routes.

**Known gaps:** `createSeries` is not break-aware and does not run tail detection
or the new packing analysis. The persistent end-of-day prompt still examines only
the last window; the new mid-day analysis runs at manual creation time rather than
as a general calendar-health scanner. The `min_booking_notice_hours` end-vs-start
quirk is documented, not fixed.

---

## Automatic lesson completion (2026-09-01)

**Status:** Built (migration `20260901190000` and cron registration not yet applied)
**Track:** standalone; no sprint dependency

Scheduled lessons are automatically marked completed 15 minutes after `end_at`.
The five-minute job atomically claims only still-scheduled rows, then reuses the
existing immediate/monthly billing and automatic payment-request paths. Completion
source and billing warnings are stored on the lesson; warnings are retried without
moving the lesson back to scheduled. Cancelled and no-show lessons are never claimed.

---

## Parent-portal feature toggles (2026-09-02)

**Status:** Built (migration `20260902150000` not yet applied)
**Track:** standalone; no sprint dependency

Owners and admins choose what the parent portal offers, at `/settings/parent-portal`:
a master switch plus seven toggles — payments, homework, exams, progress, messages,
self-service booking, and parent self-cancel. Home and the schedule are always
available while the portal is open. Everything defaults to on, so existing orgs are
unchanged.

The set lives in one jsonb column, `organizations.portal_settings`, where a missing
key means on (Decision #34). Enforcement is per page *and* per server action, not tab
visibility alone. The bot keeps working either way; only its portal-facing links move
— a closed portal is not offered in the parent menu, and the balance reply points at
the portal home, or at nothing, when the payments page is closed. The portal link
moved off the WhatsApp settings page onto the new one.

**Known gaps:** the Edge Function crons (homework sender/reminders) still send on
`reminders_enabled` and `service_state` alone — a parent whose org closed portal
homework can still receive a homework WhatsApp message. Deliberate: the toggles are
scoped to the portal.

---

## Group lessons carry their group (2026-09-02)

**Status:** Built (migration `20260902200000` not yet applied to production)
**Track:** standalone; no sprint dependency
**Amends:** `docs/groups-spec.md`

A group lesson used to be saved as `lesson_type='group'` plus its `lesson_students`
rows — the group chosen in the form was expanded in the browser and its id dropped,
so every calendar view named one arbitrary member. Now `lessons.group_id` (and
`lesson_series.group_id`) point at the `student_groups` row, `ON DELETE SET NULL`,
and the Server Actions read the roster from the group server-side instead of
trusting the posted `student_ids`. A single `getLessonTitle()` names lessons
everywhere: group name → up to two participants by name → `<type> · N students`.
Recurring series gained the `group` type. Legacy group lessons were backfilled to
the one group whose membership matches exactly; ambiguous or unmatched rows stay
unlinked and fall back to the head-count title.

**Known gaps:** the roster is a snapshot at creation — changing a group's members
does not touch existing lessons, and extending a series copies the last lesson's
roster rather than re-reading the group. Cancellation and reminders still act on
the first enrolled student only (Sprint 31 backlog).

---

## WhatsApp conversations + human takeover (2026-09-03)

**Status:** Built (migration `20260903120000` applied locally, not yet in production)
**Track:** standalone; closes Sprint 31 Story 6e and the "conversation handoff to
a human agent" deferral from Sprint 19

Staff can now read what the bot is saying to parents, and answer in their own
words. Until now nothing kept the conversation: `conversation_log` recorded only
the AI-fallback branch, `whatsapp_processed_messages` kept ids without bodies,
and outbound sends were not recorded at all — every menu, cancellation and
balance reply vanished the moment it was sent.

**The transcript.** `whatsapp_messages` records both directions with an origin
(`bot` / `ai` / `staff` / `cron`). Inbound is written in the webhook right after
the idempotency claim — before the service-state gate and before the takeover
check, so a message that gets no answer is still on file. Outbound logging
avoids touching the ~28 send call sites: the entry points declare who is
speaking through an `AsyncLocalStorage` context (`src/lib/whatsapp/logContext.ts`)
and the low-level senders read it back, which also finally captures the
`messages[0].id` Meta returns and every sender discarded. A send with no context
in scope is not logged rather than logged as a guess. Every write is
fire-and-forget: a transcript must never break a send.

**The takeover.** Sending from the dashboard opens a `whatsapp_takeovers` row
and the webhook stops auto-replying for that (org, phone) — otherwise a parent
gets a human answer with a menu underneath it. Same lifecycle as
`support_sessions`: presence is the state, expiry is read-time, release is a
delete. Six hours, extended by each staff message, released by hand from the
thread. The check fails **open**: a broken query must not silence the bot.

**Access.** Owners and admins see every conversation; a teacher sees only
parents of their own students, resolved the same two ways
`canTeacherAccessStudent` resolves them (assigned, or sharing a lesson) and
re-checked per thread, since a phone number in a URL is client input. Teachers
reach `/messages/whatsapp` only — the portal threads at `/messages` are org-wide
and stay owner/admin.

**Known gaps:** Deno Edge Function sends (cron reminders) are not logged yet —
they bypass the Node senders entirely. Meta delivery/read statuses are parsed
nowhere, so `status` is always `sent`. No per-staff unread state: "awaiting
reply" is simply "the last message came in". Manual sends are text-only and
only inside the 24h window; the composer is disabled outside it rather than
offering an approved template. No backfill exists — the transcript starts at
deployment.

---

## Stopping a series vs removing it (2026-09-03)

**Status:** Shipped (migration `20260903150000` applied to production 2026-09-03)
**Track:** standalone; closes the "lesson series editing" gap listed as out of
scope in `docs/sprint-30-scope.md`

A series had one destructive action, "stop from a date", and it did not keep the
promise its name makes: it deleted every `scheduled` row from the chosen date
with no floor on that date, so a date in the past erased lessons that had already
happened but were never marked completed — and with them, by cascade, the
`lesson_students`, `lesson_notes` and `student_cancellation_events` rows the
monthly bill is computed from. The delete also ran as one batch against
`charges.lesson_id`, an FK with no `ON DELETE`, so a single charged lesson in
range failed the whole stop behind a generic error.

The two intentions are now separate actions on the series list:

- **Stop** keeps everything that happened. A stop date may still sit in the past —
  the past is protected by what an occurrence carries, not by the calendar:
  completed, hand-cancelled, charged or written-about lessons are skipped and
  reported back as "kept". The series row stays, marked stopped via the new
  `lesson_series.stopped_at`, and extending it clears the marker and revives it.
- **Remove** deletes the series and every lesson it produced, and is refused
  outright while any occurrence carries history (decision #33 — financial rows are
  not deleted to make a cleanup convenient). The list greys the action out and says
  why; `deleteLessonSeries` throws `SeriesHasHistoryError` regardless of the UI.

Both read the same classifier, `src/lib/lessons/seriesFootprint.ts`, so the
greyed-out button and the server's refusal can never disagree. The dead
`cancelLessonSeries` soft-cancel path and the orphaned scope-chooser i18n keys
(`cancelFromHere`, `cancelAll`, …) were removed with it.

Two follow-ups shipped the same day, once a real tenant showed what the change
did *not* reach. The calendar had been hiding a cancelled lesson only while it
was still ahead of us — a past cancellation happened and may carry a charge
someone needs explained. That reasoning does not cover a row a series-wide cancel
wrote: it is only ever written in bulk over lessons nobody attended and nobody
was charged for, which is why the 20260901100000 migration deleted the future
ones as planning noise. Those are now hidden at any date, with the existing
"show cancelled" toggle still revealing them, and hand-typed cancellations
untouched. The series list likewise hides series with nothing ahead of them
behind a toggle of their own.

`scripts/cleanup-dead-series.ts` then removes the spent series outright. It runs
through `deleteLessonSeries`, so a series holding any history is reported and
skipped rather than worked around, and `--orphans` also sweeps series-cancelled
lessons whose series is already gone (`lessons.series_id` is ON DELETE SET NULL,
so nothing else would ever collect them). Run against Raz Mazurik on 2026-09-03:
27 series, 30 lessons and 1 orphan removed; his 97 hand-typed cancellations, 929
completed lessons, 7 upcoming lessons and 386 charges untouched.

**Known gaps:** removal is only offered on `/lessons/new-series`, not on a single
lesson's page, where stopping remains the only series-wide action. Series created
by the importer still write a differently shaped `rule`; they can now be removed,
but they still render their schedule as `undefined`.

---

## Exam good-luck message (2026-09-08)

**Status:** Built (migration `20260908100000` applied locally, not yet in production)
**Track:** standalone; no sprint dependency

Exams have been in the product since the progress-report work — `student_exams`,
the dashboard tab, the parent portal form and the student bot's four-step report
flow — but nothing ever reached the student before one. This adds the seventh
automated message: a good-luck note on the day of the exam.

**When it goes out.** `exam_date` is a date, so most exams have no time at all.
The org picks an hour for the morning send (`exam_good_luck_hour`, default 07:00
org-local). Where a time *is* known, the message goes out
`exam_good_luck_hours_before` hours ahead of it (default 2), never earlier than
the morning hour — a 07:30 exam must not wake anyone at 05:30 — and never once
the exam has started. That whole rule is one pure function,
`src/lib/exams/goodLuckTiming.ts`, mirrored for Deno and unit-tested on the Node
side, because the Edge Functions have no test harness here.

`exam_time` is optional on all three entry points: the dashboard exam sheet, the
portal report form, and the bot, where it is read off the same answer as the date
("15/9 10:00") rather than costing a fifth conversation step.

**How it sends.** The hourly `exam-good-luck` Edge Function is a sibling of
`homework-reminders`: same org gates (`reminders_enabled`, `service_state`, a
connected number, plus `automation_exam_good_luck_enabled`), the same
claim-before-send through `notification_log` (new type `exam_good_luck`, keyed by
exam id, so a missed cron run catches up later in the day without a second send),
and the same recipient rule — the student's own phone, else the primary parent.
Copy is a new `exam_good_luck` template type, editable per org and per language,
with `lessio_exam_good_luck_{he,en}_v2` registered at Meta for the out-of-window
case, which is the normal case here.

The settings live in the automations list on `/settings/whatsapp`, next to the
lesson reminder, rather than on `/settings/exams` — one home per setting.

**Ops outstanding:** apply migration `20260908100000` to production; deploy the
function; re-run `scripts/setup-crons.sql`; register the two new Meta templates
on each connected WABA.

**Known gaps:** no email channel (WhatsApp only); the message is not offered as a
copilot action; a group of exams on one day sends one message each.

---

## Outbound acquisition engine V1 (2026-09-07)

**Status:** Built (migration `20260907120000` applied locally, not yet in production)
**Track:** standalone; pulls the `platform_leads` table forward from Sprint 34 M3
**Setup:** `docs/outbound-gmail-setup.md`

Lessio had no cold-lead path at all. This adds the minimum for
**CSV → first email → reply "כן" → Lead → demo email**, with every piece of
state and copy inside Lessio. The transport is Lessio too (decision #40): a
Google service account with domain-wide delegation sends as each outreach
mailbox and reads its inbox for replies. No Make/n8n layer. Several mailboxes
share the load under per-mailbox daily caps (`outbound_mailboxes`).

Tables: `outbound_campaigns` (the copy, with `{{first_name}}` /
`{{personal_line}}` / `{{metadata.*}}` placeholders — personalisation comes in
with the CSV, not from AI), `outbound_prospects` (the queue; one row per
address globally; the status column is the state machine in
`src/lib/outbound/transitions.ts`), `outbound_messages` (every send and reply,
unique on the transport's message id so a retried POST is a no-op),
`outbound_suppressions` (global do-not-email, checked at import, at claim and
on manual add), and `platform_leads` + `platform_lead_events` created with M3's
exact names and a column subset so M3 only adds. `claim_next_outbound_prospects`
claims a batch under `FOR UPDATE SKIP LOCKED` with a 30-minute lease, so a send
run that dies mid-send heals itself.

Crons (`/api/internal/outbound/{run-send,run-replies}`, bearer digest in
`LESSIO_OUTBOUND_CRON_SECRET_SHA256`): `run-send` (every 10 min, Sun–Thu
working hours, re-checked in code) claims up to 5, sends each from the mailbox
with the most room today with a 20–60 s pause between, and marks sent or
requeues (three failures → `failed`); `run-replies` (every 5 min) reads each
mailbox's inbox since its last poll and matches by from-address (thread /
In-Reply-To as a fallback), classifies with a deterministic bilingual keyword scorer
(quoted text stripped first; positive and negative scored independently so
"לא רע בכלל, אשמח" never lands in suppression — ambiguity is `unknown` for a
human to read), moves the prospect, and on `interested` upserts the lead and
sends the demo email once through Resend.

UI: `/admin/outbound` (four counters, the mailbox pool with a test send,
campaign copy, CSV upload, suppression box, prospects, latest replies) and a
read-only `/admin/leads`.

**Phase B (deliberately not built):** lead status controls and
`prospect → converted`, nav count badge, requeue action, campaign list polish,
reply-rate math, `docs/schema.md` / decision entry. Once the flow has run on
two real addresses, real prospects go in before any of this.

**Ops:** all done 2026-09-07. Migrations `20260907120000` and `20260907140000`
applied to production, service account created and delegated, three mailboxes
registered (`cs@hadarturgemanautomations.com` plus two on `getlessio.com` with
SPF and DKIM), env set in Vercel, crons registered, and the acceptance path ran
end to end on a real address: cold email → "כן" → lead → demo email.

---

## Outbound V2: AI openers, follow-ups, real unsubscribe (2026-09-08)

**Status:** Shipped. Migration `20260908130000` applied to production; the
`outbound-followups` and `outbound-openers` crons are registered and live.

Three gaps the first real send exposed.

**The opening line is drafted, then approved.** A `website` column (a URL, a
profile, or a sentence typed by hand) is read by the platform model, which
writes one sentence in the prospect's language. It cannot be sent on its own:
the send claim only picks up prospects whose `opener_status` is `none` or
`approved`, so everything else waits in "opening lines to review" on
`/admin/outbound`, where it is edited, approved, redrafted or skipped. An
optional `gender` column tells the Hebrew copy how to address the person;
without it the wording avoids the choice instead of guessing.

**Follow-ups, only for people who answered.** Nobody who ignored the first
email is mailed twice. After the demo: +3 days, then +7. After a reply the
classifier could not read: one clarification at +2 days. Each goes from the
mailbox that sent the original, inside the same Gmail conversation
(`threadId` + `In-Reply-To` + a `Re:` subject), and counts against that
mailbox's daily cap. Any real reply cancels what is queued; an out-of-office
does not. A full or disabled mailbox defers the touch rather than sending it
from a stranger.

**Unsubscribe erases.** Every email now carries a one-click link (`/u/<token>`)
and the RFC 8058 headers, so Gmail and Outlook show their own button; a reply
like "תסירי אותי" does the same (the regex had only the plural forms). Either
path keeps the address on `outbound_suppressions` and deletes the prospect, the
whole conversation, the platform lead and its events in one transaction. The
migration also erased the rows V1 had left behind in `unsubscribed`. The reply
poller drops mail from a suppressed sender *before* storing it, so its 10-minute
overlap cannot re-create what was just deleted. Opening the link never
unsubscribes anyone — scanners follow links — so the page asks and the button acts.

**Still deliberately not built:** lead status controls and `prospect → converted`,
nav count badge, requeue, campaign list polish, reply-rate math, `docs/schema.md`.

---

## WhatsApp broadcasts + group channel (2026-09-08)

**Status:** 📋 Specced — Phase 0 built (migration `20260908150000` local only, templates not yet submitted)
**Track:** standalone; replaces the shelved "distribution lists" spec of 2026-09-05
**Plan:** `~/.claude/plans/pure-moseying-raccoon.md` (decision #42)

Every WhatsApp send today is 1:1 and event-driven. There is no way for an owner
to tell the parents of a group one thing, and no link between `student_groups`
and WhatsApp — so it happens from the personal phone, with no opt-out, no
transcript and no protection for the business number Lessio is connected to.

Checked against Meta's documentation on 2026-09-08, and shaping everything here:
the **Groups API is open only to Official Business Accounts** (green tick —
30 days on the platform, business verification, public notability; a studio
almost never gets it), groups hold 8 participants including the business, and a
tech provider **may not submit Business Verification on a customer's behalf**.

**Phase 0 — protect the number (built).**
- `organizations.wa_quality_rating / wa_messaging_limit_tier / wa_is_oba /
  wa_business_verification_status / wa_connected_at / broadcasts_enabled`,
  refreshed by `src/lib/whatsapp/health.ts` on connect, daily
  (`/api/internal/whatsapp/health`, cron `whatsapp-health`,
  `LESSIO_WHATSAPP_CRON_SECRET_SHA256`) and by the new webhook fields
  `phone_number_quality_update` / `account_update` /
  `phone_number_name_update`. Owners get an in-app alert (`whatsapp_health`)
  on FLAGGED, tier change, restriction, verification, and on a template Meta
  pauses.
- Three template types, registered on every WABA: `class_update` (UTILITY,
  opt-out button), `promo` (MARKETING, separate opt-in, opt-out button),
  `group_invite` (UTILITY, URL button on `chat.whatsapp.com/{{1}}`).
  `BROADCAST_TEMPLATES` / `broadcastBodyParams` in `approvedTemplates.ts`.
- Verification & trust card on `/settings/whatsapp`: health badges, the
  connected → verified → OBA ladder with what each unlocks, an Israeli
  document checklist, a link into Security Centre, OBA prerequisites.

**Phase 1 — broadcast engine + guard (next).** `broadcast_campaigns` /
`broadcast_recipients`, audience as a filter (student group, lesson, teacher,
debt, manual) materialised at send time, one `guard.ts` with the rules that
keep a number out of RED (quality, warm-up, daily budget, per-parent
frequency, quiet hours, marketing opt-in, AI category check, Meta error
mapping, template pausing), cron drain with `SKIP LOCKED` claims, per-category
opt-out (`updates_opted_out_at` / `marketing_opted_out_at`), marketing opt-in
via bot + portal + attestation. Owners/admins send anything; a teacher sends
service updates to the parents of their own lessons only.

**Phase 2 — linked WhatsApp group.** The teacher opens the group on their own
phone and pastes the invite link into the student group; Lessio invites the
parents 1:1 with `group_invite` and "message the group" is a broadcast to the
group's parents. Honest about it in the UI.

**Phase 3 — Groups API**, only behind `wa_is_oba`. Not before a tenant has it.

**To go live with Phase 0:** apply the migration to production, set
`LESSIO_WHATSAPP_CRON_SECRET_SHA256` in Vercel (same token as the other cron
routes), re-run `scripts/setup-crons.sql`, tick the three new webhook fields
in the Meta App Dashboard, and register the templates on Brightpath's WABA from
the settings page.

## WhatsApp broadcasts + linked group — Phase 1 & 2 (2026-09-09)

**Status:** Built, not yet deployed (migration `20260909140000` local only)
**Track:** continues "WhatsApp broadcasts + group channel (2026-09-08)"; decision #42
**Plan:** `~/.claude/plans/pure-moseying-raccoon.md`

Phase 0 (number health, the three templates, the verification card) shipped on
09.09. This is the engine and the screens on top of it.

**Where it lives.** `/messages/broadcasts` is a third tab beside the portal and
WhatsApp conversations, for owners and admins. A student group row gains
"message the group's parents", which opens the composer with the audience ready.
A teacher gets a single box on their own lesson page. The linked WhatsApp group
lives in the group's edit sheet.

**The campaign object.** `broadcast_campaigns` stores the audience as a FILTER
and materialises it into `broadcast_recipients` only at send time, so a campaign
scheduled for next week never reaches a student who left. Skipped people are
written as rows too — the delivery report has to answer "why didn't Dana's
mother get this?" a week later. `claim_broadcast_recipients` is the same
`FOR UPDATE SKIP LOCKED` lease as the outbound engine, drained by
`/api/internal/whatsapp/broadcast` (cron `whatsapp-broadcast`, every 2 min)
twenty at a time with a pause between messages.

**The guard** (`src/lib/whatsapp/broadcast/guard.ts`) is the single gate. It
refuses on RED quality, a lapsed subscription, an unverified business sending
marketing, or a promotion written into a service update; caps on YELLOW, on a
warm-up number, and at half the remaining daily allowance so an announcement
cannot starve tomorrow's reminders; and defers past quiet hours rather than
refusing. Meta's error codes are mapped once — the per-user marketing cap
(131049) is a skip and never a retry, a throughput error requeues and ends the
tick, three failures in a row pause the campaign.

**Consent is per category.** `parents.marketing_opt_in_at` is required (not
merely un-refused) for a promo; `updates_opted_out_at` and
`marketing_opted_out_at` are separate, so leaving the offers list keeps lesson
reminders. Collected three ways: the portal switch (source `portal`), the
owner's attestation on a promo campaign, and the `bc:stop` button on every
broadcast. The bot prompt is deliberately deferred.

**The linked group.** Meta's Groups API needs an Official Business Account, so
the default is a group the teacher already has: they paste its invite link, and
Lessio sends it to each parent privately on the `group_invite` template.
`onlyUninvited` makes the button safe to press twice and makes adding a student
invite that student's parent alone. The card says on screen that messages reach
parents privately rather than landing in the group.

**To deploy:** apply `20260909140000_whatsapp_broadcasts.sql`; register the
`whatsapp-broadcast` cron in prod with the Vault bearer (not the whole
`setup-crons.sql`, which would overwrite the Edge Function jobs); the
`LESSIO_WHATSAPP_CRON_SECRET_SHA256` env var is already set. Templates must be
registered per WABA from the settings page before anything can send.

**Not built:** the bot's one-time opt-in prompt, media in broadcasts, recurring
campaigns, and Phase 3 (the real Groups API) which waits on a tenant with OBA.

## WhatsApp UX readiness (2026-09-09)

**Status:** ✅ Built — ships with the broadcasts branch; migration `20260909120000` not yet in production
**Source:** End-to-end WhatsApp UX audit, 2026-09-09 (25 findings; the artifact is linked from the support notes)

The audit scored the WhatsApp experience 58/100. The connection flow itself was
strong — every branch of Meta's popup already resolved to a sentence, and the
save blocked on both WABA subscription and Cloud API registration. What failed
was **truth after connection**: eight surfaces each derived "connected" from
`whatsapp_phone_number_id != null`, a field that only answers "are credentials
stored". An expired token, a Meta-restricted account and a healthy number all
satisfied it, so all three rendered as one green ✓.

**The resolver (`src/lib/whatsapp/connectionState.ts`)** is now the single
answer, and the reason the rest was possible. `computeWaState` is pure and
precedence-ordered — `plan_locked > not_connected > reconnect_required >
blocked_by_meta > at_risk > limited > active` — so the state matrix is a unit
test rather than a hope. **Green means operational; nothing else paints green.**
Read by the connections hub, the settings page, the setup checklist, the
dashboard banner, the conversation pages and the broadcast guard.

To answer without calling Graph on every page load, the reasons are persisted:
migration `20260909120000` adds `wa_health_error` (`token_invalid` vs
`unreachable` — terminal vs a blip), `wa_account_restricted`, and a cached
`wa_display_phone_number` / `wa_verified_name`. `health.ts` classifies a Graph
190 as a dead token and clears it on a read that works; the `account_update`
webhook sets the restriction and an APPROVED `account_review_status` lifts it;
`getPhoneIdentity` feeds the same column from the settings page's own lookup.

**Also fixed**
- Disconnect had no confirmation — one click unsubscribed the WABA, cleared the
  credentials and stopped every automation. (The confirmation string had been
  written and translated and was referenced by nothing.)
- The plan wall moved in front of the Connect button: an org without
  `whatsapp_automation` used to complete Meta's entire popup and then be
  redirected to billing with a burnt OAuth code and no explanation.
- `saveAutomationSettings` had no `requireFeature` at all — the only WhatsApp
  write action without one.
- `requireMutation` threw out of five actions, so support mode and a lapsed
  subscription presented a billing problem as a crash. One
  `mutationBlockedError` helper now distinguishes the two.
- The trust card rendered only `verified`/`pending`, so a business Meta had
  **refused** looked identical to one that had never applied.
- A broken WhatsApp was invisible outside settings. One dashboard banner, for
  exactly three states: `reconnect_required`, `blocked_by_meta`, `at_risk`.
- Admins receive the `whatsapp_health` notification and its link landed on a red
  403. The page now renders read-only for them.
- Six connection errors spoke Meta (OAuth code, token, webhook, Cloud API, raw
  scope names, an env var name); Meta's English is no longer spliced into
  Hebrew. Delivery failures show a reason, not error 131047.
- Prerequisites listed Meta Business Verification as required *to connect*,
  contradicting the trust card on the same page. Split into "to start ~10
  minutes" and "what comes later".
- The broadcast guard gained `reconnect_required` / `blocked_by_meta`: it
  protected the number's quality but not its ability to send at all, so a
  campaign on a dead token marched through the whole audience marking every row
  failed — and the audience is not reusable.

**Deliberately not done:** the audit's F5 (the trust card promising broadcasts
that did not exist) was closed by Phase 1 shipping rather than by rewording.

**To deploy:** apply `20260908150000` **and** `20260909120000`, set
`LESSIO_WHATSAPP_CRON_SECRET_SHA256` in Vercel, re-run `scripts/setup-crons.sql`,
tick the three webhook fields in the Meta App Dashboard. Until the first
migration lands, `TrustCard` returns `null` in production and the resolver falls
back to `not_connected` for every org.

---

## WhatsApp inbox (2026-09-10)

**Status:** ✅ Built on the broadcasts branch — migration `20260911120000` not yet in production
**Decision:** #43

Hadar's first reaction to the operational WhatsApp surface was that nothing was
findable. `/messages` became an inbox in the shape everyone already knows:

- **Conversations** — one rail for WhatsApp and portal (`src/lib/inbox/rows.ts`),
  search, filter chips (awaiting reply, handled by a person, parents, students,
  team, unknown, portal) and derived tags (`src/lib/inbox/tags.ts`). The facts
  behind the tags — window, parent, students, teacher, group, open balance,
  opt-out, who holds it — are resolved for the whole list in a few batched
  queries in `getConversationSummaries`.
- **Thread** — header with the tags and an explicit "I'll answer" / "hand back to
  the bot"; after the 24h window a parent can still be sent an update as the
  approved `class_update` template (`createCampaign`, extracted from the
  broadcast action and shared).
- **Lists** (`/messages/lists`) — student groups, saved lists
  (`broadcast_lists`, `{ kind: 'list' }` audience) and ready-made audiences, each
  card opening the composer with the audience selected.
- **Status** — the number's state in one line at the top of every inbox page.

Fixed on the way: the broadcast report selected a column that does not exist
(`delivery_status`), so its delivery column was always empty.

**Known gap:** `broadcast_campaigns` / `broadcast_recipients` are not in the
realtime publication or `WATCHED_TABLES`, so the broadcast pages' live refresh
never fires.

**To deploy:** apply `20260911120000_broadcast_lists.sql` together with the
broadcasts and health migrations listed above.

---

## Punch cards & attendance (2026-09-15)

Standalone track, not a sprint (like "Automatic lesson completion"). Decision
#46; plan `scalable-greeting-token.md`; migration
`20260916120000_packs_attendance_collection_policy.sql` must reach production
before the code.

**M1 — core** 🚧 built, not yet deployed
- Pack catalog, sale (student or family), activation (immediate / on payment), cancel with refund rules, balance correction, extension — `/packs`, the student card, `/settings/cancellation-policy`.
- Per-student attendance on the lesson and teacher outcome forms; the lesson status derives from it.
- `settleLessonOutcome` replaces `createLessonCharge`; late cancellation can burn a punch.
- Monthly engine bills no-shows and monthly-org pack sales; teacher economics attributes by attendance (amends #45).
- Portal: card balances, and pay-before-confirm booking when there is no entitlement — only in orgs that turned on "collects through packs" (per-lesson, with a provider and a catalog).

**M2 — parent notifications** 🚧 built — "running low" and "used up" WhatsApp messages behind `pack_notifications_enabled` (default off). New Meta templates `lessio_pack_low_balance_{he,en}_v2`, `lessio_pack_exhausted_{he,en}_v2` must be registered and approved.

**M3** — attendance-based progress/teacher reports, list badges, schedule chip, forecast. **M4** — copilot `sell_pack`. **v2** — credit notes via the receipt provider, freeze, transfer between students, duration-based units.

## Full Roadmap Summary

| Sprint | Theme | Primary Value |
|--------|-------|---------------|
| 12 | Automated Reminders | Reduces missed lessons + payment delays |
| 13 | Single Scheduling + Parent Portal | Operational completeness; parent self-service |
| 14 | Homework + WhatsApp Intents | Deepest daily-use differentiator |
| 15 | Tax Receipts + Bit/PayBox | Israeli legal compliance + payment conversion |
| 16 | Custom Templates + iCal + Portal Receipts | Brand customization + teacher retention + parent UX |
| 17 | Analytics & Reporting | Business owner visibility + accountant exports |
| 18 | Super Admin Dashboard | Platform scalability (5+ customers) |
| 19 | AI WhatsApp Assistant | Zero-admin parent support |
| 20 | AI Assistant + WhatsApp Hardening | Production reliability for AI + webhook |
| 21 | i18n Infrastructure + English | English UI for international market entry |
| 22 | Billing Cycle + Subscription Management | Complete billing workflow + SaaS subscriptions |
| 23 | International Launch | EU + English-speaking markets + Meta approved templates |
| 24 | Pedagogical Depth | Homework v2, lesson notes, student profile overhaul |
| 25 | AI Intelligence + Multi-Channel Comms | Multi-provider AI, email, in-app notifications |
| 26 | Parent Portal 2.0 | Full schedule, homework, progress, messaging |
| 27 | Billing & Accounting Pro | PDF invoices, iCount, server-side enforcement |
| 28 | Analytics Pro | Trends, forecasting, teacher performance, LTV |
| 29 | Google Login + Calendar | One-click signup; no double-booking against a teacher's own calendar |
| 30 | Revenue Integrity | Webhook spoofing closed, SaaS renewals, dunning, rate limiting |
| 31 | WhatsApp Production Launch | Real customer numbers on the platform, not the test number |
| 32 | Customer Support System | Tickets + AI triage + recurring-bug detection at platform scale |
| 33 | Integration Hub | Tenant-owned API keys and `/api/v1` — the product becomes automatable |

---

## Competitive Moat (by sprint)

After Sprint 14: **No Israeli competitor offers WhatsApp-native scheduling + homework + payment in one system.**
After Sprint 15: **Full legal compliance + Bit support = enterprise sales-ready.**
After Sprint 19: **AI assistant eliminates admin overhead — parents never need to call.**
After Sprint 23: **International-grade product, ready for UK/AU tutoring market.**
After Sprint 25: **Multi-provider AI with cost visibility + email = enterprise-level communication stack.**
After Sprint 26: **Parent portal depth rivals dedicated parent-engagement apps.**
After Sprint 28: **Data-driven operations — owners run the business from a single dashboard.**

---

## Architectural Principles (frozen)

These do not change across any sprint:
- All state in Supabase Postgres; no external state stores
- Service role key: server-side only, never in client bundles
- All secrets: server-only env vars, validated at startup
- WhatsApp: one number per org (Embedded Signup) — never a shared number
- Payments: abstraction layer (`PaymentProvider` interface) — providers are plug-in
- Receipts: abstraction layer (`ReceiptProvider` interface) — חשבוניות ירוקות + iCount plug-in
- Billing: always on primary parent (`is_primary = true` from `relationships`)
- Dates: stored UTC, displayed in org timezone (Luxon)
- RLS: enabled on all tables; service role used only where explicitly required
- Feature gates: enforced server-side (Sprint 27+), not UI-only

---



## Cold discovery qualification (2026-09-17)

**Status:** Deployed to production 2026-09-17 (migration, then code). Founder-approved: cold collection is only
for businesses with a verified team of 2–5 teachers. Proposals exclude known,
contacted, rejected and duplicate businesses across campaigns and email changes.
Durable business identity memory survives deletion; existing unpromoted proposals
are reassessed by the migration. Sent history and existing prospect queues stay intact.

See [outbound-discovery-qualification.md](outbound-discovery-qualification.md).
Follow-ups the same week: team size advisory (`20260917160000`), exclusion by name and
subject-anchored queries (`20260917180000`), team/solo segments with a campaign each and a
150-a-day collection budget (`20260918090000`).
Migration: `20260917140000_outbound_business_qualification.sql` — applied to production 2026-09-17.
