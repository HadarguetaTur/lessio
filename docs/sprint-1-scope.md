# LESSIO — Sprint 1 Scope

## Goal

Ship the minimum vertical slice that proves the core booking loop works end to end:
**WhatsApp message → signed link → WebView → slot selection → lesson created**

Nothing outside this scope should be built in Sprint 1.

---

## Explicit Scope

### In Scope

* Full DB schema (all tables from `schema.md`)
* RLS baseline (all policies)
* Teacher availability retrieval logic
* Availability override handling
* Slot lock creation and expiry logic
* Lesson creation from confirmed booking
* WhatsApp webhook (incoming message handler)
* Parent identification by phone
* Signed JWT booking URL generation (15-minute expiry)
* Booking WebView — full flow (`teacher → date → slot → confirm`)
* Booking confirmation WhatsApp message (outgoing)
* Seed data: 1 org, 1 owner, 1 teacher, 1 parent, 1 student

### Out of Scope (do not build)

* Billing UI or charge dashboard
* PDF invoices
* Cancellation flow
* Homework module
* Admin dashboard beyond seed/debug needs
* Payment provider integration
* Reporting or analytics
* WhatsApp intent detection beyond booking entry
* Multi-language support
* Email notifications

---

## Epics & Stories

---

## EPIC 1 — Infrastructure & DB Schema

### Story: Define core database schema

* Create all tables as defined in `/docs/schema.md`
* Add all check constraints, foreign keys, and unique constraints
* Add all indexes listed in `schema.md`
* Add `updated_at` triggers for:

  * `organizations`
  * `profiles`
  * `teachers`
  * `parents`
  * `students`
  * `lessons`
  * `charges`
  * `cancellation_policies`
* Enable RLS on all tables
* Write migration file(s) in `/supabase/migrations/`

### Story: Configure RLS policies

* Owner: full access to own org data
* Admin: operational access (no org settings, no role management)
* Teacher: read own availability, lessons, linked students
* Service role: unrestricted (for booking flow, server-side)
* Document all policies in `/docs/security.md`

### Story: Seed demo data

* 1 organization
* 1 owner profile
* 1 teacher (linked to profile, with weekly availability Mon–Thu 16:00–20:00)
* 1 parent (identified by phone)
* 1 student (linked to parent)
* 1 cancellation policy (`24h` full, `2h` partial at `50%`)

---

## EPIC 2 — Scheduling Engine

### Story: Build availability retrieval logic

* `getAvailableSlots(teacherId, date, durationMinutes, organizationId)` server utility
* Reads from `availability` (weekly recurring)
* Reads from `availability_overrides` (date-specific exceptions)
* Excludes existing `lessons` for that teacher on that date
* Excludes active (non-expired) `slot_locks` for that teacher
* Returns an array of available time slots
* All datetime handling must be timezone-aware (store UTC, display local)
* Unit tests:

  * overlapping lessons
  * expired locks
  * override blocks
  * override additions

### Story: Implement slot locking

* `createSlotLock(teacherId, startAt, endAt, organizationId)` server action
* Validates that the slot is still available before creating the lock
* Sets `expires_at = now() + 5 minutes`
* Prevents duplicate locks on the same slot (concurrent-safe)
* `validateSlotLock(lockId)` — returns valid / expired status
* Expired locks are never manually deleted — they are treated as released in queries
* Unit tests:

  * concurrent lock attempts
  * expired lock detection

### Story: Create lesson from confirmed booking

* `confirmBooking(lockId, studentId, teacherId, organizationId)` server action
* Validates that the lock is still active
* Validates that the teacher and student exist and are active in the org
* Creates the lesson with status `scheduled`
* Marks the slot lock as consumed (or relies on expiry)
* Returns `lesson id` + confirmation payload
* Error handling:

  * expired lock
  * taken slot
  * inactive teacher / student

---

## EPIC 3 — Booking WebView

### Story: Build booking WebView shell

* Route: `/book/[token]` — validates JWT on load
* If token is invalid or expired: show a `"link expired"` screen with Hebrew copy
* RTL layout (Hebrew)
* Mobile-first responsive design
* `shadcn/ui` components

### Story: Booking flow — step 1: teacher selection

* Display the list of active teachers in the organization
* The parent always selects a teacher — no automatic skip
* JWT contains: `organizationId`, `parentId`, `studentId` only (`teacherId` is not included)

### Story: Booking flow — step 2: date & duration selection

* Select lesson duration (`45 / 60 / 90` minutes — default options)
* Select date (`next 30 days`, filtered by `min_booking_notice_hours`)
* Fetch available slots using:
  `getAvailableSlots(teacherId, date, durationMinutes, organizationId)`
* Show an empty state if no slots are available

### Story: Booking flow — step 3: slot selection

* Display available time slots
* On slot tap: call `createSlotLock`
* Show a 5-minute countdown timer after the lock is created
* If the timer expires: show a `"slot released"` message and return to the slot list

### Story: Booking flow — step 5: confirmation

* Show summary:

  * teacher name
  * date
  * time
  * student name
* Confirm button calls `confirmBooking`
* Success screen: booking confirmed, Hebrew copy
* Failure screen: slot taken or expired, with an option to restart
* No form fields are required in MVP (all context comes from JWT)

---

## EPIC 4 — WhatsApp Entry Flow

### Story: WhatsApp webhook foundation

* Route: `POST /api/whatsapp/webhook`
* Route: `GET /api/whatsapp/webhook` — Meta verification challenge
* Validate `X-Hub-Signature-256` header
* Extract and normalize sender phone number
* Log incoming payload (structured, no PII in logs)
* Return `200` immediately (async processing)
* Error logging for malformed payloads
* Local development may skip signature verification only when `WHATSAPP_APP_SECRET` is unset; production must reject that configuration

### Story: Parent identification

* Look up the `parents` table by normalized phone + organization context
* If not found: create lead record or return `"not recognized"` flow (`TBD`)
* If found with multiple matches: log and flag as an edge case
* Accepted Sprint 1 limitation: if the matched parent has no linked students or more than one linked student, do not send a booking link and log the case for follow-up

### Story: Booking link generation and dispatch

* Detect booking intent from incoming message (MVP keyword match — e.g. `"קביעה"`, `"שיעור"`)
* Generate signed JWT (15-minute expiry) containing:

  * `organizationId`
  * `parentId`
  * `studentId`
  * `teacherId` is **not** included
* Build WebView URL with JWT as query param
* Send the URL back to the parent via Meta Cloud API (text message template)
* Log the link generation event
* Accepted Sprint 1 limitation: only booking-intent messages receive a response; other incoming messages are ignored

---

## Ground Rules for Claude Code

```text
You are building LESSIO, a tutoring management SaaS.

Tech stack:
- Next.js App Router + TypeScript
- Supabase Postgres + Supabase Auth
- Tailwind CSS + shadcn/ui
- Meta WhatsApp Cloud API

Rules:
1. Do not invent fields, tables, enums, routes, or business rules.
2. Use only the schema and naming defined in /docs/schema.md.
3. If a required field or table is missing from the docs, stop and mark it as a blocker with a TODO — do not guess.
4. All booking writes (slot_locks, lessons) must use service role, server-side only.
5. All user-facing pages must support Hebrew RTL.
6. Sprint 1 scope only — see /docs/sprint-1-scope.md.
7. Do not build billing UI, PDF invoices, analytics, reporting, or homework features.
8. Prefer small atomic commits. Update /docs when schema or logic changes.
9. Before writing code for any story, read /docs/plan.md and /docs/schema.md and confirm understanding.
10. When uncertain about business logic, add a TODO comment with a specific question — do not fabricate behavior.
11. Booking flow auth is JWT-based (not Supabase session) — do not apply session middleware to /book/* routes.
12. Timezone: store all datetimes in UTC. Display in the organization’s local timezone (to be configured).
```

---

## Definition of Done — Sprint 1

* [ ] All tables exist in Supabase with the correct constraints and indexes
* [ ] RLS policies are in place and tested for each role
* [ ] `getAvailableSlots` returns correct results with test coverage
* [ ] Slot locking prevents double-booking under concurrent requests
* [ ] Full booking flow can be completed end to end in the WebView
* [ ] WhatsApp webhook receives a message, identifies the parent, and sends the booking link
* [ ] Booking link opens the WebView with valid JWT context
* [ ] Expired JWT shows the correct error screen
* [ ] Expired slot lock returns the user to slot selection
* [ ] Confirmed booking appears as a `scheduled` lesson in the DB
* [ ] Seed data is in place for demo/testing
* [ ] `/docs/security.md` is written and reviewed

There’s one numbering issue in the original: it says “step 2” twice and then “step 5.” In English I kept the content intact, but the logical order is actually step 1 → step 2 → step 3 → confirmation.
