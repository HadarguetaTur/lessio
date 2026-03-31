# LESSIO — Product Plan (v5)
*Updated: Sprint 13 planning*

## Vision

LESSIO is a multi-tenant SaaS platform for managing private tutoring businesses and learning centers.
It provides holistic operational control: scheduling, billing, cancellations, homework, and WhatsApp-based client communication — all in one system.

**Core problem it solves:** revenue lost to untracked cancellations, scheduling chaos, manual billing, and parent communication overhead.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router) + TypeScript (strict) |
| UI | React 19, Tailwind CSS 4, shadcn/ui (Nova preset) |
| Backend | Next.js Server Actions + Route Handlers |
| Database | PostgreSQL via Supabase |
| Auth (dashboard) | Supabase Auth (email/password) |
| Auth (booking WebView) | Signed JWT (jose) — no Supabase session |
| Auth (parent portal) | Phone OTP → httpOnly cookie (jose JWT) |
| Background Jobs | Supabase Edge Functions (Deno, scheduled cron) |
| WhatsApp | Meta WhatsApp Cloud API (one number per org) |
| Payments | Abstraction layer: Cardcom + PayPlus (Stripe Sprint 21) |
| Hosting | Vercel (app) + Supabase (backend) |

---

## Architectural Principles

- Single SaaS codebase: dashboard + booking WebView + parent portal + server logic
- Multi-tenant from day one — `organization_id` is the canonical tenant key
- All tenant-scoped tables include `organization_id`; RLS enforces isolation
- WhatsApp is the primary parent communication channel; portal is self-service complement
- No microservices — Next.js + Supabase + Edge Functions only
- Payment abstraction layer: swap providers without changing the charge model
- Secrets: server-only, validated at startup, never in client bundles

---

## User Roles

### Dashboard Users (Supabase Auth)

| Role | Description |
|---|---|
| `owner` | Full access: org settings, integrations, billing config, all reports, all data |
| `admin` | Operational: students, parents, leads, lessons, day-to-day. No org settings or billing config |
| `teacher` | Own schedule only: view lessons, mark outcome (completed/no_show). No billing, no people management |

### External Users (no dashboard auth)

| Entity | Auth Method | Description |
|---|---|---|
| `parent` | WhatsApp + portal cookie | Billing/contact entity. Interacts via WhatsApp and parent portal |
| `student` | — | Learning entity. Not an auth user. Linked to parent via `relationships` |

---

## Core Modules

| Module | Description | Sprint | Status |
|---|---|---|---|
| Scheduling | Teacher availability, slot locking, booking WebView | 1 | ✅ Done |
| Internal Dashboard | People management, calendar, lesson status | 2 | ✅ Done |
| Billing & Cancellations | Policy engine, auto-charge, payment tracking | 3 | ✅ Done |
| WhatsApp External Flows | Parent cancellation, lead capture, payment requests | 4 | ✅ Done |
| Multi-Role Access | Teacher portal, authorization hardening | 5 | ✅ Done |
| Production Readiness | Security audit, QA, environments, go-live | 6 | ✅ Done |
| WhatsApp Embedded Signup | Per-org WhatsApp number, AES-256-GCM token encryption | 7 | ✅ Done |
| Real Payments | Multi-provider abstraction, Cardcom + PayPlus, webhooks | 8 | ✅ Done |
| KPI Dashboard + Auto Payment | Revenue/debt KPIs, auto-send payment request | 9 | ✅ Done |
| Org Holidays + Teacher Self-Service | Block slots on holidays, teacher-managed availability | 10 | ✅ Done |
| Recurring Lessons | Lesson series: create, cancel, conflict detection | 11 | ✅ Done |
| Automated Reminders | Lesson + payment reminders via Edge Functions + cron | 12 | ✅ Done |
| Single Scheduling + Parent Portal | Admin/teacher single lesson creation; parent portal with OTP login | 13 | ⏳ In Progress |
| Homework + WhatsApp Intents | Homework module, parent self-service queries via WhatsApp | 14 | Planned |
| Tax Receipts + Israeli Payments | חשבוניות ירוקות integration, Bit + PayBox providers | 15 | Planned |
| Custom Templates + iCal | Custom WhatsApp message templates, iCal calendar subscription | 16 | Planned |
| Analytics & Reporting | Revenue, debt aging, cancellation rates, CSV/PDF export | 17 | Planned |
| Super Admin Dashboard | Platform-level org management, subscription oversight | 18 | Planned |
| AI WhatsApp Assistant | OpenAI-powered fallback for unrecognized parent queries | 19 | Planned |
| i18n Infrastructure | next-intl, locale routing, Hebrew string extraction, English | 20 | Planned |
| SaaS Billing | Stripe Billing for charging your own customers | 21 | Planned |
| International Launch | GDPR, Stripe payment provider, global payment methods | 22 | Planned |

---

## Sprint Roadmap

| Sprint | Milestone | Status |
|---|---|---|
| 1 | Booking Loop — WhatsApp → WebView → lesson | ✅ Done |
| 2 | Internal Usable Product — day-to-day operations | ✅ Done |
| 3 | Business Logic — billing engine, cancellations, charges | ✅ Done |
| 4 | External Operational — WhatsApp flows + leads | ✅ Done |
| 5 | Multi-Role — teacher portal, permissions hardening | ✅ Done |
| 6 | Production Ready — security, QA, first customer | ✅ Done |
| 7 | WhatsApp Embedded Signup — per-org number, encrypted token | ✅ Done |
| 8 | Real Payments — Cardcom + PayPlus, abstraction layer, webhooks | ✅ Done |
| 9 | KPI Dashboard + Auto Payment — stats, auto payment request | ✅ Done |
| 10 | Org Holidays + Teacher Self-Service — availability, overrides | ✅ Done |
| 11 | Recurring Lessons — series: create, cancel, conflict detection | ✅ Done |
| 12 | Automated Reminders — lesson + payment Edge Functions + cron | ✅ Done |
| 13 | Single Scheduling + Parent Portal + UX/UI Polish | ⏳ In Progress |
| 14 | Homework Module + WhatsApp Smart Intents | Planned |
| 15 | Tax Receipts + Bit/PayBox | Planned |
| 16 | Custom Message Templates + iCal Export | Planned |
| 17 | Analytics & Reporting | Planned |
| 18 | Super Admin Dashboard | Planned |
| 19 | AI WhatsApp Assistant | Planned |
| 20 | i18n Infrastructure + English | Planned |
| 21 | SaaS Billing (Stripe) | Planned |
| 22 | International Launch — GDPR + global payments | Planned |

Full sprint detail: see `/docs/sprint-roadmap.md`

---

## Booking Flow — Token Model

1. Parent sends WhatsApp message with booking intent
2. System identifies parent by E.164 phone in `parents` table
3. If not found → create `leads` record + notify admin + send fixed reply. Stop.
4. If found → generate signed JWT (15-min expiry): `{ organizationId, parentId, studentId }`
   - `teacherId` is **never** in the JWT
5. Send booking link to parent via Meta WhatsApp Cloud API
6. Parent opens `/book/[token]` — server validates JWT on page load
7. Parent selects: **teacher → date → duration → slot**
8. System creates `slot_locks` record (`status: active`, expires in 5 min)
9. Parent confirms booking within 5 minutes
10. System creates `lessons` record (`status: scheduled`) via service role
11. `slot_locks.status` → `consumed`
12. WhatsApp confirmation sent to parent

---

## Parent Portal Flow — OTP Model (Sprint 13)

1. Parent opens `/portal/[orgId]`
2. If no `portal_session` cookie → redirect to `/portal/[orgId]/login`
3. Parent enters phone number → system finds parent in DB, generates 6-digit OTP
4. OTP hashed (SHA-256) + stored in `portal_otps` (expires 10 min) + sent via WhatsApp
5. Parent enters OTP → verified → `portal_session` httpOnly cookie set (30-day JWT)
6. Parent redirected to `/portal/[orgId]/home` — upcoming lessons + outstanding balance
7. Parent can book new lessons, view payment history, pay via existing payment links

---

## What the Full System Looks Like

**For the business owner:** Full dashboard — people, schedule, billing, cancellations, reports. Automated reminders and payment requests. Everything tracked automatically.

**For the teacher:** Own schedule only. Create single lessons. Mark completed/no_show. iCal subscription (Sprint 16). Weekly summary.

**For the parent:** WhatsApp for everything — booking, cancellation, payment, homework, reminders, self-service queries. Portal for structured access: lessons, payments, booking.

**For the student:** WhatsApp direct — homework assignments, reminders, mark as done (Sprint 14).

**For you (as the platform owner):** Super Admin dashboard to manage all orgs (Sprint 18). Each customer with their own WhatsApp number, payment provider, org settings. Automated SaaS billing via Stripe (Sprint 21).

---

## Repository Structure

```
lessio/
├── AGENTS.md                      ← AI operating manual (always read first)
├── CLAUDE.md                      ← points to AGENTS.md
├── docs/
│   ├── plan.md                    ← this file
│   ├── schema.md                  ← DB schema (source of truth)
│   ├── decisions.md               ← architectural decisions
│   ├── security.md                ← RLS + auth model
│   ├── sprint-roadmap.md          ← full roadmap (sprints 1–22)
│   ├── sprint-1-scope.md  →  sprint-12-scope.md  ← completed
│   └── sprint-13-scope.md         ← current sprint
├── src/
│   ├── app/
│   │   ├── (dashboard)/           ← owner/admin/teacher (Supabase Auth)
│   │   ├── book/[token]/          ← parent booking WebView (JWT auth)
│   │   ├── portal/[orgId]/        ← parent portal (cookie auth) — Sprint 13
│   │   └── api/
│   │       ├── whatsapp/webhook/
│   │       └── payments/[provider]/
│   ├── lib/
│   │   ├── supabase/              ← client, server, service-role
│   │   ├── booking/               ← getAvailableSlots, createSlotLock, confirmBooking
│   │   ├── billing/               ← calculateCancellationCharge, createCharge
│   │   ├── lessons/               ← createSeries, cancelSeries, createLesson (S13)
│   │   ├── whatsapp/              ← Meta API client + all send functions
│   │   ├── payments/              ← registry, cardcom, payplus
│   │   ├── portal/                ← session.ts, otp.ts — Sprint 13
│   │   ├── jwt/                   ← signBookingToken, verifyBookingToken
│   │   ├── crypto/                ← AES-256-GCM
│   │   ├── organizations/         ← timezone, holidays
│   │   ├── dashboard/             ← stats.ts (KPIs)
│   │   └── phone/                 ← normalizePhone
│   └── components/
│       ├── ui/                    ← shadcn components
│       ├── booking/               ← BookingFlow + step components
│       └── dashboard/             ← Sidebar, KpiCard, lessons/, availability/
├── supabase/
│   ├── migrations/
│   ├── functions/                 ← lesson-reminders, payment-reminders
│   └── config.toml
└── .env.local
```

---

## Key Business Rules

- Slot locks expire after **5 minutes**
- Booking JWT tokens expire after **15 minutes**
- Portal session cookies last **30 days** (httpOnly JWT)
- Portal OTPs expire after **10 minutes**; one-time use
- Cancellation charges: configurable per org via `cancellation_policies`
- Each org manages its own WhatsApp number via Meta Embedded Signup
- One charge per lesson by default; additional charges use `charge_type`
- Teacher scope: own schedule only + own lesson outcome (completed/no_show)
- All phone numbers stored as E.164 — `normalizePhone()` before every save/lookup
- All datetimes stored as UTC — display per `organizations.timezone` (Luxon)
- Archive = `is_active = false` — never hard delete entities
- Billing parent = `is_primary = true` from `relationships` at lesson creation time
- Teacher creation = invite flow only (Supabase Auth invite)
- Service role access isolated to `src/lib/supabase/service-role.ts`
- Required env vars validated at startup — fail fast with named errors
- Production release blocked until staging QA + Data Recovery Playbook complete

---

## Documents Status

| Document | Status |
|---|---|
| decisions.md | ✅ 20 decisions, up to date through Sprint 12 |
| schema.md | ✅ Updated through Sprint 12 + Sprint 13 planned tables |
| plan.md | ✅ This file — updated Sprint 13 |
| sprint-roadmap.md | ✅ Full roadmap Sprints 1–22 |
| AGENTS.md | ✅ Updated Sprint 13 |
| sprint-1-scope.md → sprint-12-scope.md | ✅ Done |
| sprint-13-scope.md | ⬜ To be written |
| sprint-14-scope.md → sprint-22-scope.md | ⬜ Written per sprint |
