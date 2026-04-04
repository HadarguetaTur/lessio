# LESSIO — Full Sprint Roadmap
*Updated: Sprint 18 complete, Sprints 19–22 planned*

---

## Completed Sprints (1–11)

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

---

## Sprint 12 — Automated WhatsApp Reminders
**Status:** Done  
**Branch:** `sprint-12`

**Goal:** Proactive outreach — lesson reminders to parents before a lesson, and payment follow-ups on overdue charges. Both configurable per org, idempotent.

**Deliverables:**
- DB: `reminders_enabled`, `lesson_reminder_hours`, `payment_reminder_days` on `organizations`
- DB: `notification_log` table (dedup log for all automated sends)
- Supabase Edge Function: `lesson-reminders` (cron: every hour)
- Supabase Edge Function: `payment-reminders` (cron: daily 09:00 UTC)
- Dashboard: `/settings/reminders` — owner toggle + timing config + last 20 log entries

**Key files:**
- `supabase/migrations/20260330000004_reminders.sql`
- `supabase/functions/lesson-reminders/index.ts`
- `supabase/functions/payment-reminders/index.ts`
- `src/app/(dashboard)/settings/reminders/page.tsx`
- `src/app/(dashboard)/settings/reminders/actions.ts`

---

## Sprint 13 — Single Lesson Scheduling + Parent Portal + UX/UI Polish
**Status:** In Progress  
**Depends on:** Sprint 12 complete

**Goal:** Admin, teacher, and parent can all create single lessons (not just recurring series). Parents get a dedicated web portal with WhatsApp OTP login. The dashboard UX is restructured before i18n work begins.

### Story 1 — Admin: Single Lesson Creation
- New page: `/lessons/new` with form (teacher, student, date, time, duration)
- Server action validates conflicts (same checks as series: teacher overlap, student overlap, holiday, slot lock)
- `/lessons` page gets two buttons: "שיעור חד פעמי" + "שיעורים קבועים"
- New lib: `src/lib/lessons/createLesson.ts`

### Story 2 — Teacher: Single Lesson Creation
- New page: `/teacher/new-lesson` (teacher from session, selects student + date + time)
- Lesson created immediately (no approval step)
- Sidebar gains "שיעור חדש" link for teacher role

### Story 3 — Parent Portal (phone OTP)
- New DB table: `portal_otps` (phone, org_id, otp_hash, expires_at, used)
- Route group: `/portal/[orgId]/` — outside `(dashboard)`, no Supabase auth
- Login flow: phone entry → OTP sent via WhatsApp → verify → httpOnly cookie (30 days)
- Portal home: upcoming lessons + outstanding balance
- Portal book: reuses `AvailabilityCalendar` + booking lib with portal-session actions
- Portal payments: charges history + payment links
- New env: `PORTAL_JWT_SECRET`
- Portal URL displayed in `/settings/whatsapp` for owner to share

### Story 4 — UX/UI Polish
- Sidebar: grouped sections (Operations / Settings / Teacher) with visual dividers
- `/settings/page.tsx`: landing page with setting-category cards (fixes 404)
- WeekNav: "היום" button to jump to current week
- `/lessons` + `/dashboard`: `loading.tsx` skeleton screens
- `proxy.ts`: add `/portal/*` to public bypass list

**Key new files:**
- `src/lib/lessons/createLesson.ts`
- `src/lib/portal/session.ts`, `src/lib/portal/otp.ts`
- `src/app/(dashboard)/lessons/new/`
- `src/app/(dashboard)/teacher/new-lesson/`
- `src/app/portal/[orgId]/` (layout, login, home, book, payments)
- `src/app/(dashboard)/settings/page.tsx`
- `supabase/migrations/20260401000001_portal_otps.sql`

---

## Sprint 14 — Homework Module + WhatsApp Smart Intents
**Status:** Planned  
**Depends on:** Sprint 13 complete

**Goal:** Teachers send homework via WhatsApp. Parents can query their status (debt, schedule) conversationally without calling the admin.

### Story 1 — Homework Module
- DB: `homework_templates` (org_id, title, subject, body_markdown, created_by)
- DB: `homework_assignments` (template_id or ad-hoc body, student_id, teacher_id, due_date, status: pending/done/overdue)
- Dashboard: `/homework/templates` — teacher creates/edits templates
- Dashboard: `/homework/assign` — assign template or one-off to student(s)
- Delivery: WhatsApp message to student (if `students.phone` set) or primary parent
- Completion: student/parent replies "סיימתי" → status = done → teacher WhatsApp alert
- Reminder: Edge Function `homework-reminders` (cron daily) — send reminder 1 day before due_date
- Log: entries in `notification_log` (new type: `homework_reminder`)

### Story 2 — WhatsApp Parent Self-Service Intents
Extend the webhook state machine to handle incoming parent queries without human intervention:

| Intent keywords | Response |
|----------------|---------|
| "חוב" / "כמה אני חייב" / "תשלום" | Sum of pending charges + payment links (if any) |
| "שיעורים" / "מתי שיעור" / "לו״ז" | Next 3 scheduled lessons with date + time + teacher |
| "קבלה" / "היסטוריה" | Last 3 paid charges with amounts |
| "פורטל" / "כניסה" | Portal link for this org |

**Key new files:**
- `supabase/migrations/..._homework.sql`
- `src/lib/homework/`
- `src/app/(dashboard)/homework/` (templates + assign pages)
- `src/app/api/whatsapp/webhook/route.ts` (update: new intents)
- `supabase/functions/homework-reminders/index.ts`

**Schema additions:**
```sql
CREATE TABLE homework_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title           text NOT NULL,
  subject         text,
  body            text NOT NULL,
  created_by      uuid NOT NULL REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE homework_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  teacher_id      uuid NOT NULL REFERENCES teachers(id),
  student_id      uuid NOT NULL REFERENCES students(id),
  template_id     uuid REFERENCES homework_templates(id),
  body            text NOT NULL,
  due_date        date,
  status          text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'done', 'overdue')),
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

---

## Sprint 15 — Tax Receipts (חשבוניות מס) + Bit/PayBox
**Status:** Planned  
**Depends on:** Sprint 14 complete

**Goal:** Israeli legal compliance (receipts for every payment) and support for dominant Israeli payment methods (Bit, PayBox).

### Story 1 — חשבוניות ירוקות Integration
- API integration with [חשבוניות ירוקות](https://www.hashbonot.co.il) (most popular Israeli receipt provider — has REST API)
- On charge marked paid → auto-create receipt via API → store receipt URL on charge
- WhatsApp message to parent with receipt link: "קבלה על תשלום ₪[sum]: [link]"
- Dashboard: receipt link in charge detail view
- Settings: `/settings/receipts` — owner enters חשבוניות ירוקות API key (encrypted)

### Story 2 — Bit Business API
- New payment provider: `src/lib/payments/bit.ts`
- Bit Business payment link generation (using Bit's API)
- Webhook: `POST /api/payments/bit` — mark charge paid
- DB: widen `organizations.payment_provider` CHECK to include `'bit'`

### Story 3 — PayBox
- New payment provider: `src/lib/payments/paybox.ts` (PayBox has REST API)
- Same pattern as Bit

**Schema changes:**
```sql
-- Widen payment provider enum (also fixes the existing Cardcom-only constraint)
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_payment_provider_check;
ALTER TABLE organizations ADD CONSTRAINT organizations_payment_provider_check
  CHECK (payment_provider IN ('cardcom', 'payplus', 'bit', 'paybox', 'stripe'));

-- Receipt tracking on charges
ALTER TABLE charges ADD COLUMN receipt_url text;
ALTER TABLE charges ADD COLUMN receipt_issued_at timestamptz;
```

**New env vars:**
- `HASHBONOT_API_KEY` (per org, encrypted in `payment_config_encrypted` JSON)

---

## Sprint 16 — Custom Message Templates + iCal Export + Portal Receipt View
**Status:** ✅ Done
**Depends on:** Sprint 15 complete

**Goal:** Org owners can customize every WhatsApp message. Teachers get a calendar subscription URL. Both reduce support load and increase retention.

### Story 1 — Custom WhatsApp Templates
- DB: `message_templates` (org_id, type enum, body_template with `{{variables}}`)
- Types: `booking_confirmation`, `lesson_reminder`, `payment_reminder`, `payment_request`, `homework_assignment`, `homework_reminder`, `cancellation_confirmation`
- Dashboard: `/settings/message-templates` — editable list with preview
- Variable substitution: `{{parent_name}}`, `{{teacher_name}}`, `{{date}}`, `{{time}}`, `{{amount}}`, `{{payment_link}}`
- Fallback: if no custom template for a type, use system default Hebrew string
- All WhatsApp send functions updated to call `resolveTemplate(orgId, type, vars)` before sending

### Story 2 — iCal Export / Calendar Subscription
- API route: `GET /api/calendar/[token].ics` — returns valid iCal file
- Token = signed JWT with `teacherId` + `orgId` (no expiry — can be revoked by regenerating)
- Includes all `scheduled` lessons for this teacher (past 2 weeks + future 6 months)
- Teacher portal: `/teacher/calendar` — shows subscription URL + "copy link" + regenerate button
- Works with Google Calendar, Apple Calendar, Outlook ("subscribe to calendar" feature)

**Schema changes:**
```sql
CREATE TABLE message_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type            text NOT NULL,
  body_template   text NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, type)
);

ALTER TABLE teachers ADD COLUMN ical_token text; -- signed JWT, regeneratable
```

---

## Sprint 17 — Analytics & Reporting
**Status:** ✅ Done
**Depends on:** Sprint 16 complete

**Goal:** Business owners and admins get a full reports section with interactive charts, tabular data, and CSV export. KPI dashboard extended with 3 new indicators. Deprecated WhatsApp helpers deleted.

### Delivered:
- `src/lib/reports/` — data layer: revenue, lessons, debt, teachers, students
- `/reports` landing page + `דוחות` sidebar section (owner/admin)
- `/reports/revenue` — bar chart + table, configurable period
- `/reports/lessons` — grouped bar chart (scheduled vs cancelled) + table
- `/reports/debt` — tabular debt list sorted by balance desc
- `/reports/teachers` — horizontal bar chart + table
- `/reports/students` — at-risk alert block + full activity table
- `GET /api/reports/[report]` — CSV export with UTF-8 BOM for all 5 reports
- `CsvDownloadButton` + `PeriodSelector` shared client components
- KPI dashboard: 3 new cards — cancellation rate, at-risk students, new leads this month
- Story 0: deleted 11 deprecated WhatsApp send helpers from `src/lib/whatsapp/index.ts`

**New dependency:** `recharts ^3.8.1` (interactive charts)

**Schema additions:** None — all data from existing tables.

---

## Sprint 18 — Super Admin Dashboard
**Status:** ✅ Done
**Branch:** `sprint-18`

### Delivered:
- Schema: `superadmin` role, `profiles.organization_id` nullable, invariant CHECK constraint
- Session: `requireDashboardSession()` / `requireSuperAdminSession()` / `requireMutation()`
- Support mode: signed httpOnly cookie (30m TTL), `SupportModeBanner`, `StartSupportModeButton`
- Admin shell: `(admin)` route group, dark `AdminSidebar`, `AdminHeader` with Platform Admin label
- `/admin/dashboard` — platform KPIs, needs-setup list, recently-active orgs
- `/admin/orgs` — list with search/status/missingSetup filters, derived status (`needs_setup / active / inactive`)
- `/admin/orgs/new` — 7-step resilient org creation with compensating rollback
- `/admin/orgs/[id]` — org detail view + settings edit form
- `/admin/billing` — billing readiness table (per-org payment/receipt/revenue data)
- `SUPPORT_SESSION_SECRET` env var added to `ALWAYS_REQUIRED`
- Tests: 227/227 passing (19 new tests added)

---

## Sprint 19 — AI WhatsApp Assistant
**Status:** Planned
**Branch:** `sprint-19`
**Depends on:** Sprint 18 complete

**Goal:** When no known intent is matched in the WhatsApp webhook, an AI assistant answers contextually and naturally, dramatically reducing admin support overhead.

### Architecture:
- After existing intent checks all return false → call `aiAssistant(orgId, parentId, message)`
- OpenAI GPT-4o-mini (cheap, fast) with system prompt including:
  - Org name, timezone, teacher names
  - Parent's name, their students, upcoming lessons, outstanding balance
  - Allowed actions: answer questions, give lesson schedule, give balance, redirect to portal
  - Forbidden actions: cannot create/cancel lessons, cannot process payments, cannot make promises
- Response sent back via WhatsApp
- Log conversation in `conversation_log` table (for review + training)
- Safety: max 3 AI replies per conversation window; after 3 → "לפרטים נוספים, פנה/י לבית הספר ישירות"
- Owner dashboard: `/settings/ai-assistant` — toggle on/off, view conversation logs

**New env vars:**
- `OPENAI_API_KEY` (per platform — not per org in MVP)

**Schema additions:**
```sql
CREATE TABLE conversation_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  parent_id       uuid REFERENCES parents(id),
  phone           text NOT NULL,
  role            text NOT NULL CHECK (role IN ('parent', 'assistant')),
  content         text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE organizations ADD COLUMN ai_assistant_enabled boolean NOT NULL DEFAULT false;
```

---

## Sprint 20 — i18n Infrastructure + English
**Status:** Planned  
**Depends on:** Sprint 19 complete

**Goal:** Lay the infrastructure for multi-language before international expansion. Extract all Hebrew strings to translation keys, add English as the first additional language.

### Architecture:
- Adopt `next-intl` (standard for Next.js App Router i18n)
- Route structure: `/[locale]/(dashboard)/...` — locale prefix in URL
- Translation files: `messages/he.json`, `messages/en.json`
- All hardcoded Hebrew strings extracted to translation keys
- RTL/LTR: `dir` attribute set per locale in layout (`he` → RTL, `en` → LTR)
- WhatsApp messages: `message_templates` (Sprint 16) already supports custom per-org text; system defaults also move to locale-aware strings
- Locale selector in user settings

### Scope of this sprint:
- i18n infrastructure setup (next-intl, locale routing, `[locale]` segments)
- Hebrew string extraction to `messages/he.json` (no visible change for Hebrew users)
- English translation (`messages/en.json`) — full UI coverage
- **Not in this sprint:** Arabic (deferred — add only when there is a concrete customer requirement)

**New dependency:** `next-intl`

---

## Sprint 21 — SaaS Billing (Charging Your Customers)
**Status:** Planned  
**Depends on:** Sprint 20 complete

**Goal:** LESSIO itself has a subscription engine. Customers pay you automatically. Replaces manual invoicing.

### Features:
- Stripe Billing integration (Stripe is the standard for SaaS)
- Plans: Basic (1 teacher, up to 50 lessons/month), Pro (unlimited teachers + lessons), Enterprise (custom)
- Per-org subscription tracked in `subscriptions` table
- Super Admin (`/admin/billing`) sees subscription status per org
- Stripe webhook: update subscription status on payment failure/success
- Trial period: 14 days (new org gets `trial_ends_at` in `organizations`)
- Paywall: when trial expired and no active subscription → dashboard shows upgrade prompt, booking WebView still works (don't break parents mid-lesson)
- Receipts to org owners via Stripe (automatic)

**Schema additions:**
```sql
ALTER TABLE organizations
  ADD COLUMN trial_ends_at      timestamptz,
  ADD COLUMN stripe_customer_id text,
  ADD COLUMN subscription_status text
    CHECK (subscription_status IN ('trial', 'active', 'past_due', 'cancelled'))
    NOT NULL DEFAULT 'trial';

CREATE TABLE subscription_plans (
  id           text PRIMARY KEY, -- 'basic', 'pro', 'enterprise'
  name         text NOT NULL,
  price_monthly numeric NOT NULL,
  stripe_price_id text NOT NULL
);
```

**New env vars:**
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`

---

## Sprint 22 — International Launch Readiness
**Status:** Planned  
**Depends on:** Sprint 21 complete

**Goal:** Everything needed to legally and technically operate in the EU and English-speaking markets (UK, Australia, US).

### Story 1 — GDPR Compliance
- Privacy policy page per org (generated from template, org fills in contact details)
- Cookie consent banner (non-EU users exempt)
- Right to deletion: parent can request data deletion from portal → creates deletion request ticket in admin
- Data export: admin can export all data for a parent (JSON)
- Data retention policy: `organization.data_retention_days` — auto-anonymize old lessons after N days (Edge Function)

### Story 2 — English Translation + Locale Routing
- Complete `messages/en.json` (using Sprint 20 infrastructure)
- Locale auto-detection from browser `Accept-Language` header on first visit
- English becomes default for non-IL orgs

### Story 3 — International Payment Methods
- Stripe provider (Sprint 21 adds billing; this sprint adds Stripe as a payment provider for lesson charges)
  - `src/lib/payments/stripe.ts` implementing `PaymentProvider` interface
  - Stripe Checkout or Payment Links for parent payments
- SEPA Direct Debit support via Stripe (EU market)
- PayPal option (US/AU market)

### Story 4 — WhatsApp Template Messages (Meta Approval)
Currently the system uses "session messages" (valid only if parent messaged within 24h). For proactive messages to users who haven't messaged recently, Meta requires **approved Message Templates**.
- Submit Hebrew + English + Arabic templates to Meta for approval
- Implement template message type in WhatsApp send functions (currently all `type: 'text'`)
- Fallback: if session expired → send template; if within session → send text

---

## Full Roadmap Summary

| Sprint | Theme | Primary Value |
|--------|-------|---------------|
| 12 | Automated Reminders | Reduces missed lessons + payment delays |
| 13 ▶ | Single Scheduling + Parent Portal | Operational completeness; parent self-service |
| 14 | Homework + WhatsApp Intents | Deepest daily-use differentiator |
| 15 | Tax Receipts + Bit/PayBox | Israeli legal compliance + payment conversion | ✅ Done |
| 16 | Custom Templates + iCal + Portal Receipts | Brand customization + teacher retention + parent UX | ✅ Done |
| 17 | Analytics & Reporting | Business owner visibility + accountant exports | ✅ Done |
| 18 | Super Admin Dashboard | Platform scalability (5+ customers) | ✅ Done |
| 19 | AI WhatsApp Assistant | Zero-admin parent support |
| 20 | i18n + English | Infrastructure + English for international launch prep |
| 21 | SaaS Billing | Automated revenue from your own customers |
| 22 | International Launch | EU + English-speaking markets |

---

## Competitive Moat (by sprint)

After Sprint 14: **No Israeli competitor offers WhatsApp-native scheduling + homework + payment in one system.**  
After Sprint 15: **Full legal compliance + Bit support = enterprise sales-ready.**  
After Sprint 19: **AI assistant eliminates admin overhead — parents never need to call.**  
After Sprint 22: **International-grade product, ready for UK/AU tutoring market.**

---

## Architectural Principles (frozen)

These do not change across any sprint:
- All state in Supabase Postgres; no external state stores
- Service role key: server-side only, never in client bundles
- All secrets: server-only env vars, validated at startup
- WhatsApp: one number per org (Embedded Signup) — never a shared number
- Payments: abstraction layer (`PaymentProvider` interface) — providers are plug-in
- Billing: always on primary parent (`is_primary = true` from `relationships`)
- Dates: stored UTC, displayed in org timezone (Luxon)
- RLS: enabled on all tables; service role used only where explicitly required
