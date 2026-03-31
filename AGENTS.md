# LESSIO — AI Operating Manual
*Current Sprint: Sprint 13*

---

## Project Overview

LESSIO is a multi-tenant SaaS platform for tutoring businesses and learning centers.
It replaces manual scheduling, billing, and WhatsApp coordination with a structured, automated system.

**Tech Stack:** Next.js 16 App Router + TypeScript (strict) | Supabase (Postgres + Auth + Edge Functions) | shadcn/ui (Nova) | Meta WhatsApp Cloud API | Vercel

---

## Current Sprint: Sprint 13 — Single Lesson Scheduling + Parent Portal + UX/UI Polish

**Sprint source of truth:** `/docs/sprint-13-scope.md` (to be created)

**Goal:**
- Admin and teacher can create single (non-recurring) lessons from the dashboard
- Parents get a dedicated web portal at `/portal/[orgId]` with WhatsApp OTP login
- Dashboard UX restructured (sidebar grouping, settings landing, loading states) before i18n work begins

**Users in scope:**
- Dashboard: owner (all) + admin (lesson creation) + teacher (lesson creation for own students)
- External: parent (portal login via phone + OTP via WhatsApp, booking, view lessons/balance)

**New env vars:**
- `PORTAL_JWT_SECRET` — signs portal session cookies (min 32 chars)
- `NEXT_PUBLIC_APP_URL` — used to build portal share URL

---

## Implementation Status

| Layer | Status |
|---|---|
| /docs baseline (plan, schema, decisions, security, sprint scopes) | ✅ Done |
| Next.js project initialized | ✅ Done |
| shadcn/ui initialized (Nova preset) | ✅ Done |
| Supabase project connected | ✅ Done |
| DB migrations (all tables) | ✅ Done (Sprint 1) |
| RLS baseline | ✅ Done (Sprint 1) |
| Booking engine (getAvailableSlots, slot locking, confirmBooking) | ✅ Done (Sprint 1) |
| Booking WebView (`/book/[token]`) | ✅ Done (Sprint 1) |
| WhatsApp webhook | ✅ Done (Sprint 1) |
| JWT booking link generator | ✅ Done (Sprint 1) |
| Seed data | ✅ Done (Sprint 1) |
| Route protection + dashboard shell | ✅ Done (Sprint 2) |
| Students CRUD | ✅ Done (Sprint 2) |
| Parents CRUD | ✅ Done (Sprint 2) |
| Parent-Student relationships | ✅ Done (Sprint 2) |
| Teachers CRUD + invite flow | ✅ Done (Sprint 2) |
| Teacher availability (weekly) | ✅ Done (Sprint 2) |
| Availability overrides | ✅ Done (Sprint 2) |
| Today view dashboard | ✅ Done (Sprint 2) |
| Weekly calendar | ✅ Done (Sprint 2) |
| Lesson status updates | ✅ Done (Sprint 2) |
| teachers.hourly_rate migration + UI | ✅ Done (Sprint 3) |
| Cancellation policy model + owner UI | ✅ Done (Sprint 3) |
| calculateCancellationCharge (pure lib + tests) | ✅ Done (Sprint 3) |
| Billing parent resolution | ✅ Done (Sprint 3) |
| Manual lesson cancellation from dashboard | ✅ Done (Sprint 3) |
| Charge engine (idempotent) | ✅ Done (Sprint 3) |
| Automatic charge on lesson completed | ✅ Done (Sprint 3) |
| Charges list UI + filters | ✅ Done (Sprint 3) |
| Mark charge as paid + note | ✅ Done (Sprint 3) |
| Parent debt summary | ✅ Done (Sprint 3) |
| Lead capture + deduplication | ✅ Done (Sprint 4) |
| Leads management list UI | ✅ Done (Sprint 4) |
| Lead conversion to parent + student | ✅ Done (Sprint 4) |
| WhatsApp cancellation intent detection + lesson selection | ✅ Done (Sprint 4) |
| Apply cancellation + charge outcome + notifications | ✅ Done (Sprint 4) |
| Build + send payment request | ✅ Done (Sprint 4) |
| Sprint 4 acceptance + regression | ✅ Done (Sprint 4) |
| Teacher calendar view | ✅ Done (Sprint 5) |
| Teacher lesson outcome update | ✅ Done (Sprint 5) |
| Route guards and server action hardening | ✅ Done (Sprint 5) |
| Org isolation and RLS validation | ✅ Done (Sprint 5) |
| UX polish on touched Sprint 5 flows | ✅ Done (Sprint 5) |
| Archive integrity / duplicate-submit / stale-state hardening | ✅ Done (Sprint 5) |
| Sprint 5 acceptance + regression | ✅ Done (Sprint 5) |
| Secret and access audit | ✅ Done (Sprint 6) |
| Structured logging + error visibility | ✅ Done (Sprint 6) |
| Graceful failure handling for external flows | ✅ Done (Sprint 6) |
| Environment separation + env validation | ✅ Done (Sprint 6) |
| Migration discipline + release checklist | ✅ Done (Sprint 6) |
| E2E scenario QA on staging | ✅ Done (Sprint 6) |
| Cross-cutting QA + Data Recovery Playbook | ✅ Done (Sprint 6) |
| First customer onboarding checklist | ✅ Done (Sprint 6) |
| First customer staging validation | ✅ Done (Sprint 6) |
| Backup and restore validation | ✅ Done (Sprint 6) |
| First customer readiness | ✅ Done (Sprint 6) |
| lesson_students junction table + lesson_type + group_pricing_mode (pre-S7 migration) | ✅ Done (Sprint 7) |
| Per-org whatsapp_phone_number_id + encrypted whatsapp_access_token (schema) | ✅ Done (Sprint 7) |
| AES-256-GCM token encryption utility (`src/lib/crypto/index.ts`) | ✅ Done (Sprint 7) |
| WHATSAPP_TOKEN_ENCRYPTION_KEY / META_APP_ID / META_APP_SECRET env validation | ✅ Done (Sprint 7) |
| Owner WhatsApp settings page + Meta Embedded Signup UI | ✅ Done (Sprint 7) |
| saveWhatsAppConnection + disconnectWhatsApp server actions | ✅ Done (Sprint 7) |
| Webhook routing cutover: phone_number_id lookup + decrypted token | ✅ Done (Sprint 7) |
| WhatsApp nav entry in sidebar | ✅ Done (Sprint 7) |
| Schema migration: organizations.payment_provider + payment_config_encrypted + charges columns | ✅ Done (Sprint 8) |
| Payment abstraction layer: PaymentProvider interface + factory.ts + cardcom.ts + payplus.ts | ✅ Done (Sprint 8) |
| Owner payment settings page + savePaymentProvider + disconnectPayment | ✅ Done (Sprint 8) |
| sendPaymentRequest updated to use factory + real payment link | ✅ Done (Sprint 8) |
| Payment webhook POST /api/payments/[provider] | ✅ Done (Sprint 8) |
| PAYMENT_CONFIG_ENCRYPTION_KEY env validation + .env.local.example | ✅ Done (Sprint 8) |
| Payment nav entry in sidebar (owner) | ✅ Done (Sprint 8) |
| Charges UI: payment_link + payment_provider display | ✅ Done (Sprint 8) |
| Schema migration: organizations.auto_send_payment_request | ✅ Done (Sprint 9) |
| KPI stats query (src/lib/dashboard/stats.ts) | ✅ Done (Sprint 9) |
| Dashboard KPI cards (monthlyRevenue, pendingDebt, lessonsThisMonth, activeStudents) | ✅ Done (Sprint 9) |
| Charges aging summary bar (pending / invoiced / paid this month) | ✅ Done (Sprint 9) |
| autoSendPaymentRequest fire-and-forget after lesson completion | ✅ Done (Sprint 9) |
| Auto payment request toggle in /settings/payment (owner) | ✅ Done (Sprint 9) |
| Schema migration: organization_holidays table + RLS | ✅ Done (Sprint 10) |
| src/lib/organizations/holidays.ts — getOrgHolidays | ✅ Done (Sprint 10) |
| /settings/holidays — holiday management page + actions (owner/admin) | ✅ Done (Sprint 10) |
| getAvailableSlots: block slots on holiday dates | ✅ Done (Sprint 10) |
| /teacher/availability — teacher self-service availability page + actions | ✅ Done (Sprint 10) |
| /teacher/overrides — teacher self-service overrides page + actions | ✅ Done (Sprint 10) |
| Sidebar: חגים וחופשות (owner/admin), הזמינות שלי + חריגים ביומן (teacher) | ✅ Done (Sprint 10) |
| Teacher schedule: holiday label in week grid | ✅ Done (Sprint 10) |
| Schema migration: lesson_series table + lessons.series_id + RLS | ✅ Done (Sprint 11) |
| src/lib/lessons/createSeries.ts — createLessonSeries (conflict detection + partial success) | ✅ Done (Sprint 11) |
| src/lib/lessons/cancelSeries.ts — cancelLessonSeries (all / from_date scopes) | ✅ Done (Sprint 11) |
| /lessons/new-series — admin form + createSeriesAction + result summary | ✅ Done (Sprint 11) |
| /lessons/[id] — SeriesBanner + cancelSeriesAction (from_date / all) | ✅ Done (Sprint 11) |
| /lessons — Repeat badge on series lessons + "יצירת שיעורים קבועים" button (owner/admin) | ✅ Done (Sprint 11) |
| Schema migration: organizations reminder columns + notification_log table + RLS | ✅ Done (Sprint 12) |
| /settings/reminders — reminder settings page + saveReminderSettings action (owner) | ✅ Done (Sprint 12) |
| Sidebar: תזכורות nav entry (owner) | ✅ Done (Sprint 12) |
| supabase/functions/lesson-reminders — hourly cron, dedup via notification_log | ✅ Done (Sprint 12) |
| supabase/functions/payment-reminders — daily 09:00 UTC cron, dedup via notification_log | ✅ Done (Sprint 12) |
| supabase/functions/_shared/crypto.ts — Deno AES-256-GCM decryption (SubtleCrypto) | ✅ Done (Sprint 12) |
| supabase/functions/_shared/whatsapp.ts — sendTextMessage for Deno | ✅ Done (Sprint 12) |
| Cron registration in config.toml (lesson-reminders + payment-reminders) | ✅ Done (Sprint 12) |
| Notification log UI — last 20 entries in /settings/reminders (owner) | ✅ Done (Sprint 12) |
| supabase/migrations/..._portal_otps.sql — portal_otps table + index + RLS | ⬜ Sprint 13 |
| src/lib/lessons/createLesson.ts — single lesson creation with full conflict checks | ⬜ Sprint 13 |
| src/lib/portal/session.ts — sign/verify portal JWT, set/get httpOnly cookie | ⬜ Sprint 13 |
| src/lib/portal/otp.ts — OTP generation, SHA-256 hash, send via WhatsApp, verify | ⬜ Sprint 13 |
| /lessons/new — admin single lesson creation page + actions + NewLessonForm | ⬜ Sprint 13 |
| /teacher/new-lesson — teacher single lesson creation page + actions | ⬜ Sprint 13 |
| /portal/[orgId]/layout.tsx — mobile-first portal shell, top bar, bottom tabs | ⬜ Sprint 13 |
| /portal/[orgId]/page.tsx — redirect to login or home based on session cookie | ⬜ Sprint 13 |
| /portal/[orgId]/login — phone entry + OTP verify, set portal_session cookie | ⬜ Sprint 13 |
| /portal/[orgId]/home — upcoming lessons + outstanding balance (server component) | ⬜ Sprint 13 |
| /portal/[orgId]/book — PortalBookingFlow + portal-scoped server actions | ⬜ Sprint 13 |
| /portal/[orgId]/payments — charges history + payment links | ⬜ Sprint 13 |
| /settings/page.tsx — settings landing page with category cards (owner/admin) | ⬜ Sprint 13 |
| Sidebar: grouped sections (Operations / Settings / Teacher) with section headers | ⬜ Sprint 13 |
| /lessons page: two CTA buttons "שיעור חד פעמי" + "שיעורים קבועים" | ⬜ Sprint 13 |
| WeekNav: "היום" button to jump to current week | ⬜ Sprint 13 |
| /lessons/loading.tsx + /dashboard/loading.tsx — skeleton loading screens | ⬜ Sprint 13 |
| proxy.ts: add /portal/* to public bypass (no Supabase session check) | ⬜ Sprint 13 |
| /settings/whatsapp: add portal URL display + copy button for owner to share | ⬜ Sprint 13 |
| PORTAL_JWT_SECRET added to .env.local.example + next.config.ts validation | ⬜ Sprint 13 |

When starting any task, check this table first.
Do not rebuild what is already marked `✅`.
Update this table after each completed story.

---

## Closed Decisions

**Decision — routing key:**
Webhook routing uses `phone_number_id` (Meta internal ID), not the display phone number.

**Decision — token storage:**
Access tokens are encrypted at the application layer with AES-256-GCM before being stored in Postgres. The encryption key is a server-only env var; plaintext is never persisted.

**Decision — secrets boundary:**
`SUPABASE_SERVICE_ROLE_KEY`, `BOOKING_JWT_SECRET`, `WHATSAPP_TOKEN_ENCRYPTION_KEY`, `META_APP_SECRET`, `PAYMENT_CONFIG_ENCRYPTION_KEY`, `PORTAL_JWT_SECRET` are server-only and must never appear in client bundles.

**Decision — privileged import path:**
Service role usage is isolated to `src/lib/supabase/service-role.ts`.

**Decision — environment validation:**
Required env vars are validated at startup and fail fast with named errors if missing.

**Decision — webhook behavior:**
Requests without valid `X-Hub-Signature-256` must return `401` before processing.

**Decision — release gate:**
Nothing ships to production without staging QA, release checklist completion, and a documented Data Recovery Playbook.

**Decision — portal auth:**
Parents authenticate to the portal via phone number + 6-digit OTP delivered via WhatsApp. Session stored as httpOnly cookie (30-day JWT). No Supabase Auth for parents.

**Decision — single lesson creation:**
Teachers create lessons directly (no admin approval step). Same conflict-check logic as series creation.

See `/docs/decisions.md` for all decisions.

---

## Technical Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 App Router, TypeScript (strict) |
| UI | React 19, Tailwind CSS 4, shadcn/ui (Nova preset) |
| Backend | Next.js Server Actions + Route Handlers |
| Database | PostgreSQL via Supabase |
| Background Jobs | Supabase Edge Functions (Deno, scheduled cron) |
| Auth (dashboard) | Supabase Auth (email/password) |
| Auth (booking WebView) | Signed JWT (jose), not Supabase session |
| Auth (parent portal) | Phone OTP → httpOnly cookie (jose JWT) |
| WhatsApp | Meta WhatsApp Cloud API |
| Payments | Abstraction layer: Cardcom + PayPlus adapters |
| Validation | Zod 4 |
| Dates | Luxon 3 |
| Icons | Lucide React |
| Testing | Vitest 4 |

---

## Repository Structure

```txt
lessio/
├── AGENTS.md                     ← this file (AI operating manual)
├── CLAUDE.md                     ← points to AGENTS.md
├── docs/
│   ├── plan.md                   ← product plan + roadmap
│   ├── schema.md                 ← DB schema (source of truth)
│   ├── decisions.md              ← architectural decisions (all sprints)
│   ├── security.md               ← RLS policies + auth model
│   ├── sprint-roadmap.md         ← full sprint roadmap (sprints 1–22)
│   ├── sprint-1-scope.md  through sprint-12-scope.md ← ✅ completed
│   └── sprint-13-scope.md        ← current sprint (to be written)
├── src/
│   ├── app/
│   │   ├── (dashboard)/          ← owner/admin/teacher pages (Supabase Auth)
│   │   │   ├── dashboard/
│   │   │   ├── students/
│   │   │   ├── parents/
│   │   │   ├── teachers/
│   │   │   ├── lessons/          ← includes new-series/ + new/ (Sprint 13)
│   │   │   ├── charges/
│   │   │   ├── leads/
│   │   │   ├── settings/         ← whatsapp/ payment/ holidays/ reminders/ page.tsx (Sprint 13)
│   │   │   └── teacher/          ← schedule/ availability/ overrides/ new-lesson/ (Sprint 13)
│   │   ├── book/
│   │   │   └── [token]/          ← parent booking WebView (JWT auth)
│   │   ├── portal/               ← Sprint 13: parent portal (cookie auth)
│   │   │   └── [orgId]/
│   │   │       ├── login/
│   │   │       ├── home/
│   │   │       ├── book/
│   │   │       └── payments/
│   │   └── api/
│   │       ├── whatsapp/webhook/ ← POST + GET (Meta verification)
│   │       └── payments/[provider]/
│   ├── lib/
│   │   ├── supabase/             ← client.ts, server.ts, service-role.ts
│   │   ├── booking/              ← getAvailableSlots, createSlotLock, confirmBooking
│   │   ├── billing/              ← calculateCancellationCharge, createCharge, autoSend
│   │   ├── lessons/              ← createSeries, cancelSeries, createLesson (Sprint 13)
│   │   ├── whatsapp/             ← Meta API client, all send functions
│   │   ├── cancellation-flow/    ← WhatsApp cancellation state machine
│   │   ├── payments/             ← registry, cardcom, payplus
│   │   ├── payment-request/      ← autoSend
│   │   ├── portal/               ← Sprint 13: session.ts, otp.ts
│   │   ├── jwt/                  ← signBookingToken, verifyBookingToken
│   │   ├── crypto/               ← AES-256-GCM encrypt/decrypt
│   │   ├── auth/                 ← session, actions
│   │   ├── organizations/        ← getOrgTimezone, holidays
│   │   ├── dashboard/            ← stats.ts (KPI queries)
│   │   └── phone/                ← normalizePhone (E.164)
│   └── components/
│       ├── ui/                   ← shadcn components (button.tsx, extend as needed)
│       ├── booking/              ← BookingFlow, AvailabilityCalendar, TeacherSelect, etc.
│       └── dashboard/            ← Sidebar, KpiCard, lesson/, availability/, etc.
├── supabase/
│   ├── migrations/               ← forward-only SQL migrations
│   ├── functions/                ← Edge Functions (lesson-reminders, payment-reminders)
│   ├── seed.sql
│   └── config.toml
└── .env.local
```

---

## Sprint 13 — What NOT to Build

- Homework module (Sprint 14)
- WhatsApp intents for balance/schedule queries (Sprint 14)
- Tax receipts / Bit / PayBox (Sprint 15)
- Custom message templates (Sprint 16)
- iCal export (Sprint 16)
- Analytics & reporting (Sprint 17)
- AI WhatsApp assistant (Sprint 19)
- Parent ability to cancel lessons from portal
- Mobile-responsive collapsible sidebar drawer
- Toast notification library (keep inline error/success states consistent with existing forms)
- Multiple reminder sends per charge (Sprint 12 already sends one)

---

## Ground Rules for All Sprints

```text
1. TypeScript strict — no `any`. Use unknown + type guards where needed.
2. SUPABASE_SERVICE_ROLE_KEY, BOOKING_JWT_SECRET, PORTAL_JWT_SECRET, WHATSAPP_TOKEN_ENCRYPTION_KEY,
   PAYMENT_CONFIG_ENCRYPTION_KEY, META_APP_SECRET must never appear in client bundles.
3. Service role is imported only from src/lib/supabase/service-role.ts.
4. All required env vars validated at startup; missing vars fail fast with named errors.
5. WhatsApp webhook requests without valid X-Hub-Signature-256 must return 401 before processing.
6. All critical flows emit structured logs with org_id and relevant entity IDs.
7. WhatsApp API failures and charge-write failures must be caught and logged; must not crash.
8. Nothing ships to production without passing staging QA first.
9. All database writes use service role; never the anon key for mutations.
10. RBAC enforced server-side on every mutation — never trust client-supplied role.
11. Validate all inputs with Zod schemas on the server before any DB write.
12. Do not render unsafe HTML. Markdown (Sprint 14+) rendered with sanitization.
13. Before coding any story: list exact files to change + explicit out-of-scope items.
14. Do not infer missing security or permission rules — stop and document a TODO instead.
```
