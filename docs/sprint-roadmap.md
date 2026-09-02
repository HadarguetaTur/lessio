
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
| 30 | Revenue Integrity & Reliability | 📝 Planned |
| 31 | WhatsApp Production Launch | 📝 Planned — stories 5, 7, 9 already done |
| 32 | Customer Support System (tickets, AI triage, recurring-bug detection) | ✅ M1–M3 done |
| 33 | Integration Hub (API keys, `/api/v1`, Make payment provider, webhooks) | ✅ M1 shipped |
| 34 | Platform Admin & Growth Console (SaaS metrics, lead CRM, pixels, attribution) | 🚧 M1 built |

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
- Story 2: SaaS renewal engine (token-charge cron, past_due enforcement, cancel-subscription flow, Sumit E2E cutover — carried since Sprint 23)
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

