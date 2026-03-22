# LESSIO — Claude Operating Manual (Sprint 1)

---

## Project Overview

LESSIO is a multi-tenant SaaS platform for tutoring businesses and learning centers.
It replaces manual scheduling, billing, and WhatsApp coordination with a structured,
automated system.

**Primary actors in Sprint 1:** org owner, teacher, parent (via WhatsApp)

**Sprint 1 delivers exactly one end-to-end flow:**
WhatsApp entry → signed booking link → parent WebView →
teacher / date / duration / slot selection → slot lock → lesson creation → WhatsApp confirmation

Nothing outside this flow is built in Sprint 1.

---

## Current Implementation Status

| Layer | Status |
|---|---|
| /docs baseline (plan, schema, decisions, security, sprint scope) | ✅ Approved |
| Jira breakdown (DEV-7 through DEV-12) | ✅ Done |
| Next.js project initialized | ✅ Done |
| shadcn/ui initialized (Nova preset) | ✅ Done |
| src/ migration + tsconfig @/* alias | ✅ Done (DEV-7) |
| Directory skeleton (app, lib, components, supabase/migrations) | ✅ Done (DEV-7) |
| Supabase clients (client, server, service-role) | ✅ Done (DEV-7) |
| Middleware (session refresh; /book/* excluded) | ✅ Done (DEV-7) |
| Vitest configured | ✅ Done (DEV-7) |
| .env.local.example | ✅ Done (DEV-7) |
| Supabase project connected | ⬜ Not yet |
| DB migrations | ✅ Done (DEV-8) |
| RLS policies | ✅ Done (DEV-8) |
| Booking engine (getAvailableSlots, slot locking) | ✅ Done (DEV-9) |
| Booking WebView (/book/[token]) | ✅ Done (DEV-10) |
| WhatsApp webhook | ✅ Done (DEV-11) |
| JWT booking link generator | ✅ Done (DEV-11) |
| Seed data | ✅ Done (DEV-8) |

When starting any task, check this table first.
Do not rebuild what is already marked ✅.
Update this table after each completed story.

---

## Sprint 1 — Exact Success Flow

The system must prove this path and nothing else:

1. Parent sends a WhatsApp message with booking intent
2. Backend identifies parent by E.164 phone in `parents` table
3. If parent not found → create `leads` record + notify admin + send fixed WhatsApp reply. Stop.
4. If parent found → generate signed JWT (15 min expiry): `{ organizationId, parentId, studentId }`
   - `studentId` must be explicitly provided or resolved per documented logic only
   - If parent has multiple students: stop and raise `TODO(LESSIO)` — do not assume which student to select
5. Send booking link to parent via Meta WhatsApp Cloud API
6. Parent opens `/book/[token]` — server validates JWT on page load
7. Parent selects: **teacher** (from org's active teachers) → **date** → **duration** → **available slot**
   - Duration options are defined in `docs/sprint-1-scope.md`. Do not invent or assume other values.
   - `getAvailableSlots()` called after teacher + date + duration are all selected
8. System creates `slot_locks` record (`status: active`, expires in 5 min)
9. Parent confirms booking within 5 minutes
10. System creates `lessons` record (`status: scheduled`) via service role
11. `slot_locks.status` → `consumed`
12. Confirmation message sent to parent via Meta WhatsApp Cloud API

**If JWT expires:** parent must request new link from WhatsApp
**If slot lock expires:** parent must re-select a slot; slot becomes available again

---

## Jira is the Execution Source of Truth

- Do not implement any feature without a mapped Jira story
- If code changes do not map to a current Sprint 1 story, stop
- Every implementation decision must trace back to a story in DEV-7 through DEV-12
- If a Jira story seems to require something not in `/docs`, add a TODO and ask — do not guess

### Jira Update Rules (standing, non-negotiable)

After completing any story or sub-task:
1. Immediately transition the matching Jira ticket to **Done** — do not wait to be asked
2. Add a short completion comment to the ticket describing what was implemented
3. If work is only partially complete, keep the ticket open and add a progress comment instead
4. Jira project: `hadart20.atlassian.net` | cloudId: `df1530c3-9083-4b16-aa0c-1aa44a24d21d`

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
| Payments | Abstraction layer only — no implementation in Sprint 1 |
| Background Jobs | Supabase Edge Functions — Sprint 2+ only |
| Icons | Lucide (via shadcn Nova) |
| Font | Geist (via shadcn Nova) |

**No microservices. No Docker required. No LLM integration in Sprint 1.**

---

## Repository Structure

```
lessio/
├── CLAUDE.md
├── AGENTS.md
├── vitest.config.ts
├── .env.local.example             ← copy to .env.local and fill in values
├── docs/
│   ├── plan.md
│   ├── schema.md
│   ├── decisions.md
│   ├── sprint-1-scope.md
│   └── security.md
├── src/
│   ├── middleware.ts              ← session refresh; /book/* bypassed entirely
│   ├── app/
│   │   ├── (dashboard)/          ← owner/admin/teacher pages (Supabase Auth)
│   │   ├── book/
│   │   │   └── [token]/          ← parent booking WebView (JWT auth only)
│   │   └── api/
│   │       └── whatsapp/
│   │           └── webhook/      ← POST + GET (Meta verification)
│   ├── lib/
│   │   ├── supabase/             ← client.ts, server.ts, service-role.ts
│   │   ├── booking/              ← getAvailableSlots, createSlotLock, confirmBooking
│   │   ├── whatsapp/             ← Meta API client, sendBookingLink, sendReply
│   │   ├── jwt/                  ← signBookingToken, verifyBookingToken
│   │   └── phone/                ← normalizePhone (E.164)
│   └── components/
│       ├── ui/                   ← shadcn components (do not edit manually)
│       └── booking/              ← booking WebView step components
├── supabase/
│   └── migrations/
└── .env.local                    ← git-ignored; never commit
```

---

## Route Handlers vs Server Actions

- **Route Handlers** (`/api/**`) own all external API boundaries (WhatsApp webhook)
- **Server Actions** orchestrate server-side booking UI steps (lock slot, confirm booking)
- All shared booking logic lives in `src/lib/booking/*` — never duplicated inside components
- DB access never happens inside React components or UI files

**Note on `/api/booking/*`:**
There is no public `/api/booking/link` endpoint. Booking link generation is triggered
server-side inside the WhatsApp webhook handler, not via a public route.
All booking write operations (lock, confirm) are Server Actions called from the WebView.

---

## Sprint 1 API Surface

| Method | Route | Caller | Purpose |
|---|---|---|---|
| GET | `/api/whatsapp/webhook` | Meta | Webhook verification challenge |
| POST | `/api/whatsapp/webhook` | Meta | Receive incoming WhatsApp messages |

All other booking operations (availability, lock, confirm) are **Server Actions**, not public routes.

---

## Authentication Model

### Dashboard users (Owner / Admin / Teacher)
- Supabase Auth session
- JWT claims must include: `{ sub, org_id, role }`
- Role determines RLS access — see `/docs/security.md`

### Parent booking WebView (`/book/[token]`)
- JWT verified in a **dedicated route-level middleware for `/book/*` only**
- No Supabase auth middleware on `/book/*`
- No dashboard session dependency on `/book/*`
- JWT payload: `{ organizationId, parentId, studentId, exp }`
- JWT is NOT passed to Supabase in any form

### Service role
- Used for all booking writes (slot_locks, lessons)
- Imported only from `src/lib/supabase/service-role.ts`
- Never referenced in client components or exposed to browser

---

## Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server-side only, never in client bundle

# JWT
BOOKING_JWT_SECRET=               # for signing/verifying booking tokens

# WhatsApp (Meta Cloud API)
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=            # for GET webhook verification
```

`SUPABASE_SERVICE_ROLE_KEY` and `BOOKING_JWT_SECRET` must never appear in client components.

---

## Local Development

```bash
npm run dev              # starts Next.js at http://localhost:3000
npx supabase start       # starts local Supabase (requires Docker)
npm test                 # run all unit tests (vitest)
npm run test:watch       # vitest watch mode
npm run test:coverage    # vitest with v8 coverage
```

- App runs at `http://localhost:3000`
- Remote Supabase is acceptable if local Docker is unavailable
- WhatsApp webhook can be tested in Sprint 1 with manual sample payloads (no live Meta required)
- There is no WhatsApp mock service — simulate by calling the webhook endpoint directly with test JSON

---

## Key Business Rules (non-negotiable)

- `slot_locks` expire after **5 minutes**
- Booking JWT tokens expire after **15 minutes**
- All phone numbers stored and queried as **E.164** — always call `normalizePhone()` before DB write or lookup
- All datetimes stored as **UTC**, displayed per `organizations.timezone`
- Slot formula: `next_slot_start = current_slot_start + lesson_duration + break_duration_minutes`
- Duration options come only from `docs/sprint-1-scope.md` — do not invent or assume values not documented there
- Billing parent = `is_primary = true` from `relationships` at lesson creation time
- If student has no primary parent → lesson creation fails with error
- WhatsApp unrecognized sender → create `leads` record + notify admin + send fixed reply
- `teacherId` is **never** in the booking JWT
- Teacher always selected inside WebView

Full schema: `/docs/schema.md` | All decisions: `/docs/decisions.md`

---

## Testing Rules

- **Unit tests** required for all isolated booking logic: `getAvailableSlots`, `createSlotLock`, `confirmBooking`, `normalizePhone`, `signBookingToken`, `verifyBookingToken`
- **Integration tests** required for route handler + DB interactions (webhook flow, slot lock, lesson creation)
- **Manual verification** required for: WhatsApp webhook with sample payload, full booking WebView flow on mobile viewport, Hebrew RTL rendering
- Do not claim a story is complete without stating exactly what was tested and how
- Tests live in `__tests__/` or colocated `*.test.ts` files

---

## Missing or Conflicting Documentation

If a required definition is missing from docs, add:

```
// TODO(LESSIO): Missing definition in docs for [item].
// Question: [exact question that needs answering].
```

If two documents contradict each other, add:

```
// TODO(LESSIO): Conflict between [doc A] and [doc B].
// Conflict: [exact contradiction].
// Question: [decision needed before proceeding].
```

Do not resolve conflicts by guessing. Stop and surface the TODO.

---

## Task Completion Format

After completing every story or sub-task, output this summary:

```
## Task Summary: [Story name / DEV-XX]

### What was built
- [list of implemented functionality]

### Files changed
- [file path] — [what changed]

### Assumptions avoided
- [list anything that was explicitly NOT assumed, and why]

### TODOs / Blockers
- [any TODO(LESSIO) comments added and why]

### Tests added or run
- [what was tested, how, and what passed]

### Sprint 1 scope check
- [ ] All changes are within Sprint 1 scope
- [ ] No billing, cancellation, homework, or analytics code was added
- [ ] No new routes were created outside the approved list
```

---

## What Not to Optimize Now

- Do not optimize for scale beyond documented Sprint 1 needs
- Do not introduce abstraction layers for future epics unless required by the current story
- Do not build generalized scheduling engines beyond the exact approved booking flow
- Do not add payment provider integration — abstraction layer only if required by story
- Do not add error monitoring, logging infrastructure, or observability tooling beyond basic console logging

---

## Non-Negotiable Rules

1. Do not invent fields, tables, enums, routes, or business rules
2. Use only schema and naming from `/docs/schema.md`
3. If something is missing → `TODO(LESSIO)`, do not guess
4. All booking writes → service role, server-side only
5. All pages support Hebrew RTL (`dir="rtl"`)
6. Sprint 1 scope only — see `/docs/sprint-1-scope.md`
7. Do not build: billing UI, PDF invoices, analytics, reporting, homework, cancellation flow
8. Booking WebView auth = signed JWT only, never Supabase session
9. `/book/*` routes have no Supabase session middleware
10. Phone numbers stored and queried as E.164 only — always use `normalizePhone()`
11. Datetimes stored as UTC, displayed per `organizations.timezone`
12. No LLM integration in Sprint 1
13. Business logic lives in `src/lib/*` — never in React components

---

## Sprint 1 Definition of Done

- [ ] All DB tables exist with correct constraints, indexes, and RLS policies
- [ ] A parent can complete a full booking from a signed link without logging in
- [ ] A valid `lessons` row is created server-side after booking confirmation
- [ ] Double-booking is prevented (slot lock enforced concurrently)
- [ ] Expired slot locks release the slot and block confirmation
- [ ] Expired JWT shows correct Hebrew error screen
- [ ] All booking WebView screens render in Hebrew RTL on mobile viewport
- [ ] WhatsApp webhook receives message, validates signature (only if specified in docs/Jira — otherwise add TODO(LESSIO)), returns 200
- [ ] Unrecognized parent creates a `leads` record and receives a WhatsApp reply
- [ ] Booking confirmation message is sent via Meta WhatsApp Cloud API
- [ ] Seed data in place (1 org, 1 owner, 1 teacher, 1 parent, 1 student)
- [ ] All unit and integration tests pass
- [ ] `/docs/security.md` RLS policies are implemented and verified

---

## Before Writing Any Code

Read these files in order:
1. `/docs/plan.md`
2. `/docs/schema.md`
3. `/docs/decisions.md`
4. `/docs/sprint-1-scope.md`
5. `/docs/security.md`

Then confirm:
"I have read the docs. Here is my understanding of the current task: [summary].
Here is what I will build: [list]. Here is what I will not touch: [list]."