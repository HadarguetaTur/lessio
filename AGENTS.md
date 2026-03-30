# LESSIO — Claude Operating Manual (Sprint 8)

---

## Project Overview

LESSIO is a multi-tenant SaaS platform for tutoring businesses and learning centers.
It replaces manual scheduling, billing, and WhatsApp coordination with a structured, automated system.

**Tech Stack:** Next.js App Router + TypeScript | Supabase (Postgres + Auth) | shadcn/ui (Nova) | Meta WhatsApp Cloud API | Vercel

---

## Current Sprint: Sprint 8 — Real Payments (Multi-Provider)

**Sprint source of truth:** `/docs/sprint-8-scope.md`

**Goal:**
- Every org configures its own payment provider via `/settings/payment` (owner-only)
- Provider credentials encrypted at rest (AES-256-GCM, reusing `src/lib/crypto/index.ts`)
- Payment abstraction layer: `PaymentProvider` interface + `factory.ts` + Cardcom adapter
- `sendPaymentRequest` generates a real Cardcom payment link and sends it via WhatsApp
- Cardcom webhook updates `charge.status = 'paid'` automatically after payment

**Users in scope:**
- Dashboard users: owner (new payment settings page), admin (send payment request), teacher (no new permissions)
- External: Cardcom webhook POST `/api/payments/cardcom`

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
| Teacher calendar view (`DEV-78`) | ✅ Done (Sprint 5) |
| Teacher lesson outcome update (`DEV-79`) | ✅ Done (Sprint 5) |
| Route guards and server action hardening (`DEV-80`) | ✅ Done (Sprint 5) |
| Org isolation and RLS validation (`DEV-81`) | ✅ Done (Sprint 5) |
| UX polish on touched Sprint 5 flows (`DEV-82`) | ✅ Done (Sprint 5) |
| Archive integrity / duplicate-submit / stale-state hardening (`DEV-83`) | ✅ Done (Sprint 5) |
| Sprint 5 acceptance + regression (`DEV-72`) | ✅ Done (Sprint 5) |
| Sprint 6 scope defined | ✅ Done |
| Secret and access audit (`DEV-84`) | ✅ Done (Sprint 6) |
| Structured logging + error visibility (`DEV-85`) | ✅ Done (Sprint 6) |
| Graceful failure handling for external flows (`DEV-92`) | ✅ Done (Sprint 6) |
| Environment separation + env validation (`DEV-106`) | ✅ Done (Sprint 6) |
| Migration discipline + release checklist (`DEV-107`) | ✅ Done (Sprint 6) |
| E2E scenario QA on staging (`DEV-109`) | ✅ Done (Sprint 6) |
| Cross-cutting QA + Data Recovery Playbook (`DEV-110`) | ✅ Done (Sprint 6) |
| First customer onboarding checklist (`DEV-88`) | ✅ Done (Sprint 6) |
| First customer staging validation (`DEV-89`) | ✅ Done (Sprint 6) |
| Backup and restore validation (`DEV-91`) | ✅ Done (Sprint 6) |
| First customer readiness (`DEV-73`) | ✅ Done (Sprint 6) |
| lesson_students junction table + lesson_type + group_pricing_mode (pre-S7 migration) | ✅ Done (Sprint 7) |
| Per-org whatsapp_phone_number_id + encrypted whatsapp_access_token (schema) | ✅ Done (Sprint 7) |
| AES-256-GCM token encryption utility (`src/lib/crypto/index.ts`) | ✅ Done (Sprint 7) |
| WHATSAPP_TOKEN_ENCRYPTION_KEY / META_APP_ID / META_APP_SECRET env validation | ✅ Done (Sprint 7) |
| Owner WhatsApp settings page + Meta Embedded Signup UI | ✅ Done (Sprint 7) |
| saveWhatsAppConnection + disconnectWhatsApp server actions | ✅ Done (Sprint 7) |
| Webhook routing cutover: phone_number_id lookup + decrypted token | ✅ Done (Sprint 7) |
| WhatsApp nav entry in sidebar | ✅ Done (Sprint 7) |
| Staging QA docs updated with Sprint 7 deferred tests | ✅ Done (Sprint 8) |
| Schema migration: organizations.payment_provider + payment_config_encrypted + charges columns | ✅ Done (Sprint 8) |
| Payment abstraction layer: PaymentProvider interface + factory.ts + cardcom.ts | ✅ Done (Sprint 8) |
| Owner payment settings page + savePaymentProvider + disconnectPayment | ✅ Done (Sprint 8) |
| sendPaymentRequest updated to use factory + real Cardcom link | ✅ Done (Sprint 8) |
| Cardcom webhook POST /api/payments/cardcom | ✅ Done (Sprint 8) |
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
| src/lib/lessons/index.ts — series_id added to LESSON_SELECT + Lesson type | ✅ Done (Sprint 11) |
| /lessons/new-series — admin form + createSeriesAction + result summary | ✅ Done (Sprint 11) |
| /lessons/[id] — SeriesBanner + cancelSeriesAction (from_date / all) | ✅ Done (Sprint 11) |
| /lessons — Repeat badge on series lessons + "יצירת שיעורים קבועים" button (owner/admin) | ✅ Done (Sprint 11) |

When starting any task, check this table first.
Do not rebuild what is already marked `✅`.
Update this table after each completed story.

---

## Sprint 1-5 Closure Gates

- [x] Automated test suite is green
- [x] Production build passes
- [x] Booking availability tests are deterministic and cover expired-lock behavior
- [x] Charge creation is covered for success, retry/idempotency, missing rate, and missing billing parent
- [x] Dashboard auth session and route protection have automated coverage
- [x] Runtime smoke check confirms unauthenticated `/dashboard` requests land on `/login`
- [x] Runtime auth check confirms Supabase `role=authenticated` and LESSIO `app_role` is present
- [x] Teacher invite flow has automated coverage
- [x] Sprint 1 WhatsApp limitations are documented explicitly instead of left as open TODOs
- [x] Auth / RLS docs reflect the custom `app_role` claim model
- [x] Sprint 4 acceptance + regression passed
- [x] Sprint 5 teacher access boundaries are documented and locked

---

## Current Sprint: Sprint 10 — Teacher Self-Service Availability + Org Holidays

See `/docs/sprint-10-scope.md` for full stories and Definition of Done.

**Stories (all completed):**
- Story 1: Schema migration — organization_holidays table + RLS
- Story 2: Holiday management — /settings/holidays page + actions + getOrgHolidays lib
- Story 3: getAvailableSlots: block slots on holiday dates
- Story 4: /teacher/availability — teacher self-service availability page + actions
- Story 5: /teacher/overrides — teacher self-service overrides page + actions
- Story 6: Sidebar nav — חגים וחופשות (owner/admin), הזמינות שלי + חריגים ביומן (teacher)
- Story 7: Teacher schedule — holiday label in week grid

---

## What NOT to Build in Sprint 10

- Teacher requesting time off (approval workflow)
- Substitute teacher assignment
- Room/resource scheduling
- Admin notification when teacher updates availability
- Recurring lessons (Sprint 11)
- Automated reminders (Sprint 12)

---

## Closed Decisions Relevant to Sprint 7

**Decision — routing key:**
Webhook routing uses `phone_number_id` (Meta internal ID), not the display phone number. The display number can change; the ID is stable.

**Decision — token storage:**
Access tokens are encrypted at the application layer with AES-256-GCM before being stored in Postgres. The encryption key is a server-only env var; plaintext is never persisted.

**Decision — legacy columns:**
`organizations.whatsapp_number` and `organizations.whatsapp_token` are kept but deprecated. They are ignored after the routing cutover and will be dropped in a future cleanup migration.

**Decision — secrets boundary:**
`SUPABASE_SERVICE_ROLE_KEY`, `BOOKING_JWT_SECRET`, `WHATSAPP_TOKEN_ENCRYPTION_KEY`, `META_APP_SECRET` remain server-only and must never appear in client bundles.

**Decision — privileged import path:**
Service role usage is isolated to `src/lib/supabase/service-role.ts`.

**Decision — environment validation:**
Required env vars are validated at startup and fail fast with named errors if missing.

**Decision — webhook behavior:**
Requests without valid `X-Hub-Signature-256` must return `401` before processing.

**Decision — release gate:**
Nothing ships to production without staging QA, release checklist completion, and a documented Data Recovery Playbook.

See `/docs/decisions.md` for all decisions.

---

## Technical Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14+ App Router, TypeScript |
| UI | React, Tailwind CSS, shadcn/ui (Nova preset) |
| Backend | Next.js Route Handlers + Server Actions |
| Database | PostgreSQL via Supabase |
| Auth (dashboard) | Supabase Auth |
| Auth (booking WebView) | Signed JWT, not Supabase session |
| WhatsApp | Meta WhatsApp Cloud API |
| Icons | Lucide (via shadcn Nova) |
| Font | Geist (via shadcn Nova) |

---

## Repository Structure

```txt
lessio/
├── CLAUDE.md
├── docs/
│   ├── plan.md
│   ├── schema.md
│   ├── decisions.md
│   ├── security.md
│   ├── sprint-1-scope.md
│   ├── sprint-2-scope.md
│   ├── sprint-3-scope.md
│   ├── sprint-4-scope.md          ← completed
│   ├── sprint-5-scope.md          ← completed
│   └── sprint-6-scope.md          ← current source of truth
├── src/
│   ├── app/
│   │   ├── (dashboard)/
│   │   ├── book/
│   │   └── api/
│   │       └── whatsapp/
│   │           └── webhook/
│   ├── lib/
│   │   ├── supabase/
│   │   ├── booking/
│   │   ├── billing/
│   │   ├── whatsapp/
│   │   ├── jwt/
│   │   └── phone/
│   └── components/
├── supabase/
│   └── migrations/
└── .env.local
```

---

## Ground Rules for Claude Code — Sprint 6

```text
You are building LESSIO Sprint 6 — Production Readiness.

Rules:
1. No new features. No new UI unless a narrow readiness fix strictly requires it.
2. Preserve Sprint 1-5 business behavior unless fixing a verified regression or readiness blocker.
3. SUPABASE_SERVICE_ROLE_KEY must never appear in any client bundle or client component.
4. BOOKING_JWT_SECRET must never be exposed client-side.
5. Service role is imported only from src/lib/supabase/service-role.ts.
6. All required env vars are validated at startup; missing vars fail fast with named errors.
7. WhatsApp webhook requests without valid X-Hub-Signature-256 must return 401 before processing.
8. All critical flows must produce structured, actionable logs with org_id and relevant entity IDs when available.
9. WhatsApp API failures and charge-write failures must be caught and logged; they must not crash the system.
10. All E2E smoke tests run on staging, not local only.
11. Nothing ships to production without passing staging first.
12. Data Recovery Playbook must exist before go-live sign-off.
13. Do not add external monitoring services, CI/CD automation, or new integrations in Sprint 6.
14. Before starting any Sprint 6 story, read /docs/schema.md, /docs/decisions.md, /docs/security.md, and /docs/sprint-6-scope.md.
15. Before coding any story: summarize the task in 3-6 bullets, list exact files likely to change, and list explicit out-of-scope items.
16. Do not infer missing security, release, or permission rules. If a rule is missing, stop and add a TODO instead of inventing behavior.
```