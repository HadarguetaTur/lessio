# LESSIO — Project Plan (v4)

## Vision

Lessio is a multi-tenant SaaS platform for managing private tutoring businesses and learning centers.
It provides full operational control over scheduling, billing, cancellations, and WhatsApp-based client communication.

**Core problem it solves:** lost revenue from untracked cancellations, scheduling chaos, and manual billing.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router) + TypeScript |
| UI | React, Tailwind CSS, shadcn/ui (Nova preset) |
| Backend | Next.js Route Handlers + Server Actions |
| Database | PostgreSQL via Supabase |
| Auth | Supabase Auth |
| File Storage | Supabase Storage |
| WhatsApp | Meta WhatsApp Cloud API |
| Payments | External provider via abstraction layer (provider TBD) |
| Background Jobs | Supabase Edge Functions (scheduled) — Sprint 2+ |
| Hosting | Vercel (app) + Supabase (backend) |

---

## Architectural Principles

- Single SaaS codebase: dashboard + booking WebView + server-side logic
- No microservices in MVP
- Clear separation: UI → domain logic → database access
- WhatsApp is the client communication layer; WebView handles booking interaction
- Multi-tenant from day one — `organization_id` is the canonical tenant key
- All tenant-scoped tables include `organization_id`
- Data isolation enforced at application level (queries) and database level (RLS)

---

## User Roles & Identity Model

### Dashboard Users (Supabase Auth)

| Role | Description |
|---|---|
| `owner` | Business-level administrator. Manages org settings, billing config, cancellation policy, integrations, users, roles, full financial visibility |
| `admin` | Operational role. Manages students, parents, leads, lessons, day-to-day scheduling. Cannot touch org settings, integrations, role management, or core billing config |
| `teacher` | Views own schedule and may update only own lesson outcome to `completed` / `no_show`. No billing, cancellation, or people-management access |

### Domain Entities (no dashboard auth)

| Entity | Description |
|---|---|
| `parent` | Billing/contact entity. Interacts via WhatsApp only. Not a Supabase Auth user |
| `student` | Learning entity. Not an auth user. Linked to parent via `relationships` table |

---

## Core Modules

| Module | Description | Sprint |
|---|---|---|
| Scheduling | Teacher availability, slot locking, lesson booking | 1 ✅ |
| Internal Dashboard | People management, calendar, lesson status | 2 ✅ |
| Billing & Cancellations | Policy engine, auto-charge, payment tracking | 3 ✅ |
| WhatsApp External Flows | Parent cancellation, lead capture, payment requests | 4 ✅ |
| Multi-Role Access | Teacher portal, authorization hardening | 5 ✅ |
| Production Readiness | Security audit, QA, environments, go-live | 6 ✅ |
| WhatsApp Embedded Signup | Per-org WhatsApp channel config, AES-256-GCM token encryption | 7 ✅ |
| Real Payments | Multi-provider payment abstraction layer, Cardcom adapter, per-org encrypted credentials | 8 ⏳ |
| Teaching Operations | Teacher Google Calendar sync and homework assignment workflows | 9 planned |
| Integration Hub | Outbound webhooks, Make connectivity | 10 planned |

---

## Sprint Roadmap

| Sprint | Milestone | Goal | Status |
|---|---|---|---|
| 1 | Booking Loop | WhatsApp → WebView → lesson created | ✅ Done |
| 2 | Internal Usable Product | Day-to-day internal operations | ✅ Done |
| 3 | Business Logic Product | Billing engine — cancellations & charges | ✅ Done |
| 4 | External Operational | External flows — WhatsApp + leads | ✅ Done |
| 5 | Multi-Role Product | Permissions, teacher portal, product hardening | ✅ Done |
| 6 | Production Ready | Security, QA, first customer | ✅ Done |
| 7 | WhatsApp Embedded Signup | Per-org WhatsApp number via Meta Embedded Signup, AES-256-GCM token encryption | ✅ Done |
| 8 | Real Payments | Multi-provider payment abstraction, Cardcom adapter, per-org encrypted credentials, payment webhook | ⏳ Current Sprint |
| 9 | Teaching Operations | Teacher Google Calendar sync and homework assignment workflows | planned |
| 10 | Integration Platform | Make/webhook delivery, operational integrations | planned |
| 11 | Expansion Hardening | Reporting, automation polish, broader pilot-readiness for multiple customers | planned |

---

## Booking Flow — Token Model

1. Parent sends WhatsApp message with booking intent
2. System identifies parent by E.164 phone in `parents` table
3. If not found → create `leads` record + notify admin + send fixed WhatsApp reply. Stop.
4. If found → generate signed JWT (15-min expiry): `{ organizationId, parentId, studentId }`
   - `teacherId` is **never** in the JWT
5. Send booking link to parent via Meta WhatsApp Cloud API
6. Parent opens `/book/[token]` — server validates JWT on page load
7. Parent selects: **teacher → date → duration → slot**
8. System creates `slot_locks` record (`status: active`, expires in 5 min)
9. Parent confirms booking within 5 minutes
10. System creates `lessons` record (`status: scheduled`) via service role
11. `slot_locks.status` → `consumed`
12. Confirmation message sent via Meta WhatsApp Cloud API

If JWT expires → parent must request a new link from WhatsApp
If slot lock expires → parent must re-select a slot

---

## Repository Structure

```
lessio/
├── CLAUDE.md                      ← Claude operating manual (current sprint)
├── docs/
│   ├── plan.md                    ← this file
│   ├── schema.md                  ← DB schema (source of truth)
│   ├── decisions.md               ← architectural decisions (all sprints)
│   ├── security.md                ← RLS policies + auth model
│   ├── sprint-1-scope.md          ← ✅ completed
│   ├── sprint-2-scope.md          ← ✅ completed
│   ├── sprint-3-scope.md          ← ✅ completed
│   ├── sprint-4-scope.md          ← completed
│   ├── sprint-5-scope.md          ← completed
│   └── sprint-6-scope.md          ← current source of truth
├── src/
│   ├── app/
│   │   ├── (dashboard)/           ← owner/admin/teacher pages (Supabase Auth)
│   │   │   ├── students/
│   │   │   ├── parents/
│   │   │   ├── teachers/
│   │   │   ├── lessons/
│   │   │   └── dashboard/
│   │   ├── book/
│   │   │   └── [token]/           ← parent booking WebView (JWT auth only)
│   │   └── api/
│   │       └── whatsapp/
│   │           └── webhook/       ← POST + GET (Meta verification)
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

## Key Business Rules

- Slot locks expire after **5 minutes**
- Booking JWT tokens expire after **15 minutes**
- Cancellation charges are configurable per organization (`cancellation_policies` table)
- Each organization manages its own WhatsApp number via Meta Cloud API token
- One charge per lesson by default; additional charges use `charge_type`
- Teacher scope = own schedule only + own lesson outcome update only (`completed` / `no_show`)
- `teacher_id` and `organization_id` for dashboard authorization come from trusted auth context, never request body
- Valid resource access across organizations must return `403`, not `404`
- All phone numbers stored as E.164 — `normalizePhone()` before every save/lookup
- All datetimes stored as UTC — display per `organizations.timezone`
- Archive = `is_active = false` — never hard delete entities
- Billing parent = `is_primary = true` from `relationships` at lesson creation time
- Teacher creation = invite flow only (Supabase Auth invite)
- Sprint 6 scope = audit, hardening, verification, and go-live readiness only
- `SUPABASE_SERVICE_ROLE_KEY` and `BOOKING_JWT_SECRET` are server-only secrets and must never appear in any client bundle
- Service role access is isolated to `src/lib/supabase/service-role.ts`
- Required env vars are validated at startup and fail fast with named errors if missing
- WhatsApp webhook requests without valid `X-Hub-Signature-256` must return `401`
- Critical flows must emit structured logs with `org_id` and relevant entity IDs when available
- Production release is blocked until staging QA and the Data Recovery Playbook are complete

---

## Schema Migration Status

| Sprint | Table | Change | Status |
|---|---|---|---|
| 3 | teachers | + hourly_rate numeric(10,2) | ✅ Done |

---

## Post-Launch Expansion Direction

These items are intentionally outside Sprint 6 and should begin only after the first live pilot is stable:

- Formal tenant configuration layer for per-organization channel, billing, and integration settings
- Official WhatsApp bot flows by actor type: parent, student, teacher, owner/admin staff
- Teacher Google Calendar sync, starting with one-way lesson sync from LESSIO to Google Calendar
- Homework domain: template library, assignment tracking, due dates, and WhatsApp reminders
- Integration hub for payment providers, Make, and outbound organization webhooks
- Role expansion only where operationally justified, while keeping server-side authorization as the source of truth

## Post-MVP (not in any committed sprint scope yet)

- Advanced reporting and analytics
- PDF invoices
- Multi-provider payment support beyond the initial abstraction
- Multi-language support (beyond Hebrew)
- Parent or student web portal