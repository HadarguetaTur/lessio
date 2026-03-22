# LESSIO — Sprint 5 Scope

## Goal

Turn the system from something that works for you alone — into a product that multiple user types can work with without causing damage.

**Milestone:** Controlled Multi-Role Product

---

## Dependencies

- Internal dashboard working (Sprint 2)
- Charge/cancellation flows stable (Sprint 3)
- Roles defined in schema/auth

---

## Explicit Scope

### ✅ In Scope

- Basic teacher view (schedule + outcome update)
- Teacher permissions (read-only in most cases)
- Authorization hardening for all routes
- Route guards + API authorization review
- Loading states + empty states
- Form validation polish (Hebrew)
- Mobile usability for operational screens
- Archive behavior review
- Idempotency / retry review
- Comprehensive RTL cleanup

### ❌ Out of Scope (do not build)

- Full parent portal
- Advanced analytics
- Invoices
- Advanced org settings
- Multi-language beyond Hebrew

---

## Epics & Stories

---

### EPIC A — Teacher Experience

**Story: Teacher Calendar**

- Teacher sees only their own lessons (teacher_id match)
- Week / day view
- Basic lesson details

**Story: Teacher Lesson Outcome**

- Teacher can mark: completed / no_show only
- No access to business cancellations, billing, people management
- Permissions enforced in RLS + server actions

---

### EPIC B — Authorization Hardening

- owner/admin — full internal access
- teacher — limited access only (schedule + outcomes)
- Review all routes + server actions
- Cannot access another organization's data via URL manipulation
- RLS policies tested with test scenarios

**Specific checks:**
- Teacher cannot see another teacher's lessons via URL manipulation
- Teacher cannot change teacher_id / student_id / start_at
- Access to another org's ID → 403, not 404

---

### EPIC C — UX Polish

- Loading states for all async operations
- Empty states defined for all lists
- Consistent success/error feedback
- Form validation messages in Hebrew
- Mobile sanity check on all operational screens

---

### EPIC D — Data Integrity Review

- Archive rules: what happens when a student/teacher/parent is archived
- Can a new lesson be booked for an archived entity? (No — validation required)
- Double submit protection on forms
- Stale state handling in calendar

---

## Non-Negotiable Tests — Sprint 5

| What | Minimum Coverage |
|---|---|
| Teacher isolation | Teacher cannot see another teacher's lessons — URL manipulation |
| Teacher write limits | Teacher cannot change teacher_id / student_id / start_at |
| Org isolation | Access to another org's ID → 403, not 404 |
| Double submit | Submitting a form twice does not create a duplicate entity |
| Archive integrity | Archived entity cannot be used in a new booking or assignment |

---

## Definition of Done — Sprint 5

- [ ] Teacher sees only their own schedule
- [ ] Teacher can update outcome only (completed / no_show)
- [ ] owner/admin/teacher boundaries enforced in RLS + server actions
- [ ] No obvious authorization holes (org isolation, teacher isolation)
- [ ] Core screens and forms are clear and stable
- [ ] RTL consistent across all screens
- [ ] Archive behavior consistent — archived entity blocks new booking
- [ ] No duplicate action issues
- [ ] Loading + empty states exist on all lists
- [ ] All non-negotiable tests pass

---

## Ground Rules for Claude Code — Sprint 5

```
You are building LESSIO Sprint 5 — Roles, UX Hardening & Data Integrity.

Rules:
1. Teacher can only update: completed / no_show on own lessons. Nothing else.
2. Teacher cannot access: billing, charges, cancellation logic, people management.
3. Teacher data isolation: RLS must prevent cross-teacher data access. Test with URL manipulation.
4. Org isolation: wrong org_id in URL → 403, not 404.
5. Archive = is_active = false. Archived entity cannot be used in any new booking or assignment.
6. Double submit protection: all forms must be idempotent.
7. Do not build: parent portal, advanced analytics, invoices, multi-language.
8. All error/success messages in Hebrew.
9. All screens must pass basic mobile viewport check.
10. Before any story: read /docs/schema.md, /docs/decisions.md, /docs/security.md.
```
