# Sprint 35 — Teacher Operations & Economics

**Status:** Shipped 15.09.2026. Attributed revenue is the list value of delivered activity (decision #45), never the charges actually recorded — see that decision before touching `src/lib/teacher-economics/report.ts`.  
**Product boundary:** Lessio is an operational-management system. It reports teaching activity, attributed revenue, estimated compensation and contribution. It never calculates payroll, deductions, payslips, tax reporting or an amount legally due to an employee.

## Goal

Give a centre owner a trustworthy monthly answer per teacher: what happened in lessons, what revenue is attributable to delivered activity, what is the estimated operational compensation under the centre policy, and what is the resulting contribution. The report is a management estimate and CSV handoff, not a payment instruction.

## Definitions

| Metric | Definition | Never conflate with |
| --- | --- | --- |
| Delivery | delivered, student no-show, parent cancellation, teacher cancellation, or scheduled | customer payment |
| Attributed revenue | value attributed to eligible teaching activity under current lesson/charge pricing | cash received this month |
| Cash collected | payments with `paid_at` in the selected month | revenue created by a teacher that month |
| Estimated compensation | result of the configured operational policy | payroll / net pay |
| Contribution | attributed revenue less estimated compensation | accounting profit |

The owner report leads with attributed revenue, estimated compensation and contribution. Cash collected is a separate drill-down only when it can be attributed without inventing an allocation; subscriptions are never silently treated as a particular lesson's cash income.

## Roles and permissions

`admin` is not a synonym for office manager. Add `office_manager`, an operational role with no financial access.

| Capability | owner | office_manager | teacher |
| --- | --- | --- | --- |
| Manage schedule, students and lesson outcomes | yes | yes | own lessons only |
| See teacher delivery across centre | yes | yes | own lessons only |
| See attributed revenue, compensation or contribution | yes | no | no |
| Configure economics policy/rates | yes | no | no |
| Publish/reopen monthly snapshot / economics CSV | yes | no | no |
| See personal estimated compensation | n/a | no | only if owner enables it |

Enforce capabilities on the server, not through navigation. Financial tables are service-role only and report functions return role-specific DTOs. Financial fields must be unavailable through URLs, CSV, API, AI context, teacher sheets, portal and booking flows without the financial capability.

Existing `admin` users retain their access. An owner explicitly reclassifies a person as `office_manager`; no silent downgrade.

## Bounded, versioned policy

Each centre selects a prepared model, with an organisation default and a teacher override. This is not a formula builder:

1. hourly rate for eligible delivered time;
2. fixed amount per eligible lesson;
3. percentage of attributed lesson revenue;
4. hourly or fixed base plus optional amount per attendee beyond the first for pair/group lessons.

The policy sets no-show and late-parent-cancellation treatment (0–100%). Teacher-originated cancellation is always 0% in v1. The centre may require teacher or staff delivery confirmation; otherwise a completed lesson is accepted operationally.

Rates/policies have `effective_from`; lessons use the version active at their local start time. The selected rule/rate is snapshotted on the estimate line, so a rate change today never rewrites prior lessons or a prior month.

V1 uses **enrolled students** for group supplements. Actual-attendee compensation is later work because the current model has no per-student attendance.

## Monthly flow

1. Lessons acquire an outcome. Automatic completion is an operational signal and stays estimated when confirmation is required.
2. Owner and office manager clear an exception queue: scheduled-past, awaiting confirmation, no-show and cancellation.
3. Owner reviews calendar-month operational counts/hours plus attributed revenue, estimated compensation and contribution. Office manager sees the counts, never finance columns.
4. Owner may add a documented operational adjustment — a report line, not a salary component.
5. Owner may **publish a monthly snapshot** for export/review. This records values and rule/rate snapshots; it neither approves salary nor pays anyone.
6. A later change becomes a visible pending adjustment. Owner accepts/rejects it with a reason; published history never changes silently.

Teacher view is only own outcomes and, if enabled, personal estimated compensation. It never exposes centre revenue, contribution, customer prices, policy rates, other teachers or CSV.

## Stories

### 1. Roles and financial boundary

- Add `office_manager` through profiles, JWT claims, session types, validation, navigation and applicable RLS.
- Add server-side capability helpers for operational reporting and economics.
- Audit owner/admin guards: office manager keeps daily operations but is rejected from billing, receipts, settings, exports and economics endpoints.

### 2. Policy and provenance

- Keep `teachers.hourly_rate` as parent-facing lesson price; create separate compensation policy/rates.
- Store versioned organisation defaults and teacher overrides with `effective_from`; prevent overlapping versions per scope.
- Store cancellation time/actor and delivery-confirmation time/actor. New writes populate it; legacy uncertainty is labelled estimated.

### 3. Calculation

- Pure tested calculator: resolve policy at lesson start; emit immutable estimate-line snapshots.
- Return delivery counts/hours, attributed revenue, estimated compensation, contribution, missing-policy warning and confirmation state.
- Keep cash-collected reporting separate; do not fabricate attribution for subscriptions, partial or late payments.

### 4. Reports

- Centre monthly table: teacher, outcome counts, hours, and owner-only attributed revenue, estimated compensation, contribution and snapshot state.
- Teacher drill-down with outcome/duration/exception reason; finance columns owner-only.
- Owner-only economics CSV.

### 5. Self-service and history

- Teacher may confirm only own eligible lesson when policy permits, never scheduled/cancelled/another teacher's lesson.
- Optional own-estimate view, controlled by owner.
- Publish/reopen snapshot and pending adjustment workflow with reason and immutable audit.

## Out of scope

- Payroll, payslips, salary, taxes, pensions, deductions, leave balances, statutory absence entitlement or payments to teachers.
- Arbitrary formulas/scripting.
- Per-student attendance and actual-attendee compensation.
- Subscription-cash allocation or partial-payment settlement.
- Teacher visibility into centre economics or customer pricing.

## Acceptance checks

- A policy/rate effective today changes future lessons only; past lines and published snapshots retain their values.
- Office manager can resolve outcomes but cannot obtain economics through pages, actions, CSV or APIs.
- Teacher cannot access another teacher's data, customer prices, policy rates, revenue or contribution.
- Owner sees delivery, attributed revenue, estimated compensation and contribution separately; cash collected never replaces attributed revenue.
- Teacher cancellation estimates 0%; no-show and late cancellation follow the configured percentage.
- A post-publication change is a pending adjustment with actor, timestamp, before/after values and owner decision.
- Migration, RLS/session, tenant-isolation, DTO redaction and calculator tests pass before owner reporting ships.

