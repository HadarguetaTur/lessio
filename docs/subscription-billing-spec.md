# Subscription & Billing Feature Spec

> Reference document for implementing the subscription + student billing mechanism in **Lessio**.
> Original source: RAZ-MICHAEL-MAZURIK (Airtable-backed tutoring management app) — adapted for the Lessio data model.

---

## Table of Contents

1. [Data Model](#1-data-model)
2. [Lesson Types & Billing Rules](#2-lesson-types--billing-rules)
3. [Active Subscription Logic](#3-active-subscription-logic)
4. [Monthly Bill Calculation](#4-monthly-bill-calculation)
5. [Cancellation Billing](#5-cancellation-billing)
6. [Default Prices](#6-default-prices)
7. [Billing Record & Status Lifecycle](#7-billing-record--status-lifecycle)
8. [buildStudentMonth — Full Flow](#8-buildstudenttmonth--full-flow)
9. [Edge Cases & Known Constraints](#9-edge-cases--known-constraints)

---

## 1. Data Model

> Tables marked **[NEW]** do not yet exist and require a Supabase migration.
> Tables marked **[EXISTS]** exist — only the billing-relevant fields are listed.

---

### 1.1 `subscriptions` Table **[NEW]**

```sql
CREATE TABLE subscriptions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  student_id        uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subscription_type text,                        -- display label only, e.g. 'group', 'pair'
  monthly_amount    numeric(10,2) NOT NULL,       -- fixed monthly fee in ILS
  start_date        date NOT NULL,
  end_date          date,                         -- NULL = open-ended
  is_paused         boolean NOT NULL DEFAULT false,
  pause_date        date,                         -- informational only
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
```

**Notes:**
- `subscription_type` is a UI-facing label only. Billing logic does **not** branch on its value.
- A student can have multiple subscription records, but only one may be active per billing month (overlapping date ranges trigger an error — see §4.3).
- `is_paused = true` disables the subscription entirely (see §9.2).
- RLS must filter by `organization_id`.

---

### 1.2 `lessons` Table (billing-relevant fields) **[EXISTS]**

| Field | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `organization_id` | uuid | Multi-tenant foreign key |
| `lesson_type` | `'individual'` \| `'pair'` \| `'group'` | Determines billing logic branch |
| `status` | `'scheduled'` \| `'completed'` \| `'cancelled'` \| `'no_show'` | Determines billability |
| `start_at` | timestamptz | Lesson start in UTC. Used for subscription date checks and billing month derivation |
| `end_at` | timestamptz | Lesson end in UTC. Used for duration-based pricing |
| `price_per_student` | numeric(10,2) | **[NEW FIELD — migration required]** Optional per-student override for `pair`/`group` lessons. `NULL` = use default |

> **Students** are **not** stored directly on `lessons`. They are linked via the `lesson_students` junction table (`lesson_id`, `student_id`, `organization_id`). For billing, all students enrolled in a lesson are resolved through `lesson_students`.

> **Billing month** is **not** a stored field. It is always derived from `start_at` converted to the org's IANA timezone (e.g. `Asia/Jerusalem`) and formatted as `YYYY-MM`. Use `luxon` (already a project dependency) for this conversion.

**Billable statuses** (lesson is included in billing):
```
'scheduled' | 'completed'
```

**Excluded statuses** (lesson is skipped entirely):
```
'cancelled' | 'no_show'
```

---

### 1.3 `student_cancellation_events` Table **[NEW]**

This table tracks late-cancellation events that may result in a charge. It is distinct from the existing `charges` table — cancellation events are logged here, and `is_charged` is manually confirmed before billing.

```sql
CREATE TABLE student_cancellation_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lesson_id           uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  student_id          uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  cancellation_date   timestamptz NOT NULL,        -- when the cancellation was made
  hours_before        numeric(8,2) NOT NULL,       -- hours between cancellation and lesson start
  is_lt_24h           boolean NOT NULL,            -- true if hours_before < 24
  is_charged          boolean NOT NULL DEFAULT false, -- manually confirmed by admin before billing
  charge_override     numeric(10,2),               -- explicit amount override; NULL = use policy logic
  billing_month       text NOT NULL,               -- YYYY-MM, derived from lesson.start_at
  created_at          timestamptz NOT NULL DEFAULT now()
);
```

**Notes:**
- `is_charged = true` is required for a cancellation to contribute to the monthly bill.
- `charge_override` takes precedence over all policy logic when set.
- The existing `charges` table (with `charge_type = 'cancellation'`) handles real-time cancellation charges. This table handles the monthly billing path. They serve different flows and must not double-count (see §5.3).

---

### 1.4 `student_monthly_billing` Table **[NEW]**

One record per student per billing month per organization. Upserted by the billing engine.

```sql
CREATE TABLE student_monthly_billing (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  student_id                uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  parent_id                 uuid REFERENCES parents(id),  -- primary billing parent at time of calc
  billing_month             text NOT NULL,                -- YYYY-MM
  is_paid                   boolean NOT NULL DEFAULT false,
  is_approved               boolean NOT NULL DEFAULT false,
  lessons_amount            numeric(10,2) NOT NULL DEFAULT 0,
  subscriptions_amount      numeric(10,2) NOT NULL DEFAULT 0,
  cancellations_amount      numeric(10,2) NOT NULL DEFAULT 0,
  total_amount              numeric(10,2) NOT NULL DEFAULT 0,
  lessons_count             integer NOT NULL DEFAULT 0,
  manual_adjustment_amount  numeric(10,2),
  manual_adjustment_reason  text,
  manual_adjustment_date    date,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, student_id, billing_month)
);
```

**Critical:** `manual_adjustment_*` fields are set by users and must **never** be overwritten during recalculation.

---

### 1.5 Entity Relationships

```
organizations ──< subscriptions          (one org, many subscriptions)
organizations ──< student_monthly_billing
students      ──< subscriptions          (one student, many subscription records)
students      ──< student_cancellation_events
students      ──< student_monthly_billing (one record per student per month)
lessons       ──< lesson_students        (junction — one lesson, many students)
lessons       ──< student_cancellation_events
```

---

## 2. Lesson Types & Billing Rules

### 2.1 Individual (`individual`)

- Never affected by subscriptions.
- Amount = `teacher.hourly_rate × duration_hours` (existing billing engine behavior).
- Multi-student individual lessons: **unsupported** — emit a `MissingFieldsError` (no split rule defined).

### 2.2 Pair (`pair`)

- Check for active subscription on lesson date (see §3.1).
  - **Active subscription → ₪0** (subscription covers the lesson)
  - **No active subscription → use `price_per_student` if set → default ₪112.50**
- Amount resolution (no subscription): `lessons.price_per_student` → **₪112.50**

### 2.3 Group (`group`)

- Same subscription check as pair.
  - **Active subscription → ₪0**
  - **No active subscription → use `price_per_student` if set → default ₪120**
- Amount resolution (no subscription): `lessons.price_per_student` → **₪120**

---

## 3. Active Subscription Logic

### 3.1 Per-Lesson Check (`checkActiveSubscriptionForLesson`)

Used to determine if a lesson should be zeroed for `pair`/`group` lessons.

```
function checkActiveSubscriptionForLesson(studentId, lessonDate, subscriptions):
  for each subscription in subscriptions:
    if subscription.student_id !== studentId → skip
    if subscription.is_paused === true → skip
    if subscription.start_date > lessonDate → skip  (not started yet)
    if subscription.end_date is set
      AND subscription.end_date < lessonDate → skip  (expired)
    return true  ← active subscription found

  return false
```

**Date comparison:** extract date component from `start_at` in org timezone (`Asia/Jerusalem`) before comparing. Use `luxon` (already a project dependency in `createLesson.ts`).

---

### 3.2 Per-Month Check (`isSubscriptionActiveForMonth`)

Used to determine if a subscription contributes a monthly fee for a given billing month.

```
function isSubscriptionActiveForMonth(subscription, billingMonth "YYYY-MM"):
  if subscription.is_paused === true → false

  monthStart = first day of billingMonth  (00:00:00)
  monthEnd   = last day of billingMonth   (23:59:59)

  if subscription.start_date > monthEnd → false   (starts after the month)
  if subscription.end_date is set
    AND subscription.end_date < monthStart → false  (ended before the month)

  return true
```

---

### 3.3 Pro-Rata Calculation

When a subscription starts or ends mid-month, charge only for the active days.

```
function calculateProRataAmount(monthlyAmount, billingMonth, startDate, endDate?):
  if monthlyAmount <= 0 → return 0

  daysInMonth    = number of days in billingMonth
  effectiveStart = max(startDate, firstDayOfMonth)
  effectiveEnd   = min(endDate ?? ∞, lastDayOfMonth)
  activeDays     = floor((effectiveEnd - effectiveStart) / 86400000) + 1

  if activeDays >= daysInMonth → return monthlyAmount  (full month)
  return round(monthlyAmount × activeDays / daysInMonth, 2)
```

---

## 4. Monthly Bill Calculation

### 4.1 Formula

```
total_amount = lessonsTotal + cancellationsTotal + subscriptionsTotal + manualAdjustment
```

`manualAdjustment` is read from the **existing** `student_monthly_billing` record (if any) and preserved as-is.

---

### 4.2 Lessons Contribution

For each lesson in `billingMonth` linked to `studentId` (via `lesson_students`):

1. Derive `billing_month` from `lesson.start_at` in org timezone; skip if it doesn't match the target month.
2. Skip if `status` is `'cancelled'` or `'no_show'`.
3. Skip if `status` is not `'scheduled'` or `'completed'`.
4. Skip if lesson ID is in `cancelledLessonIds` set (lessons that have a `student_cancellation_events` record are excluded from lessons total — they appear in cancellations instead).
5. Calculate amount via §2 rules.
6. For `pair`/`group`: include only if `amount > 0` (amount = 0 means subscription covered).
7. For `individual`: always include.

---

### 4.3 Subscriptions Contribution

1. Filter subscriptions where `isSubscriptionActiveForMonth` is true.
2. **If more than one active subscription overlaps** → return `MissingFieldsError` (do not auto-sum).
3. For each active subscription: apply `calculateProRataAmount`.
4. Sum = `subscriptionsTotal`.

---

### 4.4 Cancellations Contribution

See §5 for full logic.

---

### 4.5 NO_BILLABLE_DATA Rule

If after calculation:
- `lessonsCount === 0`
- `cancellationsCount === 0`
- `activeSubscriptionsCount === 0`

→ Do **not** create a billing record. Skip the student silently.  
This prevents empty billing records for students with no activity in the month.

---

## 5. Cancellation Billing

### 5.1 Standard Lessons (`individual`, `pair`, `group`)

A cancellation event from `student_cancellation_events` is charged when **all** of the following are true:

1. `billing_month` matches the target month
2. `is_lt_24h === true` (cancelled less than 24 hours before the lesson)
3. `is_charged === true` (manually confirmed by admin)

Amount resolution:
- `charge_override` field set explicitly → use it
- Linked lesson is `individual` → `teacher.hourly_rate × duration_hours`
- Linked lesson is `group` → check subscription → if active: ₪0; else `lessons.price_per_student` → **₪120**
- Linked lesson is `pair` → check subscription → if active: ₪0; else `lessons.price_per_student` → **₪112.50**
- Linked lesson not resolvable → `MissingFieldsError`

### 5.2 Double-Counting Prevention

Before calculating lessons contribution, build a set of lesson IDs that have any associated `student_cancellation_events` record (`cancelledLessonIds`). Filter those lessons out of the lessons list. This ensures a cancelled lesson is counted only once — in the cancellations section.

> **Note:** This applies specifically to the `student_monthly_billing` engine. The existing real-time `charges` table (with `charge_type = 'cancellation'`) is a separate flow used for immediate charge + payment-link generation. Do not mix or double-count between the two flows.

---

## 6. Default Prices

| Lesson Type | Default per-student charge | Resolution order |
|---|---|---|
| `individual` | Teacher-rate based | `teacher.hourly_rate × duration_hours` |
| `pair` | **₪112.50** | `lessons.price_per_student` → ₪112.50 |
| `group` | **₪120** | `lessons.price_per_student` → ₪120 |

> `lessons.price_per_student` is a new column (numeric, nullable) that requires a migration. When `NULL`, the hardcoded default applies.

---

## 7. Billing Record & Status Lifecycle

### 7.1 Status Values

| Status | Condition |
|---|---|
| `approved` | Default. No pending cancellation events, not paid. |
| `pending_approval` | One or more `student_cancellation_events` where `is_charged` is not yet confirmed. |
| `paid` | `is_paid = true` (manually set by user). |

Status is derived at write time from the data — it is not stored as a separate column in `student_monthly_billing`.

### 7.2 Billing Record Lifecycle

```
[No record]
    │
    ▼  (first run of buildStudentMonth)
[Record created — is_approved: true / false based on pending cancellations]
    │
    ├── Admin reviews and confirms is_charged on cancellation events
    │        ▼
    │   [Recalculate] → updates amounts, preserves manual_adjustment_*
    │
    ├── Admin adds manual_adjustment_amount + reason
    │        ▼
    │   [Recalculate] → total_amount = computed + adjustment
    │
    └── Admin sets is_paid = true
             ▼
         [is_paid: true, is_approved: true]
```

### 7.3 Upsert Behavior

- If **no existing record** → create new.
- If **one existing record** → update all computed fields; preserve `manual_adjustment_*` and `is_paid`.
- The PostgreSQL `UNIQUE (organization_id, student_id, billing_month)` constraint prevents duplicates at the DB level.

---

## 8. `buildStudentMonth` — Full Flow

```
buildStudentMonth(organizationId, studentId, billingMonth "YYYY-MM"):

  1. FETCH student record (verify belongs to organizationId)

  2. FETCH lessons where:
       lesson_students.student_id = studentId
       AND lessons.organization_id = organizationId
       AND start_at >= first day of billingMonth (UTC, derived from org timezone)
       AND start_at <  first day of next month   (UTC, derived from org timezone)

  3. FETCH student_cancellation_events where:
       student_id = studentId
       AND organization_id = organizationId
       AND billing_month = billingMonth

  4. FETCH subscriptions where:
       student_id = studentId
       AND organization_id = organizationId

  5. BUILD cancelledLessonIds = set of lesson IDs referenced by any cancellation event record

  6. FILTER lessons → lessonsWithoutCancellations

  7. CALCULATE lessonsContribution(lessonsWithoutCancellations, billingMonth, studentId, subscriptions)
       → {lessonsTotal, lessonsCount} or MissingFieldsError

  8. CALCULATE cancellationsContribution(cancellations, lessonLookup, subscriptions)
       → {cancellationsTotal, cancellationsCount, pendingCancellationsCount} or MissingFieldsError

  9. CALCULATE subscriptionsContribution(subscriptions, billingMonth)
       → {subscriptionsTotal, activeSubscriptionsCount} or MissingFieldsError

  10. IF any step returned MissingFieldsError → return that error

  11. IF no billable data (all counts = 0) → skip (do not create record)

  12. total = lessonsTotal + cancellationsTotal + subscriptionsTotal

  13. FETCH existing student_monthly_billing record for (organizationId, studentId, billingMonth)
        (UNIQUE constraint guarantees at most one row)

  14. READ manualAdjustment from existing record (default 0)

  15. totalToWrite = total + manualAdjustment

  16. UPSERT student_monthly_billing:
        lessons_amount, subscriptions_amount, cancellations_amount,
        total_amount = totalToWrite, lessons_count,
        is_paid (preserve existing), is_approved (computed from pending cancellations),
        preserve manual_adjustment_* if they exist

  17. RETURN BillingResult
```

### 8.1 Bulk Run (`buildMonthForAllActiveStudents`)

For efficiency, the bulk run pre-fetches all data in 5 queries, then groups by student ID using in-memory Maps before calling `buildStudentMonth` per student with prefetched data:

```
1. Fetch all active students           (organization_id = X, is_active = true)
2. Fetch all lessons for the month     (organization_id = X, start_at in month range)
3. Fetch all cancellation events       (organization_id = X, billing_month = YYYY-MM)
4. Fetch ALL subscriptions             (organization_id = X)
5. Fetch all existing billing records  (organization_id = X, billing_month = YYYY-MM)

→ Group each dataset by studentId in Maps
→ For each student: buildStudentMonth(student, prefetchedData)
→ Collect: success[], errors[], skipped[]
```

---

## 9. Edge Cases & Known Constraints

### 9.1 Overlapping Subscriptions

If a student has two or more subscriptions that are both active for the same billing month and their date ranges overlap, the engine **does not sum them**. It returns a `MissingFieldsError` requiring manual resolution before billing can proceed.

### 9.2 Paused Subscription

`is_paused = true` disables the subscription entirely:
- No monthly fee is charged.
- Lessons during the pause period are NOT covered — `pair`/`group` lessons are charged at normal rates.

### 9.3 Individual Lesson with Multiple Students

An `individual` lesson that has more than one student in `lesson_students` is **not billed**. A `MissingFieldsError` is emitted. The business must decide the split rule before it can be processed.

### 9.4 Unresolvable Cancellation Lesson Link

If a `student_cancellation_events` record's `lesson_id` cannot be resolved (record deleted or bad reference), a `MissingFieldsError` is returned — the entire month's billing for that student is blocked until fixed.

### 9.5 `subscription_type` Is Informational Only

The value of `subscription_type` does **not** restrict which lessons are covered. Any non-paused subscription within its date range covers any `pair`/`group` lesson for that student.

### 9.6 Cancellation Double-Counting

The `charges` table (with `charge_type = 'cancellation'`) and `student_cancellation_events` serve different flows. The monthly billing engine reads from `student_cancellation_events` only. Ensure that charges created via the real-time cancellation flow are not also present in `student_cancellation_events` for the same lesson, or the lesson will be double-counted.

### 9.7 Timezone

All date/time math for billing month boundaries uses the organization's IANA timezone (stored as `organizations.timezone`). Use `luxon` (already a project dependency — see `src/lib/lessons/createLesson.ts`) for accurate timezone-aware month boundary calculations. Do not use native `Date` methods for month boundary derivation.

### 9.8 Manual Adjustment Preservation

On every recalculation, `manual_adjustment_amount`, `manual_adjustment_reason`, and `manual_adjustment_date` are read from the existing `student_monthly_billing` record and written back unchanged. They are never reset by the engine.

### 9.9 Multi-Tenant Isolation

Every query in the billing engine **must** filter by `organization_id`. Subscriptions, cancellation events, lessons, and billing records are all org-scoped. The RLS policies on each new table must enforce this at the DB level as well.

---

## Appendix: MissingFieldsError Contract

When the engine cannot determine the correct billing amount due to a data gap or undefined business rule, it returns a structured `MissingFieldsError` instead of silently mis-billing:

```typescript
interface MissingFieldsError {
  MISSING_FIELDS: Array<{
    table: string;          // e.g. 'subscriptions', 'lessons', 'student_cancellation_events'
    field: string;          // Which field is missing or ambiguous
    why_needed: string;     // Human-readable explanation
    example_values: string[];  // Suggested valid values
  }>;
}
```

**Example:**

```typescript
{
  MISSING_FIELDS: [{
    table: 'subscriptions',
    field: 'end_date',
    why_needed: 'Two subscriptions are active for the same billing month — end_date must be set on one to resolve the overlap',
    example_values: ['2026-03-31']
  }]
}
```

This pattern ensures billing errors are explicit and auditable rather than producing silent wrong totals.
