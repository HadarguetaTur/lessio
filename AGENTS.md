# LESSIO — Claude Operating Manual (Sprint 5)

---

## Project Overview

LESSIO is a multi-tenant SaaS platform for tutoring businesses and learning centers.
It replaces manual scheduling, billing, and WhatsApp coordination with a structured, automated system.

**Tech Stack:** Next.js App Router + TypeScript | Supabase (Postgres + Auth) | shadcn/ui (Nova) | Meta WhatsApp Cloud API | Vercel

---

## Current Sprint: Sprint 5 — Controlled Multi-Role Product

**Branch:** sprint-5
**Goal:**
- give teacher users a safe view of their own schedule only
- allow teachers to update only their own lesson outcome to `completed` or `no_show`
- harden route guards, server actions, and RLS for owner/admin/teacher boundaries
- validate org isolation and prevent cross-org leakage
- polish touched operational screens and harden duplicate-submit / archive-integrity paths

**Users in scope:**
- Dashboard users: owner + admin + teacher
- External users: none new in Sprint 5
- Sprint 4 external WhatsApp flows remain in regression scope only

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
| Booking WebView (/book/[token]) | ✅ Done (Sprint 1) |
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
| Sprint 5 scope defined | ✅ Done |
| Teacher calendar view (`DEV-78`) | ✅ Done (Sprint 5) |
| Teacher lesson outcome update (`DEV-79`) | ✅ Done (Sprint 5) |
| Route guards and server action hardening (`DEV-80`) | ✅ Done (Sprint 5) |
| Org isolation and RLS validation (`DEV-81`) | ✅ Done (Sprint 5) |
| UX polish on touched Sprint 5 flows (`DEV-82`) | ✅ Done (Sprint 5) |
| Archive integrity / duplicate-submit / stale-state hardening (`DEV-83`) | ✅ Done (Sprint 5) |
| Sprint 5 acceptance + regression (`DEV-72`) | ✅ Done (Sprint 5) |

When starting any task, check this table first.
Do not rebuild what is already marked ✅.
Update this table after each completed story.

---

## Sprint 1-4 Closure Gates

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

---

## Sprint 5 — What to Build

See `/docs/sprint-5-scope.md` for full Epics, Stories, and Definition of Done.

**Execution order:**
1. Teacher Experience
2. Authorization Hardening
3. UX Polish
4. Data Integrity Hardening
5. Acceptance + Regression Pass

---

## What NOT to Build in Sprint 5

- Parent portal
- Advanced analytics
- Invoices
- Advanced org settings
- New roles
- Multi-language beyond Hebrew
- Billing rule redesign
- Booking flow redesign
- New product features of any kind

---

## Closed Decisions Relevant to Sprint 5

**Decision — sequencing:**
Teacher experience must exist before authorization hardening is finalized.

**Decision — teacher write scope:**
Teacher can update only `completed` / `no_show` on their own lessons. Nothing else.

**Decision — teacher access boundaries:**
Teacher cannot access billing, charges, cancellation logic, people management, or other teachers' data.

**Decision — trusted auth context:**
`teacher_id` and `org_id` must be derived from trusted auth/profile context, never request body or client input.

**Decision — wrong-org behavior:**
Valid resources from another organization must return `403`, not `404`.

**Decision — regression boundary:**
Sprint 5 must preserve Sprint 3 charge behavior and Sprint 4 WhatsApp cancellation behavior.

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
│   ├── sprint-5-scope.md          ← current source of truth
│   └── sprint-6-scope.md
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

## Ground Rules for Claude Code — Sprint 5

```text
You are building LESSIO Sprint 5 — Controlled Multi-Role Product.

Rules:
1. Teacher can only update: completed / no_show on own lessons. Nothing else.
2. Teacher cannot access: billing, charges, cancellation logic, people management, or other teachers' data.
3. Teacher isolation must be enforced server-side and validated with URL manipulation tests.
4. teacher_id is resolved from trusted auth/profile context — never trusted from client input.
5. Valid resource from another org must return 403, not 404.
6. org_id must be derived from trusted auth context in every server action — never from request body.
7. Archive = is_active = false. Archived entities cannot be used in booking, assignment, or active selection flows.
8. Duplicate-submit protection must exist at server action level where repeated submissions could create duplicates or duplicate side effects.
9. Marking completed must preserve the existing approved Sprint 3 charge behavior. Do not redefine billing rules.
10. Do not build: parent portal, advanced analytics, invoices, advanced org settings, multi-language, or any new features.
11. All user-facing validation/success/error messages in touched Sprint 5 flows must be in Hebrew.
12. All touched Sprint 5 screens must pass a basic mobile viewport and RTL sanity check.
13. Before starting any Sprint 5 story, read /docs/schema.md, /docs/decisions.md, /docs/security.md, and /docs/sprint-5-scope.md.
14. Before coding any story: summarize the task in 3-6 bullets, list exact files likely to change, and list explicit out-of-scope items.
15. Do not infer missing permissions or business rules. If a rule is missing, stop and add a TODO instead of inventing behavior.
16. Do not rewrite Sprint 1 booking flow, Sprint 3 billing/charge rules, or Sprint 4 WhatsApp logic unless a specific verified regression fix is required.
```