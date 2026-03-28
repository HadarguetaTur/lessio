# Sprint 9 — KPI Dashboard + Auto Payment Request

**Status:** Planned  
**Goal:** Owner/admin sees meaningful business metrics on the dashboard. When a lesson is marked completed, the system can optionally send the payment request to the parent automatically — no manual step required.

> **Note:** The previously planned Sprint 9 ("Teaching Operations — Google Calendar + homework") is deferred to Sprint 13. The gaps identified in the holistic system review take priority.

---

## Pre-Sprint State

Sprint 8 delivered: Cardcom payment provider (encrypted per-org), payment links on charges, webhook for auto-marking charges as paid.  
Auto-charge creation on lesson completion already exists in `setLessonStatus` (calls `createLessonCharge` when `status === 'completed'`).  
What is missing: the dashboard shows only today's lesson list — no revenue, debt, or trend data. After charge creation, a human must still manually trigger the payment request.

---

## Story 0 — Note on Charge Auto-Creation

`createLessonCharge` is already called automatically inside `setLessonStatus` in `src/app/(dashboard)/lessons/[id]/actions.ts` when `status === 'completed'`. No change needed here. The gap is:
1. No KPI view of the financial state.
2. No automatic payment request dispatch after the charge is created.

---

## Story 1 — Schema: `auto_send_payment_request` Org Setting

**`supabase/migrations/20260330000001_sprint9_auto_payment.sql`**

```sql
ALTER TABLE organizations
  ADD COLUMN auto_send_payment_request boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN organizations.auto_send_payment_request IS
  'When true, a payment request WhatsApp message with Cardcom link is sent automatically when a lesson charge is created on lesson completion.';
```

No other schema changes. All KPI data is computed from existing `charges` and `lessons` tables.

---

## Story 2 — KPI Stats Query

**`src/lib/dashboard/stats.ts`** (new, server-only)

```typescript
export type DashboardStats = {
  monthlyRevenue: number        // SUM(charges.amount) WHERE status='paid', paid_at in current calendar month
  pendingDebt: number           // SUM(charges.amount) WHERE status='pending'
  lessonsThisMonth: number      // COUNT(lessons) WHERE start_at in current month, status != 'cancelled'
  activeStudents: number        // COUNT(DISTINCT lesson_students.student_id) with lesson in last 30 days
}

export async function getDashboardStats(orgId: string, timezone: string): Promise<DashboardStats>
```

Implementation uses `createServiceRoleClient()`. Four separate Supabase queries (simple `count`/`sum` aggregates via `.select('amount.sum()',...)`). Month boundaries computed in UTC from the org's `timezone` using `Intl.DateTimeFormat`.

---

## Story 3 — Dashboard Page: KPI Cards

**`src/app/(dashboard)/dashboard/page.tsx`** (update)

Add above the existing today's lesson summary:

```tsx
<section className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
  <KpiCard label="הכנסה החודש" value={`₪${stats.monthlyRevenue.toLocaleString('he-IL')}`} />
  <KpiCard label="חוב פתוח" value={`₪${stats.pendingDebt.toLocaleString('he-IL')}`} highlight={stats.pendingDebt > 0} />
  <KpiCard label="שיעורים החודש" value={stats.lessonsThisMonth} />
  <KpiCard label="תלמידים פעילים" value={stats.activeStudents} />
</section>
```

**`src/components/dashboard/KpiCard.tsx`** (new, server component)

Props: `label: string`, `value: string | number`, `highlight?: boolean`.  
Renders a white card with border, large number in bold, label below. `highlight` renders the value in amber to draw attention to outstanding debt.

Teachers are already redirected to `/teacher/schedule` before this section renders — no role guard needed.

---

## Story 4 — Charges Aging Summary

**`src/app/(dashboard)/charges/page.tsx`** (update)

Add a summary bar above the filter/table:

```tsx
<div className="flex gap-6 mb-5 text-sm">
  <span>ממתין: <strong>₪{pendingTotal.toFixed(2)}</strong></span>
  <span>חויב: <strong>₪{invoicedTotal.toFixed(2)}</strong></span>
  <span>שולם החודש: <strong>₪{paidThisMonth.toFixed(2)}</strong></span>
</div>
```

These three values are computed from the already-fetched `charges` array on the server — no additional query needed.

---

## Story 5 — Auto Payment Request After Lesson Completion

**`src/lib/payment-request/autoSend.ts`** (new, server-only)

```typescript
/**
 * Called after createLessonCharge succeeds.
 * If the org has auto_send_payment_request = true AND a payment provider is configured,
 * creates a Cardcom payment link, saves it to the charge, and sends WhatsApp to the parent.
 * Fire-and-forget pattern: failures are logged but do not surface to the UI.
 */
export async function autoSendPaymentRequest(
  lessonId: string,
  orgId: string
): Promise<void>
```

Logic:
1. Fetch org — check `auto_send_payment_request` and `payment_provider`.
2. If either is false/null, return early.
3. Fetch the just-created charge by `lesson_id` + `org_id` + `charge_type='lesson'`.
4. Call `getPaymentProvider(orgId)` → `provider.createPaymentLink(...)`.
5. Update `charges` row: `payment_link`, `payment_reference`, `payment_provider`.
6. Send WhatsApp via existing `sendPaymentRequestMessage` in `src/lib/payment-request/index.ts`.
7. Catch and log all errors — never throws.

**`src/app/(dashboard)/lessons/[id]/actions.ts`** (update)

After `createLessonCharge` returns `null` (success):

```typescript
// fire-and-forget — error handled internally
void autoSendPaymentRequest(lessonId, orgId)
```

---

## Story 6 — Settings: Auto Payment Request Toggle

**`src/app/(dashboard)/settings/payment/page.tsx`** (update)

Below the existing provider configuration form, add a toggle (owner-only):

```tsx
<label className="flex items-center gap-3 cursor-pointer">
  <input type="checkbox" name="auto_send_payment_request" defaultChecked={org.auto_send_payment_request} />
  <span>שלח בקשת תשלום אוטומטית בסיום שיעור</span>
</label>
```

**`src/app/(dashboard)/settings/payment/actions.ts`** (update `savePaymentProvider`)

Add `auto_send_payment_request: z.boolean()` to Zod schema. Persist to `organizations`.

---

## Architecture After Sprint 9

```
Teacher/Admin marks lesson → completed
  → setLessonStatus
    → updateLessonStatus (DB)
    → createLessonCharge (idempotent)
      → if org.auto_send_payment_request AND payment_provider:
        → autoSendPaymentRequest (fire-and-forget)
          → createPaymentLink (Cardcom)
          → charges: payment_link + payment_reference
          → WhatsApp to parent

/dashboard
  → getDashboardStats (4 SQL aggregates)
    → KpiCards: revenue | debt | lessons | active students
  → existing today's lesson table (unchanged)

/charges
  → aging summary bar (computed from existing charges array)
  → existing table (unchanged)
```

---

## What is NOT in Sprint 9

- Monthly revenue chart / trend graph (Sprint 11 Reporting)
- Teacher earnings report
- CSV export
- Refund flows
- Recurring lessons (Sprint 11)
- Automated reminders (Sprint 12)
- Google Calendar sync (Sprint 13)
