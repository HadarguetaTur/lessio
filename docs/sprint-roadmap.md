
# LESSIO — Full Sprint Roadmap
*Updated: Sprint 22 complete, Sprint 23 planned*

---

## Completed Sprints (1–22)

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

---

## Sprint 23 — International Launch Readiness
**Status:** Planned
**Depends on:** Sprint 22 complete

**Goal:** Everything needed to legally and technically operate in the EU and English-speaking markets (UK, Australia, US).

### Story 1 — GDPR Compliance
- Privacy policy page per org (generated from template, org fills in contact details)
- Cookie consent banner (non-EU users exempt)
- Right to deletion: parent can request data deletion from portal → creates deletion request ticket in admin
- Data export: admin can export all data for a parent (JSON)
- Data retention policy: `organization.data_retention_days` — auto-anonymize old lessons + `conversation_log` + `whatsapp_processed_messages` after N days (Edge Function)
- Legal pages (Terms + Privacy) with real content (currently placeholder)

### Story 2 — URL-Based Locale Routing + Arabic
- Add URL prefix routing for portal + booking WebView (public-facing, SEO matters here)
- Locale auto-detection from browser `Accept-Language` header on first visit
- Arabic support (`messages/ar.json`, RTL same as Hebrew)
- English becomes default for non-IL orgs

### Story 3 — International Payment Methods
- Stripe provider (`src/lib/payments/stripe.ts` implementing `PaymentProvider` interface)
  - Stripe Checkout or Payment Links for parent payments
- SEPA Direct Debit support via Stripe (EU market)
- PayPal option (US/AU market)

### Story 4 — WhatsApp Approved Templates (Meta)
Currently the system uses "session messages" (valid only if parent messaged within 24h). For proactive messages to users who haven't messaged recently, Meta requires **approved Message Templates**.
- Submit Hebrew + English + Arabic templates to Meta for approval
- Implement template message type in WhatsApp send functions (currently all `type: 'text'`)
- Fallback: if session expired → send template; if within session → send text

### Story 5 — Production Hardening
- Add `src/app/error.tsx` + `src/app/not-found.tsx` global error/404 pages
- Add `src/app/(dashboard)/error.tsx` dashboard error boundary
- Validate Sumit SaaS billing end-to-end with real credentials on staging
- Enforce feature gates server-side (currently UI-only in sidebar)

---

## Sprint 24 — Pedagogical Depth
**Status:** Planned
**Depends on:** Sprint 23 complete

**Goal:** Transform homework from a simple text message into a real assignment system. Give teachers a place to document what happened in each lesson. Give owners visibility into student progress.

### Story 1 — Homework v2: Attachments + Submission + Grading
- DB: `homework_attachments` (assignment_id, url, filename, uploaded_by)
- File upload: teacher can attach PDFs, images, links to an assignment
- Submission flow: parent/student uploads completed work via portal (file or text)
- DB: `homework_submissions` (assignment_id, student_id, body, attachment_url, submitted_at)
- Grading: teacher adds score (0–100 or custom rubric) + written feedback per submission
- Progress analytics: per-student completion rate + average score visible on student profile
- Scheduled sending: teacher sets "send on [date] at [time]" instead of sending immediately

### Story 2 — Lesson Notes + Materials
- DB: `lesson_notes` (lesson_id, teacher_id, body_markdown, created_at)
- Teacher can add structured notes after a lesson: topics covered, gaps, next steps
- Materials: attach links or files to a lesson (reference sheets, exercises)
- Admin/owner can read all lesson notes; teacher sees only their own
- Notes visible in lesson detail page + student profile history

### Story 3 — Student Profile Overhaul
- Student detail page redesigned: tabs — Overview / Lessons / Homework / Billing / Notes
- Overview tab: attendance rate (last 30/90 days), homework completion rate, outstanding balance, last lesson date
- Lessons tab: full history (date, teacher, status, duration, cancellation reason if any)
- Homework tab: all assignments with status, score, submission link
- Billing tab: per-student charges + payment history (drill-down from billing page)
- Notes tab: teacher-written lesson notes (read-only for admin, editable for originating teacher)

### Story 4 — Learning Goals
- DB: `student_goals` (student_id, org_id, subject, description, target_date, status: active/achieved/abandoned)
- Owner/admin/teacher can define goals per student
- Goals visible on student profile + parent portal
- Status update with achievement note

**Schema additions:**
```sql
CREATE TABLE homework_submissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   uuid NOT NULL REFERENCES homework_assignments(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL REFERENCES students(id),
  body            text,
  attachment_url  text,
  score           int CHECK (score BETWEEN 0 AND 100),
  feedback        text,
  submitted_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lesson_notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id       uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  teacher_id      uuid NOT NULL REFERENCES teachers(id),
  body            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE student_goals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL REFERENCES students(id),
  subject         text NOT NULL,
  description     text NOT NULL,
  target_date     date,
  status          text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'achieved', 'abandoned')),
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

---

## Sprint 25 — AI Intelligence + Multi-Channel Communications
**Status:** Planned
**Depends on:** Sprint 24 complete

**Goal:** Make the AI assistant provider-agnostic and measurable. Add email as a second notification channel. Wire up the unused bell icon into a real in-app notification center.

### Story 1 — AI Multi-Provider + Key Management
- DB: `organizations.ai_provider` (openai / anthropic / google), `organizations.ai_model`, `organizations.ai_config_encrypted` (API key, encrypted AES-256-GCM)
- Settings page: owner selects provider + model + pastes own API key (replacing global `OPENAI_API_KEY` env var)
- Supported: `gpt-4o`, `gpt-4o-mini`, `claude-sonnet-4-6`, `claude-haiku-4-5`, `gemini-2.0-flash`
- `src/lib/ai-assistant/providers/` — adapter per provider (OpenAI SDK, Anthropic SDK, Google SDK)
- Fallback: if org has no key configured → use platform key from env (opt-in platform default)

### Story 2 — AI Usage Dashboard
- Track per-org: `ai_usage_log` (org_id, date, provider, model, prompt_tokens, completion_tokens, estimated_cost_usd)
- Settings → AI: new "שימוש" tab — monthly tokens used, estimated cost, autonomous resolution rate (AI replies / total incoming messages)
- Satisfaction: after AI reply, send "האם עזרתי? ✅ / ❌" — track response in `ai_usage_log.satisfaction`
- Aggregate satisfaction score displayed in usage dashboard

### Story 3 — Email Notifications (Resend)
- New dependency: `resend` (3,000 emails/month free tier; simple API)
- New env vars: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- `src/lib/email/index.ts` — `sendEmail(to, subject, html)` wrapper
- `src/lib/email/templates/` — React Email templates: lesson_reminder, payment_request, homework_assignment, receipt
- Settings → Reminders: owner can toggle WhatsApp + email independently per notification type
- Email sent as fallback when WhatsApp delivery fails (or when parent has email but no WhatsApp)
- Teacher notifications (lesson cancelled, homework submitted) go to teacher's email

### Story 4 — In-App Notification Center
- DB: `in_app_notifications` (org_id, recipient_profile_id, type, title, body, action_url, read_at, created_at)
- Bell icon in TopBar now rendered with unread count badge
- Notification drawer: click bell → slide-out panel with notification list
- Types: lesson_cancelled, payment_received, homework_submitted, student_at_risk, new_lead
- Auto-dismiss after 30 days
- Mark as read individually or "mark all read"
- Edge Function: `notify-events` — creates in-app notifications from DB triggers (lesson status change, charge paid, etc.)

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
**Status:** Planned
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
**Status:** Planned
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
**Status:** Planned
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
