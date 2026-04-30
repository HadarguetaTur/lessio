# Sprint 22 — Billing Cycle Completion + Subscription Management + i18n Cleanup
*Branch: `sprint-22`*
*Depends on: Sprint 21 complete*

---

## Context: What Was Already Built

Before Sprint 22 begins, the following was built (outside the official sprint plan) and is fully in place:

| Feature | Status |
|---|---|
| `subscriptions` table + RLS + `src/lib/subscriptions/index.ts` | ✅ Done |
| `student_monthly_billing` table + `student_cancellation_events` table | ✅ Done |
| `charges.billing_record_id` + `charges.billing_month` + `monthly` charge type | ✅ Done |
| Monthly billing engine (`src/lib/billing/monthly/`) — full computation + sync | ✅ Done |
| `/billing` page — list + generate button + mark-paid button | ✅ Done |
| `/billing/[studentId]` — breakdown by lessons / subscriptions / cancellations | ✅ Done |
| `billing/actions.ts` — generate, recalculate, mark-paid, manual adjustment, subscription CRUD | ✅ Done |
| Student groups — `student_groups` table + lib + GroupsTable + GroupFormSheet + students page tab | ✅ Done |
| Onboarding wizard — `/onboarding` multi-step wizard with teacher/student/lesson import steps | ✅ Done |
| `organizations.onboarding_completed` flag + redirect in dashboard layout | ✅ Done |

---

## Goal

Three parallel workstreams that close visible gaps:

1. **Billing cycle end-to-end** — the "approve → send payment request" step is missing; owners can generate and mark paid but cannot trigger a payment request from a billing record.
2. **Subscription management UI** — the backend (lib + actions) is fully implemented but there is no dashboard page to view, create, or edit subscriptions.
3. **i18n cleanup** — the i18n infrastructure from Sprint 21 is in place but several dashboard pages still contain hardcoded Hebrew strings (`/charges`, `/billing`, `/leads`, `/homework` and their sub-components).

---

## Story 1 — Billing Approval + WhatsApp Payment Request

**Why:** Currently the billing workflow is: generate → mark-paid (skipping approval and payment collection). Owners need to: generate → review → approve → send payment request → receive payment → mark paid.

**What's missing:**
- `approveBillingAction` server action (`is_approved = true` on `student_monthly_billing`)
- On approval: `syncMonthlyCharge` (creates/updates the `monthly` charge) + optionally send WhatsApp payment request if `organizations.auto_send_payment_request = true`
- Approve button in `/billing` list page (per row)
- Approve button in `/billing/[studentId]` detail page header
- "Send payment request" standalone button in detail page (for manual resend)

**Server actions to add to `billing/actions.ts`:**
- `approveBillingAction(billingId)` → sets `is_approved = true`, calls `syncMonthlyCharge`, fire-and-forgets `sendPaymentRequest` if enabled
- `sendBillingPaymentRequestAction(billingId)` → explicit manual resend

**Translation keys needed** (add to `billing` namespace in both `messages/he.json` and `messages/en.json`):
- `billing.approve`, `billing.sendPaymentRequest`, `billing.approveConfirm`, `billing.paymentRequestSent`, `billing.noBillingRecords`

**Out of scope:** Stripe payment for monthly billing (deferred to Sprint 23+).

---

## Story 2 — Subscription Management Page

**Why:** The subscription lib and actions are complete but owners have no standalone UI to manage subscriptions. Currently the only entry point is the student detail sheet financial tab (read-only view).

**What to build:**

### 2a — Subscriptions list page: `/subscriptions`
- Page (owner/admin): list all active subscriptions across all students
- Columns: student name, type, monthly amount, start date, end date, status badge (active / on_hold / ended)
- Filter by status (active / paused / all)
- Link each row to student card
- Empty state

### 2b — Subscription form in student detail sheet
- `SubscriptionForm` client component (add new subscription for a student)
- Uses existing `createSubscriptionAction`, `updateSubscriptionAction` from `billing/actions.ts`
- Displayed in the Financial tab of `StudentDetailSheet` via "הוסף מנוי" button
- Fields: type (text), monthly amount, start date, end date (optional), pause toggle

### 2c — Sidebar nav entry
- "מנויים" nav item under Operations section (owner/admin)
- Route key in `TopBar.tsx` `ROUTE_KEY_MAP`

**Translation keys** (add to `subscriptions` namespace):
- All form labels, status values, empty state, action buttons — check existing keys first

---

## Story 3 — i18n Cleanup: Charges, Billing, Leads, Homework

The following pages/components still contain hardcoded Hebrew strings. All already have `getTranslations` / `useTranslations` imported; the work is adding missing keys and replacing literals.

### Pages to fix:

| File | Example strings still hardcoded |
|---|---|
| `src/app/(dashboard)/charges/page.tsx` | `כל הסטטוסים`, `כל ההורים`, `סנן`, `איפוס`, `סוג`, `קישור תשלום`, `פרטים ↗`, `דרך {provider}`, `סומן ידנית`, `קבלה ↗`, `לא הופקה` |
| `src/app/(dashboard)/charges/[id]/page.tsx` | charge detail strings |
| `src/app/(dashboard)/billing/page.tsx` | `חודש`, month selector labels, summary row strings |
| `src/app/(dashboard)/billing/[studentId]/*.tsx` | `ManualAdjustmentForm`, `CancellationEventRow`, `RecalculateButton` component strings |
| `src/app/(dashboard)/leads/page.tsx` | lead list filter strings |
| `src/app/(dashboard)/leads/[id]/convert/page.tsx` | convert form strings |
| `src/app/(dashboard)/homework/page.tsx` | homework list strings |
| `src/app/(dashboard)/homework/assign/page.tsx` | assign form strings |
| `src/app/(dashboard)/homework/templates/` | template CRUD strings |

**Process for each file:**
1. Read file — identify all Hebrew JSX literals
2. Check existing keys in the relevant namespace (`charges`, `billing`, `leads`, `homework`) in `messages/he.json`
3. Add missing keys to **both** `messages/he.json` AND `messages/en.json`
4. Replace literals with `t(...)` calls

**Key constraint:** Do not change logic, component structure, or behavior — string replacement only.

---

## Story 4 — Onboarding Wizard Translation

The onboarding wizard (`/onboarding` + `src/components/onboarding/`) was built outside the sprint cycle and is not translated.

**Files to translate:**
- `src/components/onboarding/OnboardingWizard.tsx`
- `src/components/onboarding/steps/WelcomeStep.tsx`
- `src/components/onboarding/steps/TeachersStep.tsx`
- `src/components/onboarding/steps/SettingsStep.tsx`
- `src/components/onboarding/steps/ImportStudentsStep.tsx`
- `src/components/onboarding/steps/ImportLessonsStep.tsx`
- `src/components/onboarding/steps/CompleteStep.tsx`
- `src/components/import/` components (FileUploadZone, ImportFlow, ImportPreviewTable, ImportResultsSummary)

**Approach:**
- Add new `onboarding` namespace to `messages/he.json` + `messages/en.json`
- Add new `import` namespace (for import flow components used in both onboarding and `/students/import`)
- The onboarding route is outside `(dashboard)` — use `getTranslations` for server components, `useTranslations` for client components (next-intl config already covers all routes)

---

## Schema Changes

None. All required tables and columns are already in place.

---

## New Dependencies

None. All required libs are already installed.

---

## New Env Vars

None.

---

## Files to Create

| File | Purpose |
|---|---|
| `src/app/(dashboard)/subscriptions/page.tsx` | Subscriptions list page |
| `src/app/(dashboard)/subscriptions/loading.tsx` | Skeleton |
| `src/components/dashboard/billing/SubscriptionForm.tsx` | Add/edit subscription form |
| `src/components/dashboard/billing/ApproveBillingButton.tsx` | Client button for approve action |
| `src/components/dashboard/billing/SendPaymentRequestButton.tsx` | Client button for manual resend |

---

## Files to Modify

| File | Change |
|---|---|
| `src/app/(dashboard)/billing/actions.ts` | Add `approveBillingAction`, `sendBillingPaymentRequestAction` |
| `src/app/(dashboard)/billing/page.tsx` | Add approve button per row + i18n fix |
| `src/app/(dashboard)/billing/[studentId]/page.tsx` | Add approve + send payment request buttons |
| `src/components/dashboard/students/StudentDetailSheet.tsx` | Add SubscriptionForm to Financial tab |
| `src/components/dashboard/Sidebar.tsx` | Add מנויים nav item |
| `src/components/dashboard/TopBar.tsx` | Add `/subscriptions` to ROUTE_KEY_MAP |
| `messages/he.json` | Add keys for billing approval, subscriptions page, onboarding, import |
| `messages/en.json` | Mirror of he.json additions |
| All files listed in Story 3 | Replace hardcoded Hebrew with `t(...)` |

---

## Acceptance Criteria

- [ ] Owner can approve a monthly billing record from both the list and detail pages
- [ ] Approving a billing record creates a `monthly` charge and (if `auto_send_payment_request = true`) sends a WhatsApp payment request to the parent
- [ ] Owner and admin can view all subscriptions at `/subscriptions`
- [ ] Owner and admin can add/edit/pause/end a subscription from the student detail sheet financial tab
- [ ] "מנויים" appears in the sidebar under Operations (owner/admin)
- [ ] `/charges`, `/billing`, `/leads`, and `/homework` pages display correctly in both Hebrew and English with no hardcoded Hebrew strings in JSX
- [ ] Onboarding wizard renders correctly in English locale
- [ ] `npm test` passes 100%

---

## Out of Scope

- Stripe SaaS billing (LESSIO charges its own customers) — deferred to Sprint 23
- International payment methods (Stripe as payment provider for lesson charges) — Sprint 23
- GDPR / data retention — Sprint 23
- Arabic locale support — Sprint 23
- Portal i18n (parent portal) — deferred
- Booking WebView i18n — deferred
