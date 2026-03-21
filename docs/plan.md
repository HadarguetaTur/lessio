# LESSIO — Project Plan (v1)

## Vision

Lessio is a multi-tenant SaaS platform for managing private tutoring businesses and learning centers.  
It provides full operational control over scheduling, billing, cancellations, and WhatsApp-based client communication.

**Core problem it solves:** lost revenue from untracked cancellations, scheduling chaos, and manual billing.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router) + TypeScript |
| UI | React, Tailwind CSS, shadcn/ui |
| Backend | Next.js Route Handlers + Server Actions |
| Database | PostgreSQL via Supabase |
| Auth | Supabase Auth |
| File Storage | Supabase Storage |
| WhatsApp | Meta WhatsApp Cloud API |
| Payments | External provider via abstraction layer (provider TBD) |
| Background Jobs | Supabase Edge Functions (scheduled) |
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
| `teacher` | Receives schedule, views own students, updates lesson status |

### Domain Entities (no dashboard auth)

| Entity | Description |
|---|---|
| `parent` | Billing/contact entity. Interacts via WhatsApp only. Not a Supabase Auth user |
| `student` | Learning entity. Not an auth user in MVP. Linked to parent via `relationships` table |

---

## Core Modules

| Module | Description |
|---|---|
| Scheduling | Teacher availability, slot locking, lesson booking |
| Billing | Charge generation, payment tracking, reminders, blocking logic |
| Cancellations | Policy engine, auto-charge on cancel, notifications |
| WhatsApp Bot | Intent detection, session management, message templates |
| Dashboard | Owner/Admin operational view |
| Homework | Templates, assignment, reminders (post-MVP) |

---

## Booking Flow — Token Model

1. Parent sends WhatsApp message with booking intent
2. System identifies parent by phone number
3. System generates signed JWT (15-minute expiry) containing tenant + booking context
4. JWT is embedded in WebView URL and sent to parent via WhatsApp
5. Parent opens WebView, selects slot
6. System creates `slot_lock` record (5-minute expiry) on slot selection
7. Parent confirms booking within 5 minutes
8. Lesson is created, slot lock is released/consumed
9. Confirmation sent via WhatsApp

If JWT expires → parent must request new link from WhatsApp  
If slot lock expires → parent must re-select a slot

---

## MVP Scope

### Sprint 1 (must ship)
- DB schema + RLS baseline
- Teacher availability engine
- Slot locking
- Lesson creation
- WhatsApp webhook (entry point)
- Signed JWT booking URL generation
- Booking WebView (basic)

### Sprint 2
- Billing foundation
- Cancellation flow
- Admin dashboard

### Post-MVP
- Homework module
- Advanced reporting
- PDF invoices
- Multi-provider payment support

---

## Key Business Rules

- A parent cannot book a lesson if they have an outstanding debt (configurable threshold)
- Slot locks expire after **5 minutes**
- Booking JWT tokens expire after **15 minutes**
- Cancellation charges are configurable per organization
- Each organization manages its own WhatsApp number via Meta Embedded Signup
- One charge per lesson by default; additional charges (cancellation, manual) use `charge_type`
