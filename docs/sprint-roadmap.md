
# LESSIO — Full Sprint Roadmap
*Updated: All sprints (1–28) complete — production readiness*

---

## Completed Sprints (1–25)

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
