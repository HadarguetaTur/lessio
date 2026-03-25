# LESSIO — Claude Operating Manual (Sprint 6)

---

## Project Overview

LESSIO is a multi-tenant SaaS platform for tutoring businesses and learning centers.
It replaces manual scheduling, billing, and WhatsApp coordination with a structured, automated system.

**Tech Stack:** Next.js App Router + TypeScript | Supabase (Postgres + Auth) | shadcn/ui (Nova) | Meta WhatsApp Cloud API | Vercel

---

## Current Sprint: Sprint 6 — Production Readiness

**Sprint source of truth:** `/docs/sprint-6-scope.md`

**Goal:**
- perform a secrets and privileged-access audit before release
- add structured logging and graceful failure handling to critical flows
- separate `dev` / `staging` / `prod` expectations and validate env vars at startup
- verify end-to-end behavior on staging before any production sign-off
- document recovery, release, and first-customer onboarding procedures

**Users in scope:**
- Dashboard users: owner + admin + teacher (no new permissions)
- External users: none new in Sprint 6
- Parent WhatsApp and booking WebView flows remain in regression and readiness scope only

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
| Secret and access audit (`DEV-68a`) | ⏳ Planned |
| Structured logging + error visibility (`DEV-68b`) | ⏳ Planned |
| Environment separation + env validation (`DEV-69a`) | ⏳ Planned |
| Migration discipline + release checklist (`DEV-69b`) | ⏳ Planned |
| E2E scenario QA on staging (`DEV-70a`) | ⏳ Planned |
| Cross-cutting QA + Data Recovery Playbook (`DEV-70b`) | ⏳ Planned |
| First customer readiness (`DEV-73`) | ⏳ Planned |

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

## Sprint 6 — What to Build

See `/docs/sprint-6-scope.md` for full Epics, Stories, and Definition of Done.

**Execution order:**
1. Security & Reliability
2. Environments & Release
3. QA & Go-Live Validation
4. First Customer Readiness

---

## What NOT to Build in Sprint 6

- New features of any kind
- New roles or permission expansion
- Large redesigns
- Payment provider integration
- Full analytics suite
- CI/CD automation
- External monitoring services
- Billing rule redesign
- Booking flow redesign

---

## Closed Decisions Relevant to Sprint 6

**Decision — scope boundary:**
Sprint 6 is for audit, hardening, verification, and launch readiness only. No new product scope.

**Decision — secrets boundary:**
`SUPABASE_SERVICE_ROLE_KEY` and `BOOKING_JWT_SECRET` remain server-only and must never appear in client bundles.

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