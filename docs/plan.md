# LESSIO — Product Plan (v6)
*Updated: Sprint 22 complete, Sprint 23–28 planned*

## Vision

LESSIO is a multi-tenant SaaS platform for managing private tutoring businesses and learning centers.
It provides holistic operational control: scheduling, billing, cancellations, homework, parent communication, and analytics — all in one system.

**Core problem it solves:** revenue lost to untracked cancellations, scheduling chaos, manual billing, and parent communication overhead.

**Long-term vision:** the operating system for tutoring businesses worldwide — from a single Hebrew-speaking tutor to a multi-branch international learning center.

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
| Email | Resend (Sprint 25) |
| Payments | Abstraction layer: Cardcom, PayPlus, Bit, PayBox + Stripe (Sprint 23) |
| Receipts | Abstraction layer: חשבוניות ירוקות + iCount (Sprint 27) |
| AI | Multi-provider: OpenAI, Anthropic, Google (Sprint 25) |
| Hosting | Vercel (app) + Supabase (backend) |

---

## Architectural Principles

- Single SaaS codebase: dashboard + booking WebView + parent portal + server logic
- Multi-tenant from day one — `organization_id` is the canonical tenant key
- All tenant-scoped tables include `organization_id`; RLS enforces isolation
- WhatsApp is the primary parent communication channel; email is the fallback (Sprint 25)
- No microservices — Next.js + Supabase + Edge Functions only
- Payment abstraction layer: swap providers without changing the charge model
- Receipt abstraction layer: swap receipt providers without changing the billing model
- AI abstraction layer: swap LLM providers per org without changing assistant logic (Sprint 25)
- Feature gates enforced server-side, not UI-only (Sprint 27)
- Secrets: server-only, validated at startup, never in client bundles

---

## User Roles

### Dashboard Users (Supabase Auth)

| Role | Description |
|---|---|
| `owner` | Full access: org settings, integrations, billing config, all reports, all data |
| `admin` | Operational: students, parents, leads, lessons, day-to-day. No org settings or billing config |
| `teacher` | Own schedule only: view lessons, mark outcome, add lesson notes, manage homework. No billing, no people management |
| `superadmin` | Platform-level: manage all orgs, view KPIs, create orgs, support mode impersonation |

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
| Single Scheduling + Parent Portal | Admin/teacher single lesson creation; parent portal with OTP login | 13 | ✅ Done |
| Homework + WhatsApp Intents | Homework module, parent self-service queries via WhatsApp | 14 | ✅ Done |
| Tax Receipts + Israeli Payments | חשבוניות ירוקות integration, Bit + PayBox providers | 15 | ✅ Done |
| Custom Templates + iCal | Custom WhatsApp message templates, iCal calendar subscription | 16 | ✅ Done |
| Analytics & Reporting | Revenue, debt aging, cancellation rates, CSV export | 17 | ✅ Done |
| Super Admin Dashboard | Platform-level org management, subscription oversight | 18 | ✅ Done |
| AI WhatsApp Assistant | OpenAI-powered fallback for unrecognized parent queries | 19 | ✅ Done |
| AI Assistant + WhatsApp Hardening | Idempotency wiring, conversation log, dead-end removal | 20 | ✅ Done |
| i18n Infrastructure + English | next-intl cookie-based locale, Hebrew extraction, English translation | 21 | ✅ Done |
| Billing Cycle + Subscriptions | Billing approval workflow, subscription management, i18n cleanup | 22 | ✅ Done |
| International Launch | GDPR, URL locale routing, Arabic, Stripe, Meta approved templates | 23 | Planned |
| Pedagogical Depth | Homework v2 (attachments + grading), lesson notes, student profile overhaul | 24 | Planned |
| AI Intelligence + Multi-Channel | Multi-provider AI + usage dashboard, email (Resend), in-app notifications | 25 | Planned |
| Parent Portal 2.0 | Full schedule, homework visibility, progress report, teacher messaging | 26 | Planned |
| Billing & Accounting Pro | PDF invoices, iCount integration, server-side feature enforcement | 27 | Planned |
| Analytics Pro | Trends + forecasting, teacher performance, student LTV + cohort | 28 | Planned |

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
| 13 | Single Scheduling + Parent Portal + UX/UI Polish | ✅ Done |
| 14 | Homework Module + WhatsApp Smart Intents | ✅ Done |
| 15 | Tax Receipts + Bit/PayBox | ✅ Done |
| 16 | Custom Message Templates + iCal Export | ✅ Done |
| 17 | Analytics & Reporting | ✅ Done |
| 18 | Super Admin Dashboard | ✅ Done |
| 19 | AI WhatsApp Assistant | ✅ Done |
| 20 | AI Assistant + WhatsApp Hardening | ✅ Done |
| 21 | i18n Infrastructure + English | ✅ Done |
| 22 | Billing Cycle + Subscription Management | ✅ Done |
| 23 | International Launch — GDPR + Arabic + global payments + Meta templates | Planned |
| 24 | Pedagogical Depth — homework v2, lesson notes, student profile | Planned |
| 25 | AI Intelligence + Multi-Channel — multi-provider AI, email, notifications | Planned |
| 26 | Parent Portal 2.0 — full schedule, homework, progress, messaging | Planned |
| 27 | Billing & Accounting Pro — PDF invoices, iCount, enforcement | Planned |
| 28 | Analytics Pro — trends, forecasting, LTV, cohort | Planned |

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

## Parent Portal Flow — OTP Model

1. Parent opens `/portal/[orgId]`
2. If no `portal_session` cookie → redirect to `/portal/[orgId]/login`
3. Parent enters phone number → system finds parent in DB, generates 6-digit OTP
4. OTP hashed (SHA-256) + stored in `portal_otps` (expires 10 min) + sent via WhatsApp
5. Parent enters OTP → verified → `portal_session` httpOnly cookie set (30-day JWT)
6. Parent redirected to `/portal/[orgId]/home` — upcoming lessons + outstanding balance
7. Parent can book new lessons, view payment history, pay via existing payment links

**Sprint 26 additions:** full calendar, homework tab, progress tab, teacher messaging

---

## What the Full System Looks Like

**For the business owner:** Full dashboard — people, schedule, billing, cancellations, reports, analytics. Automated reminders and payment requests. PDF invoices. Everything tracked automatically.

**For the teacher:** Own schedule only. Create single lessons. Mark completed/no_show. Add lesson notes and materials. Manage homework + grade submissions. iCal subscription. Weekly summary.

**For the parent:** WhatsApp for everything — booking, cancellation, payment, homework, reminders, self-service queries. Portal (Sprint 26) for structured access: full calendar, homework, progress reports, teacher messaging.

**For the student:** WhatsApp direct — homework assignments, reminders, mark as done.

**For you (as the platform owner):** Super Admin dashboard to manage all orgs. Each customer with their own WhatsApp number, payment provider, AI provider, org settings. Automated SaaS billing.

---

## Key Business Rules

- Slot locks expire after **5 minutes**
- Booking JWT tokens expire after **15 minutes**
- Portal session cookies last **30 days** (httpOnly JWT)
- Portal OTPs expire after **10 minutes**; one-time use
- Cancellation charges: configurable per org via `cancellation_policies`
- Each org manages its own WhatsApp number via Meta Embedded Signup
- One charge per lesson by default; additional charges use `charge_type`
- Teacher scope: own schedule only + own lesson outcome + own lesson notes + own homework
- All phone numbers stored as E.164 — `normalizePhone()` before every save/lookup
- All datetimes stored as UTC — display per `organizations.timezone` (Luxon)
- Archive = `is_active = false` — never hard delete entities
- Billing parent = `is_primary = true` from `relationships` at lesson creation time
- Teacher creation = invite flow only (Supabase Auth invite)
- Service role access isolated to `src/lib/supabase/service-role.ts`
- Required env vars validated at startup — fail fast with named errors
- Feature gates enforced server-side from Sprint 27 (not UI-only)
- Production release blocked until staging QA + Data Recovery Playbook complete

---

## Documents Status

| Document | Status |
|---|---|
| decisions.md | ✅ Up to date through Sprint 22 |
| schema.md | ✅ Updated through Sprint 22 |
| plan.md | ✅ This file — updated Sprint 22 complete, Sprints 23–28 planned |
| sprint-roadmap.md | ✅ Full roadmap Sprints 1–28 |
| AGENTS.md | ✅ Updated Sprint 22 |
| sprint-1-scope.md → sprint-22-scope.md | ✅ Done |
| sprint-23-scope.md → sprint-28-scope.md | ⬜ To be written per sprint |
