# LESSIO — Sprint 5 Scope (v3)

## Goal

Turn LESSIO from an internal system that works mainly for the owner/admin into a controlled multi-role product that supports teacher access safely, without breaking earlier sprint flows.

**Milestone:** Controlled Multi-Role Product

---

## Dependencies

- Sprint 1 complete: auth, roles, schema, RLS baseline
- Sprint 2 complete: internal dashboard, people management, lesson status
- Sprint 3 complete: charge and cancellation flows stable
- Sprint 4 complete: WhatsApp flows working

---

## Critical Strategy

**Teacher Experience must be built before authorization hardening is finalized.**
You cannot harden or validate flows that do not exist yet.

**Sprint order inside Sprint 5:**
1. Teacher Experience
2. Authorization Hardening
3. UX Polish
4. Data Integrity Hardening
5. Acceptance + Regression Pass

**No new product features in this sprint.**
This sprint is for controlled role access, safety, polish, and integrity only.

---

## Explicit Scope

### In Scope

- Basic teacher view: own schedule only
- Teacher lesson outcome update: `completed` / `no_show` only
- Route guards and server action hardening
- Org isolation hardening
- RLS validation for owner/admin/teacher scenarios
- Loading states, empty states, validation, feedback polish
- Mobile and RTL sanity for touched operational screens
- Archive integrity hardening for active flows
- Duplicate-submit protection hardening
- Stale state / revalidation hardening after lesson updates

### Out of Scope

- Full parent portal
- Advanced analytics
- Invoices
- Advanced org settings
- New roles
- Multi-language beyond Hebrew
- New product features of any kind
- Billing rule redesign
- Booking flow redesign

---

## Regression Boundaries

- Sprint 1 booking flow must remain unchanged except where role safety or integrity hardening requires a narrow fix
- Sprint 3 charge creation logic must continue to work and must not be redefined in Sprint 5
- Sprint 4 WhatsApp cancellation logic must remain unchanged unless a verified regression fix is required
- Sprint 5 must not redefine billing rules or cancellation policy rules

---

## Epics & Stories

## EPIC A — Teacher Experience
**Jira Epic:** `DEV-64`

### Story A1 — Teacher calendar view
**Jira Story:** `DEV-78`

**Goal:** Give teacher users a read-only view of their own lessons.

**Expected Code Areas:**
- teacher schedule routes/pages
- lesson queries
- lesson detail entry points
- teacher-facing calendar UI
- tests for teacher lesson visibility

**Scope:**
- Teacher sees only lessons where `teacher_id` matches current teacher
- Week view + day view
- Basic lesson details on click: student name, date, time, status
- Previous/next navigation

### Story A2 — Teacher lesson outcome update
**Jira Story:** `DEV-79`

**Goal:** Allow teacher users to mark own lessons as `completed` or `no_show`, and nothing else.

**Expected Code Areas:**
- lesson outcome action/button
- server action for lesson update
- teacher permission helpers
- tests for allowed vs forbidden updates

**Scope:**
- Teacher can update own lesson outcome only
- Allowed statuses: `completed`, `no_show`
- No teacher access to cancellation, billing, people management, or other lesson field mutation

**Billing/Charge Guardrail:**
- Marking `completed` must continue to trigger the existing approved charge flow from Sprint 3
- Marking `no_show` must follow existing approved behavior only
- Sprint 5 must not redefine any billing or charge rules

---

## EPIC B — Authorization Hardening
**Jira Epic:** `DEV-65`

### Story B1 — Harden route guards and server action authorization
**Jira Story:** `DEV-80`

**Goal:** Ensure all internal routes and server actions enforce role boundaries correctly.

**Expected Code Areas:**
- app route guards
- server actions
- shared authorization helpers
- lesson permission helpers
- tests for forbidden access/mutation

**Scope:**
- Harden route guards for owner/admin/teacher access
- Harden lesson-related server actions
- Ensure teacher access is limited to own schedule and own lesson outcomes
- Block forbidden field mutation even if requests are manually crafted

### Story B2 — Enforce org isolation and validate RLS scenarios
**Jira Story:** `DEV-81`

**Goal:** Ensure cross-org data is never reachable and role-specific RLS scenarios are validated.

**Expected Code Areas:**
- RLS policies
- auth helpers
- org validation in server actions
- route param/resource validation
- role-based test coverage

**Scope:**
- Cross-org access hardening
- RLS validation for owner/admin/teacher scenarios
- Confirm `org_id` comes from trusted auth context, never request body
- Patch any org leakage found

### Permissions Table

| Action | Owner | Admin | Teacher |
|---|---|---|---|
| View own lessons | ✅ | ✅ | ✅ |
| View other teachers' lessons | ✅ | ✅ | ❌ → 403 |
| Mark completed / no_show | ✅ | ✅ | ✅ (own only) |
| Mark cancelled | ✅ | ✅ | ❌ |
| Change `teacher_id` / `student_id` / `start_at` / `end_at` | ✅ | ✅ | ❌ → 403 |
| Access billing / charges | ✅ | ✅ | ❌ |
| Access people management | ✅ | ✅ | ❌ |

---

## EPIC C — UX Polish
**Jira Epic:** `DEV-66`

### Story C1 — Add loading, empty, and feedback states across operational flows
**Jira Story:** `DEV-82`

**Goal:** Make touched operational flows clear, stable, and understandable.

**Expected Code Areas:**
- shared UI state components
- forms
- list views
- toast/feedback helpers
- RTL/mobile layout styles

**Touched Operational Screens:**
- dashboard views touched by Sprint 5
- teacher schedule screens
- lesson detail / lesson outcome flows
- any lists/forms touched while implementing Sprint 5 hardening

**Scope:**
- Loading states for async actions
- Empty states for touched lists and views
- Consistent success/error feedback
- Hebrew validation messages
- Basic mobile + RTL sanity on touched screens

---

## EPIC D — Data Integrity Hardening
**Jira Epic:** `DEV-67`

### Story D1 — Harden archive integrity, duplicate-submit safety, and stale state handling
**Jira Story:** `DEV-83`

**Goal:** Ensure archived entities stay out of active flows, repeated submissions do not create duplicates, and lesson state updates are reflected correctly.

**Expected Code Areas:**
- active-list queries and filters
- form/server action handlers
- mutation/idempotency safeguards
- calendar refresh or revalidation logic
- integrity tests

**Scope:**
- Archive integrity for student, parent, teacher in active flows
- Prevent archived entities from appearing in booking/assignment/selection flows
- Duplicate-submit hardening at server action level
- Stale state fix after lesson status updates

---

## EPIC E — Acceptance + Regression Pass
**Jira Story:** `DEV-72`

**Goal:** Verify Sprint 5 is stable and that earlier sprint flows still work.

**Expected Code Areas:**
- end-to-end or regression tests
- manual verification checklist
- any narrow regression fixes proven necessary

**Scope:**
- Teacher isolation regression check
- Teacher write-limit regression check
- Org isolation regression check
- Duplicate-submit and archive-integrity regression check
- Sprint 1 booking flow still works end-to-end
- Sprint 3 charge creation still works
- Sprint 4 WhatsApp cancellation still works

---

## Non-Negotiable Tests — Sprint 5

| What | Minimum Coverage |
|---|---|
| Teacher isolation | Teacher cannot see another teacher's lessons via URL manipulation |
| Teacher write limits | Teacher cannot change `teacher_id`, `student_id`, `start_at`, `end_at` |
| Org isolation | Access to another org's valid resource returns 403, not 404 |
| Double submit | Repeated submission does not create duplicate rows or side effects |
| Archive integrity | Archived entity cannot be used in new booking/assignment/selection flows |
| Charge continuity | Marking `completed` still triggers existing approved charge flow |
| WhatsApp continuity | Sprint 4 cancellation flow still works after Sprint 5 changes |

---

## Definition of Done — Sprint 5

- [ ] Teacher sees only own schedule
- [ ] Teacher can update only `completed` / `no_show` on own lessons
- [ ] Owner/admin/teacher boundaries enforced in routes, RLS, and server actions
- [ ] Wrong org access returns 403
- [ ] No obvious teacher isolation or org isolation holes remain
- [ ] Touched operational screens have loading + empty + feedback states
- [ ] Hebrew validation is shown on touched forms
- [ ] RTL and basic mobile sanity pass on touched screens
- [ ] Archived entities are excluded from active flows
- [ ] Duplicate-submit protection exists at server action level where needed
- [ ] Lesson state updates do not leave stale UI behind
- [ ] All non-negotiable tests pass
- [ ] Sprint 1 booking, Sprint 3 charge flow, and Sprint 4 WhatsApp cancellation regressions are checked and pass

---

## Ground Rules for Claude Code — Sprint 5

```text
You are building LESSIO Sprint 5 — Controlled Multi-Role Product.

Rules:
1. Teacher can only update: completed / no_show on own lessons. Nothing else.
2. Teacher cannot access: billing, charges, cancellation logic, people management, or other teachers' data.
3. Teacher isolation must be enforced server-side and validated with URL manipulation tests.
4. Teacher teacher_id is resolved from trusted auth/profile context — never trusted from client input.
5. Org isolation: valid resource from another org must return 403, not 404.
6. org_id must be derived from trusted auth context in every server action — never from request body.
7. Archive = is_active = false. Archived entities cannot be used in any new booking, assignment, or active selection flow.
8. Double-submit protection must exist at server action level where repeated submissions could create duplicates or duplicate side effects.
9. Marking completed must preserve the existing approved Sprint 3 charge behavior. Do not redefine billing rules.
10. Do not build: parent portal, advanced analytics, invoices, advanced org settings, multi-language, or any new features.
11. All user-facing validation/success/error messages in touched Sprint 5 flows must be in Hebrew.
12. All touched Sprint 5 screens must pass a basic mobile viewport and RTL sanity check.
13. Before starting any Sprint 5 story, read /docs/schema.md, /docs/decisions.md, /docs/security.md, and this file.
14. Before coding any story: summarize the task in 3–6 bullets, list exact files likely to change, and list explicit out-of-scope items.
15. Do not infer missing permissions or business rules. If a rule is missing, stop and add a TODO instead of inventing behavior.
16. Do not rewrite Sprint 1 booking flow, Sprint 3 billing/charge rules, or Sprint 4 WhatsApp logic unless a specific verified regression fix is required.
```
