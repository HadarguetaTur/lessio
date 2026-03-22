# LESSIO — Sprint 2 Scope

## Goal

Turn LESSIO from a tool that can create a lesson — into a system the business owner manages day-to-day.

**Milestone:** Internal Usable Product — owner/admin can fully operate the system.

---

## Users in Scope

- owner ✅
- admin ✅
- teacher ❌ (out of scope — Sprint 5)
- parent ❌ (out of scope)

---

## Explicit Scope

### ✅ In Scope

- Route protection + dashboard shell
- Students CRUD (create, edit, archive)
- Parents CRUD + search by name/phone
- Parent ↔ Student linking + is_primary
- Teachers CRUD + archive (invite flow)
- Weekly teacher availability
- Availability overrides
- Dashboard — Today view
- Weekly calendar + filter by teacher
- Manual lesson status updates
- Full Hebrew RTL on all screens

### ❌ Out of Scope (do not build)

- Leads management UI
- WhatsApp cancellation flow
- Payment requests
- Teacher portal
- Parent portal
- Cancellation/billing rules
- Charge creation
- PDF / invoices
- Analytics / reports

---

## Epics & Stories

---

### EPIC A — People Management

**Story: Students**

- Student list with search + filter by active/inactive
- Create student — fields: full_name, grade, notes
- Edit student
- Archive student (is_active = false) — not deletion
- Archived students do not appear in the main list without an explicit filter

**Story: Parents**

- Parent list with search by name / phone
- Create parent — fields: full_name, phone (E.164), notes
- Edit parent
- Phone format validation — call `normalizePhone()` before saving

**Story: Parent-Student Relationships**

- Link a parent to a student
- Mark is_primary — only one parent can be primary per student
- Show a student's parents + show a parent's children

**Story: Teachers**

- Teacher list
- Invite flow: owner sends email via Supabase Auth invite → teacher registers → link profile to teacher record
- Edit teacher — fields: bio, is_active
- Archive teacher

**Closed decisions:**
- Teacher creation = invite flow only (Decision #12)
- A teacher who logs into the dashboard sees a "Coming Soon" page + logout only (until Sprint 5)

---

### EPIC B — Teacher Availability

**Story: Weekly Availability**

- Weekly availability view per teacher per day
- Create / edit / delete availability windows
- Validation: prevent overlapping windows on the same day
- Saved to `availability` table (day_of_week, start_time, end_time)

**Story: Availability Overrides**

- Block a one-off date (is_available = false)
- Add one-off availability (is_available = true + start/end time)
- Show overrides in a list + delete

---

### EPIC C — Internal Dashboard

**Story: Today View**

- Today's lessons sorted by time
- Status per lesson (scheduled / completed / no_show / cancelled)
- Counters: lessons today | completed | no_show | cancelled

**Story: Weekly Calendar**

- Week view with back/forward navigation
- Filter by teacher
- Click a lesson → lesson details
- Cancelled lessons displayed distinctly

**Story: Lesson Status Updates**

- Manual status change: completed / no_show / cancelled
- Validation: cannot revert cancelled back to scheduled
- "cancelled" = status change only — no billing, no side effects (Decision #13)

---

## Suggested Execution Order

| Step | Task |
|---|---|
| 1 | Route protection + dashboard shell |
| 2 | Students CRUD |
| 3 | Parents CRUD |
| 4 | Parent-Student relationships |
| 5 | Teachers CRUD + invite flow |
| 6 | Teacher availability (weekly) |
| 7 | Availability overrides |
| 8 | Today view |
| 9 | Weekly calendar |
| 10 | Lesson status updates |
| 11 | RTL + polish |

---

## Non-Negotiable Tests — Sprint 2

| What | Minimum Coverage |
|---|---|
| normalizePhone() | All input formats (05X, 9725X, +9725X), invalid input → error |
| Archive | Archived student/teacher does not appear in list, cannot be assigned to a new lesson |
| is_primary | Cannot mark two parents as primary for the same student |
| Route protection | Accessing dashboard without session → redirect to login |
| Availability overlap | Cannot create two overlapping availability windows on the same day |

---

## Definition of Done — Sprint 2

- [ ] admin/owner can create, edit, and archive a student
- [ ] admin/owner can create and edit a parent
- [ ] admin/owner can link a parent to a student
- [ ] admin/owner can create, edit, and archive a teacher (invite flow)
- [ ] admin/owner can set weekly availability for a teacher
- [ ] admin/owner can manage availability overrides
- [ ] Today view displays today's lessons correctly
- [ ] Weekly calendar works by week and by teacher filter
- [ ] Lesson status can be updated manually
- [ ] All UI in Hebrew RTL
- [ ] No critical errors in core flows
- [ ] All non-negotiable tests pass

---

## Ground Rules for Claude Code — Sprint 2

```
You are building LESSIO Sprint 2 — Internal Operations MVP.

Rules:
1. Users in scope: owner + admin only. Teacher/parent UI = out of scope.
2. Do not build: billing, charges, cancellation logic, WhatsApp flows, leads UI, PDF, analytics.
3. "cancelled" status = status change only. No billing side effects. (Decision #13)
4. Teacher creation = invite flow only. No direct user creation. (Decision #12)
5. normalizePhone() before every phone save or lookup.
6. Archive = is_active = false. Never hard delete.
7. Archived entities must not appear in booking or assignment flows.
8. All datetime display per organizations.timezone.
9. All UI in Hebrew RTL.
10. Before any story: read /docs/schema.md and /docs/decisions.md.
```