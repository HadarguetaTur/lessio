# LESSIO — Claude Operating Manual (Sprint 4)

---

## Project Overview

LESSIO is a multi-tenant SaaS platform for tutoring businesses and learning centers.  
It replaces manual scheduling, billing, and WhatsApp coordination with a structured, automated system.

**Tech Stack:** Next.js App Router + TypeScript | Supabase (Postgres + Auth) | shadcn/ui (Nova) | Meta WhatsApp Cloud API | Vercel

---

## Current Sprint: Sprint 4 — External User Workflows

**Branch:** sprint-4  
**Goal:** Expose core external workflows:
- unrecognized WhatsApp sender becomes a lead
- lead can be managed and converted
- parent can cancel via WhatsApp
- owner/admin can send payment request via WhatsApp

**Users in scope:**
- Dashboard users: owner + admin
- External users: parent via WhatsApp, unrecognized sender via WhatsApp

---

## Implementation Status

| Layer | Status |
|---|---|
| /docs baseline (plan, schema, decisions, security, sprint scopes) | ✅ Done |
| Next.js project initialized | ✅ Done |
| shadcn/ui initialized (Nova preset) | ✅ Done |
| Supabase project connected | ✅ Done |
| DB migrations (all tables) | ✅ Done (Sprint 1) |
| RLS policies | ✅ Done (Sprint 1) |
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
| Sprint 4 scope defined | ✅ Done |
| Sprint 4 implementation | ⏳ Not started |

When starting any task, check this table first.  
Do not rebuild what is already marked ✅.  
Update this table after each completed story.

---

## Sprint 1-3 Closure Gates

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

---

## Sprint 4 — What to Build

See `/docs/sprint-4-scope.md` for full Epics, Stories, and Definition of Done.

**Execution order:**
1. Leads epic
2. Lead capture + deduplication
3. Leads management list
4. Lead conversion to parent + student
5. WhatsApp cancellation epic
6. Intent detection + lesson selection
7. Apply cancellation + charge outcome + notifications
8. Payment request epic
9. Build + send payment request
10. Acceptance + regression

---

## What NOT to Build in Sprint 4

- AI/NLP intent detection
- Payment provider integration
- Parent portal
- Teacher portal
- Automated/scheduled payment reminders
- Bulk payment requests
- Waive charge via WhatsApp
- Leads from sources other than WhatsApp
- Cancellation beyond 7 days ahead
- One lead to multiple students conversion
- Analytics / reports
- PDF invoices

---

## Closed Decisions Relevant to Sprint 4

**Decision — WhatsApp intent detection:**  
Keyword matching only. No AI/LLM/NLP.

**Decision — Cancellation timeout:**  
Timeout = 10 minutes.

**Decision — Cancellation engine reuse:**  
`calculateCancellationCharge()` must be reused from Sprint 3. Never reimplement it.

**Decision — Invalid input behavior:**  
Invalid input returns error + list again. It does not close the flow.

**Decision — Lead conversion scope:**  
One lead converts to one parent + one student only in Sprint 4.

**Decision — Payment request scope:**  
Payment request includes pending charges only. No payment provider integration.

**Decision — Idempotency:**  
Cancellation and payment request resend behavior must be idempotent.

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
| Auth (booking WebView) | Signed JWT — NOT Supabase session |
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
│   ├── sprint-4-scope.md
│   ├── sprint-5-scope.md
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