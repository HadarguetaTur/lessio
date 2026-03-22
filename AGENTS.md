# LESSIO — Claude Operating Manual (Sprint 2)

---

## Project Overview

LESSIO is a multi-tenant SaaS platform for tutoring businesses and learning centers.
It replaces manual scheduling, billing, and WhatsApp coordination with a structured, automated system.

**Tech Stack:** Next.js App Router + TypeScript | Supabase (Postgres + Auth) | shadcn/ui (Nova) | Meta WhatsApp Cloud API | Vercel

---

## Current Sprint: Sprint 2 — Internal Operations MVP

**Branch:** sprint-2
**Goal:** Owner/admin can fully operate the system day-to-day
**Users in scope:** owner + admin only. Teacher/parent UI = out of scope.

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
| Weekly calendar | ⬜ Sprint 2 |
| Lesson status updates | ⬜ Sprint 2 |

When starting any task, check this table first.
Do not rebuild what is already marked ✅.
Update this table after each completed story.

---

## Sprint 2 — What to Build

See `/docs/sprint-2-scope.md` for full Epics, Stories, and Definition of Done.

**Execution order:**
1. Route protection + dashboard shell
2. Students CRUD
3. Parents CRUD
4. Parent-Student relationships
5. Teachers CRUD + invite flow
6. Teacher availability (weekly)
7. Availability overrides
8. Today view
9. Weekly calendar
10. Lesson status updates
11. RTL + polish

---

## What NOT to Build in Sprint 2

- Billing / charges / charge dashboard
- PDF invoices
- Cancellation logic (billing side)
- Homework module
- Teacher portal (Sprint 5)
- Parent portal
- WhatsApp flows beyond what exists
- Leads management UI
- Payment provider integration
- Analytics / reports

---

## Closed Decisions Relevant to Sprint 2

**Decision #12 — Teacher creation:**
Invite flow only. Owner sends a Supabase Auth invite → teacher registers → owner links the profile to the teacher record.
No direct user creation.

**Decision #13 — Cancelled in Sprint 2:**
"cancelled" = status change only. No billing logic, no side effects. Sprint 3 handles that.

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

```
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
│   │   ├── (dashboard)/           ← owner/admin pages (Supabase Auth)
│   │   │   ├── students/
│   │   │   ├── parents/
│   │   │   ├── teachers/
│   │   │   ├── lessons/
│   │   │   └── dashboard/
│   │   ├── book/
│   │   │   └── [token]/           ← parent booking WebView (JWT auth only)
│   │   └── api/
│   │       └── whatsapp/
│   │           └── webhook/
│   ├── lib/
│   │   ├── supabase/              ← client.ts, server.ts, service-role.ts
│   │   ├── booking/               ← getAvailableSlots, createSlotLock, confirmBooking
│   │   ├── billing/               ← calculateCancellationCharge (Sprint 3+)
│   │   ├── whatsapp/              ← Meta API client, sendBookingLink, sendReply
│   │   ├── jwt/                   ← signBookingToken, verifyBookingToken
│   │   └── phone/                 ← normalizePhone (E.164)
│   └── components/
│       ├── ui/                    ← shadcn components (do not edit manually)
│       ├── booking/               ← booking WebView step components
│       └── dashboard/             ← dashboard-specific components
├── supabase/
│   └── migrations/
└── .env.local
```

---

## Authentication Model

### Dashboard users (Owner / Admin / Teacher)
- Supabase Auth session
- JWT claims must include: `{ sub, org_id, role }`
- Role determines RLS access — see `/docs/security.md`
- `/book/*` routes: no Supabase session middleware

### Parent booking WebView (`/book/[token]`)
- JWT verified in dedicated route-level middleware for `/book/*` only
- JWT payload: `{ organizationId, parentId, studentId, exp }`
- JWT is NOT passed to Supabase in any form

### Service role
- Used for all booking writes (slot_locks, lessons)
- Imported only from `src/lib/supabase/service-role.ts`
- Never in client components

---

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server-side only, never in client bundle
BOOKING_JWT_SECRET=               # for signing/verifying booking tokens
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=
```

---

## Key Business Rules (non-negotiable)

- `slot_locks` expire after **5 minutes**
- Booking JWT tokens expire after **15 minutes**
- All phone numbers stored and queried as **E.164** — always call `normalizePhone()` before DB write or lookup
- All datetimes stored as **UTC**, displayed per `organizations.timezone`
- Archive = `is_active = false`. Never hard delete.
- Archived entities must not appear in any booking or assignment flow
- Teacher creation = invite flow only (Decision #12)
- "cancelled" in Sprint 2 = status only, no billing (Decision #13)
- Billing parent = `is_primary = true` from `relationships`
- If student has no primary parent → lesson creation fails with error

Full schema: `/docs/schema.md` | All decisions: `/docs/decisions.md`

---

## Testing Rules

- Unit tests required for: `normalizePhone`, availability overlap validation, is_primary constraint
- Integration tests required for: dashboard auth flow, lesson status updates, teacher invite flow
- Manual verification required for: Hebrew RTL on all new screens, mobile viewport
- Do not claim a story complete without stating what was tested and how

---

## Missing or Conflicting Documentation

```
// TODO(LESSIO): Missing definition in docs for [item].
// Question: [exact question that needs answering].
```

Do not resolve conflicts by guessing. Stop and surface the TODO.

---

## Task Completion Format

```
## Task Summary: [Story name]

### What was built
- [list]

### Files changed
- [file path] — [what changed]

### Assumptions avoided
- [list]

### TODOs / Blockers
- [any TODO(LESSIO) comments added and why]

### Tests added or run
- [what was tested, how, what passed]

### Sprint 2 scope check
- [ ] All changes are within Sprint 2 scope
- [ ] No billing, cancellation logic, teacher portal, or WhatsApp flows added
- [ ] No new routes created outside dashboard shell
```

---

## Non-Negotiable Rules

1. Do not invent fields, tables, enums, routes, or business rules
2. Use only schema and naming from `/docs/schema.md`
3. If something is missing → `TODO(LESSIO)`, do not guess
4. All booking writes → service role, server-side only
5. All pages support Hebrew RTL (`dir="rtl"`)
6. Sprint 2 scope only — see `/docs/sprint-2-scope.md`
7. Do not build: billing, teacher portal, parent portal, WhatsApp flows, PDF, analytics
8. Phone numbers stored and queried as E.164 only — always use `normalizePhone()`
9. Datetimes stored as UTC, displayed per `organizations.timezone`
10. Archive = `is_active = false`, never hard delete
11. Business logic lives in `src/lib/*` — never in React components
12. Teacher creation = invite flow only
13. "cancelled" = status change only in Sprint 2, no billing side effects

---

## Sprint 2 Definition of Done

- [ ] admin/owner can create, edit, and archive a student
- [ ] admin/owner can create and edit a parent
- [ ] admin/owner can link a parent to a student
- [ ] admin/owner can create, edit, and archive a teacher (invite flow)
- [ ] admin/owner can set weekly availability for a teacher
- [ ] admin/owner can manage availability overrides
- [ ] Today view displays today's lessons correctly
- [ ] Weekly calendar works by week and by teacher filter
- [ ] Lesson status can be updated manually
- [ ] All UI in Hebrew RTL
- [ ] No critical errors in core flows
- [ ] All non-negotiable tests pass

---

## Before Writing Any Code

Read these files in order:
1. `/docs/plan.md`
2. `/docs/schema.md`
3. `/docs/decisions.md`
4. `/docs/sprint-2-scope.md`
5. `/docs/security.md`

Then confirm:
"I have read the docs. Here is my understanding of the current task: [summary].
Here is what I will build: [list]. Here is what I will not touch: [list]."