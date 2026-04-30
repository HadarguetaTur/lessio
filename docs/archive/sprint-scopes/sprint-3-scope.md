# LESSIO — Sprint 3 Scope

## Goal

LESSIO stops being a "scheduling system" and becomes a "business management system" — cancellations, charges, debt tracking.

**Milestone:** Business Logic Product

---

## Dependencies

- Sprint 2 complete: people/relationships/lesson status all working
- DB migration required before any work: `teachers.hourly_rate numeric(10,2)`

---

## ⚠️ Strategy

**Do not start 3B before 3A passes all its tests.**
The engine (3A) must be stable before building UI on top of it (3B).

---

## Explicit Scope

### ✅ In Scope

**3A — Engine & Rules:**
- Migration: teachers.hourly_rate
- Cancellation policies (read + configure)
- Cancellation calculation library
- Manual lesson cancellation from dashboard
- Admin override — waive charge
- Automatic charge creation on lesson completed
- Billing parent resolution
- Duplicate charge prevention (idempotency)

**3B — UI & Visibility:**
- Charges list + filters
- Mark charge as paid
- Parent debt summary

### ❌ Out of Scope (do not build)

- Parent cancellation via WhatsApp (Sprint 4)
- Payment provider integration
- PDF invoices
- Automatic monthly summaries
- Teacher billing access
- Automated reminders

---

## Epics & Stories

---

### 3A — EPIC A: Cancellation Policies

**Story: Policy Model**

- Read `cancellation_policy` by organization
- Set `notice_hours_full`, `notice_hours_partial`, `partial_charge_percent`
- Simple UI to update policy (owner only)

**Story: Cancellation Calculation Library**

- Central function: `calculateCancellationCharge(lesson, cancelledAt, policy)`
- Output: `{ shouldCharge, chargeType, amount, reasonCode }`
- Comprehensive unit tests for all edge cases (see Non-Negotiable Tests)

**Story: Cancellation Edge Cases**

- Exactly on the notice window boundary
- Timezone correctness (UTC vs local)
- Missing policy fallback — no crash

---

### 3A — EPIC B: Manual Cancellation from Dashboard

- Cancel button on lesson detail page
- Select cancellation reason
- Admin can waive the charge
- Change `lesson.status` → cancelled
- Calculate charge if required by policy

---

### 3A — EPIC C: Charge Engine

**Story: Automatic Charge on Completed Lesson**

- When status changes to `completed`: automatically create a charge
- `amount = teachers.hourly_rate * (duration_minutes / 60)`
- Parent resolution: `is_primary = true` from `relationships`
- If no primary parent → log + visible alert, no crash

**Story: Idempotency**

- Unique constraint on `lesson_id` in `charges` (prevent duplicates)
- Retry-safe — can be called twice without creating a duplicate

---

### 3B — EPIC D: Charges Management UI

- Charges list with filter: status / parent / date range
- Mark charge as paid: `paid_at` + note + immediate UI update
- Parent debt summary: total outstanding balance per parent
- Summary displayed on parent detail page

---

## Suggested Execution Order

| Step | Phase | Task |
|---|---|---|
| 1 | 3A | Migration: teachers.hourly_rate |
| 2 | 3A | Cancellation policy model + UI |
| 3 | 3A | Calculation lib + unit tests |
| 4 | 3A | Dashboard cancellation flow |
| 5 | 3A | Charge creation engine (completed trigger) |
| 6 | 3A | Idempotency protection + retry tests |
| 7 | 3B | Charges list UI |
| 8 | 3B | Mark as paid flow |
| 9 | 3B | Parent debt summary |

**3A checkpoint:** All 3A tests must pass before moving to 3B.

---

## Non-Negotiable Tests — Sprint 3

| What | Minimum Coverage |
|---|---|
| calculateCancellationCharge | Cancel 48h before (no charge), 12h before (partial), 1h before (full), exactly on boundary, no policy |
| Charge creation | Completed lesson creates exactly one charge, retry does not duplicate |
| Billing parent resolution | Student with primary parent, student without primary → defined error |
| Timezone | Cancellation at 00:30 local time is not counted as "the day before" due to UTC offset |
| hourly_rate | Correct charge for 45/60/90 minutes, missing rate → clear error |

---

## Definition of Done — Sprint 3

- [ ] Migration teachers.hourly_rate exists and applied to production
- [ ] All non-negotiable tests pass
- [ ] Policy engine calculates correctly for all rules
- [ ] Admin can cancel a lesson from the dashboard
- [ ] Cancellation charge is created only when required
- [ ] Completed lesson creates an automatic charge
- [ ] No duplicate charges (verified with retry)
- [ ] If parent/rate is missing — system does not crash
- [ ] owner/admin can view charges
- [ ] owner/admin can mark a charge as paid
- [ ] Parent debt summary displays correctly

---

## Ground Rules for Claude Code — Sprint 3

```
You are building LESSIO Sprint 3 — Billing & Cancellation Engine.

Rules:
1. Start with the migration: teachers.hourly_rate numeric(10,2).
2. Build 3A fully before touching 3B. All 3A tests must pass first.
3. calculateCancellationCharge() lives in src/lib/billing/ — not in components or route handlers.
4. Charge creation must be idempotent. Unique constraint on charges.lesson_id.
5. Missing hourly_rate → clear error, not a crash.
6. Missing primary parent → log + visible alert, not a crash.
7. All cancellation timezone math uses UTC internally, converts to org timezone for display.
8. Do not build: WhatsApp cancellation (Sprint 4), payment provider, PDF invoices.
9. "waive" = admin override to skip charge. Must be explicit, not default.
10. Before any story: read /docs/schema.md and /docs/decisions.md.
```
