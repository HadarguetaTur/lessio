# LESSIO — Project Status
*Updated: Sprint 17 complete*

---

## Current State

**Sprints 1–17 complete. Sprint 18 next.**

### What Works End-to-End (Sprints 1–17)

**Scheduling & Booking:**
- WhatsApp → JWT booking link → WebView → slot lock → lesson created → WhatsApp confirmation
- Teacher weekly availability + date overrides (teacher self-managed since Sprint 10)
- Org holidays block all slots
- Recurring lesson series (create / cancel all or from date)
- Slot conflict detection for all creation paths

**Internal Dashboard (owner/admin):**
- Students, parents, teachers CRUD
- Parent–student relationships + billing parent assignment
- Weekly lesson calendar with teacher filter
- Lesson detail: status update, cancellation with policy-based charge
- Series management: create series, cancel series from dashboard
- Charges list: pending / invoiced / paid, mark paid, send payment request
- KPI dashboard: monthly revenue, pending debt, lessons this month, active students, cancellation rate, at-risk students, new leads this month
- Leads list + conversion to parent/student
- Homework templates + student assignments + WhatsApp delivery
- Reports section: revenue, lessons, debt, teachers, students — charts + tables + CSV export

**Teacher Portal:**
- Teacher-only weekly schedule view
- Mark lesson outcome: completed / no_show
- Self-managed availability and date overrides

**Billing:**
- Auto-charge on lesson completion (hourly_rate × duration/60)
- Cancellation charge engine (full / partial / waived per policy)
- Manual charge creation
- Payment request sent via WhatsApp with payment link
- Auto-send payment request after lesson completion (configurable per org)

**WhatsApp Automation (External):**
- Per-org WhatsApp number (Meta Embedded Signup)
- Booking link generation and dispatch
- Parent cancellation flow (state machine, numbered list, timeout)
- Lead capture for unknown senders
- Payment request messages with real payment links
- Lesson reminders to parents (Edge Function, hourly cron)
- Payment reminders for overdue charges (Edge Function, daily cron)
- Notification dedup log (`notification_log`)
- Balance / schedule / receipt / portal queries via WhatsApp (Sprint 14)
- Custom message templates per org — 14 types, `{{variable}}` substitution (Sprint 16)

**Payments:**
- Provider abstraction layer: Cardcom + PayPlus + Bit + PayBox
- Per-org encrypted provider credentials
- Inbound payment webhook: `POST /api/payments/[provider]` → marks charge paid
- Auto-send payment request toggle
- Tax receipt issuance via Green Invoice (Sprint 15)

**Parent Portal:**
- WhatsApp OTP login (Sprint 13)
- Upcoming lessons + balance overview
- Self-booking flow
- Payments history with receipt links

**Teacher Features:**
- Weekly schedule view + lesson outcome update
- Self-managed availability + overrides
- iCal subscription URL for calendar sync (Sprint 16)
- Single lesson creation

**Settings (owner):**
- WhatsApp connection (Embedded Signup)
- Payment provider configuration
- Receipt/invoice configuration (Green Invoice)
- Custom message templates (14 types)
- Cancellation policy
- Org holidays
- Reminder configuration (timing + master switch)

**Infrastructure:**
- Multi-tenant org isolation (RLS + application layer)
- AES-256-GCM encryption for tokens + payment credentials
- Env validation at startup (fail fast)
- Structured logging on critical paths
- Staging + production environments
- Data Recovery Playbook

---

## What's Missing (Sprint 13 Scope)

| Gap | Impact |
|---|---|
| No single lesson creation in dashboard | Admin/teacher must use recurring series even for one-off lessons |
| No teacher lesson creation at all | Teachers are completely passive — cannot initiate |
| No parent portal (web) | Parents depend 100% on WhatsApp JWT links; no persistent access |
| `/settings` 404s | No settings landing page |
| Sidebar flat list (no grouping) | 14 items with no visual hierarchy |
| No loading states (`loading.tsx`) | Blank flash on navigation |
| Two creation paths look like one | "שיעורים קבועים" is the only button — confusing |

---

## Architecture Decisions (24 locked)

| # | Decision |
|---|---|
| 1 | Lesson duration selected by parent in WebView |
| 2 | Slot formula: start + duration + break_duration_minutes |
| 3 | slot_lock status enum: active / consumed / expired |
| 4 | Unrecognized WhatsApp sender → lead + admin alert + fixed reply |
| 5 | Teacher always selected inside WebView — never in JWT |
| 6 | Same-day booking controlled by min_booking_notice_hours per org |
| 7 | teacher.profile_id always not null |
| 8 | Phone normalization: E.164 only, normalizePhone() everywhere |
| 9 | All datetimes in UTC, display per org timezone |
| 10 | Billing parent = is_primary = true from relationships |
| 11 | Billing: hourly_rate × (duration_minutes / 60) |
| 12 | Teacher creation = invite flow only |
| 13 | "Cancelled" in Sprint 2 = status only, no billing |
| 14 | WhatsApp cancellation timeout = 10 min, invalid input stays open |
| 15 | students.phone nullable — direct WhatsApp if set, via parent if not |
| 16 | Homework: library (templates) + one-off assignments, both supported (Sprint 14) |
| 17 | WhatsApp per org via Meta Embedded Signup |
| 18 | Payment provider abstraction layer — Cardcom first, Stripe in Sprint 21 |
| 19 | Group/pair lessons via lesson_students junction table, group_pricing_mode per org |
| 20 | Monthly subscription: prepaid OR per-lesson discounted, org-configurable |
| 21 | Webhook routing uses phone_number_id (stable Meta internal ID) |
| 22 | Access tokens encrypted AES-256-GCM — plaintext never persisted |
| 23 | Portal auth: phone OTP via WhatsApp → httpOnly cookie (30-day JWT) |
| 24 | Teacher lesson creation: direct (no approval step) |

---

## Schema — Live Tables (after Sprint 12)

| Table | Added in Sprint | Key Notes |
|---|---|---|
| organizations | 1 | + whatsapp_phone_number_id (S7), payment columns (S8), auto_send (S9), reminder columns (S12) |
| profiles | 1 | |
| teachers | 1 | + hourly_rate (S3), ical_token planned (S16) |
| parents | 1 | |
| students | 1 | + phone nullable (S7) |
| relationships | 1 | |
| availability | 1 | |
| availability_overrides | 1 | |
| lessons | 1 | student_id removed (S7), + lesson_type, max_students, series_id (S7/S11) |
| lesson_students | 7 | Junction: lesson_id, student_id |
| lesson_series | 11 | Series metadata + recurrence rule JSON |
| slot_locks | 1 | |
| charges | 1 | + payment_link, payment_reference, payment_provider (S8) |
| cancellation_policies | 1 | |
| leads | 1 | |
| cancellation_sessions | 4 | WhatsApp cancellation state machine |
| organization_holidays | 10 | |
| notification_log | 12 | Dedup for automated WhatsApp sends |

### Planned Sprint 13
- `portal_otps` — phone OTP storage (expires 10 min, one-time use)

### Planned Sprint 14
- `homework_templates` — reusable homework template library
- `homework_assignments` — student assignments with status tracking

### Planned Sprint 15+
- `message_templates` — custom WhatsApp message templates per org (S16)
- `conversation_log` — AI assistant conversation history (S19)
- `subscriptions` — org subscription plans for SaaS billing (S21)

---

## Sprint Completion Summary

| Sprint | Theme | Deliverables |
|---|---|---|
| 1 | Booking loop | WhatsApp → WebView → lesson, slot locks, JWT, seed |
| 2 | Dashboard | People CRUD, weekly calendar, lesson status, teacher portal |
| 3 | Billing | Charges, cancellation policy, auto-charge, mark paid |
| 4 | External flows | Lead capture, WhatsApp cancellation, payment request |
| 5 | Multi-role | Teacher route guards, RBAC hardening, archive integrity |
| 6 | Production readiness | Secrets audit, logging, env validation, QA, playbook |
| 7 | WhatsApp Embedded Signup | Per-org number, AES-256-GCM token, webhook routing |
| 8 | Real payments | Cardcom + PayPlus, abstraction layer, payment webhook |
| 9 | KPI + auto payment | Revenue/debt dashboard, auto-send after lesson completion |
| 10 | Holidays + self-service | Org holidays, teacher-managed availability + overrides |
| 11 | Recurring lessons | Series create/cancel, conflict detection, series badge |
| 12 | Automated reminders | Lesson + payment Edge Functions, notification_log dedup |
| 13 | Single scheduling + parent portal | Single lesson creation, WhatsApp OTP portal, UX polish |
| 14 | Homework + WhatsApp intents | Homework engine, balance/schedule/receipt/portal intents |
| 15 | Tax receipts + Bit/PayBox | Green Invoice receipts, Bit + PayBox adapters |
| 16 | Custom templates + iCal + portal receipts | 14 template types, iCal subscription, receipt links |
| 17 | Analytics & reporting | 5 report pages, CSV export, 3 new KPI cards, recharts |

---

## Documents Status

| Document | Status | Last Updated |
|---|---|---|
| AGENTS.md | ✅ Current (Sprint 17) | Sprint 17 |
| sprint-roadmap.md | ✅ Full roadmap Sprints 1–22 | Sprint 17 |
| status.md | ✅ This file | Sprint 17 |
| sprint-1 → sprint-17 scope | ✅ Done | Per sprint |
| decisions.md | ⚠️ Needs update for Sprints 13–17 decisions | Sprint 12 |
| security.md | ⚠️ Needs update for Sprint 15–17 (receipts, reports) | Sprint 7 |
| qa-e2e-staging.md | ⚠️ Needs update for Sprint 13–17 scenarios | Sprint 8 |
| release-checklist.md | ✅ Current | Sprint 6 |
| data-recovery-playbook.md | ✅ Current | Sprint 6 |
