# Sprint 10 — Teacher Self-Service Availability + Org Holidays

**Status:** Planned  
**Goal:** Teachers can update their own availability windows and date overrides without admin involvement. Org owners can define shared holiday dates that block all booking slots across every teacher.

---

## Pre-Sprint State

Sprint 5 delivered the teacher portal (`/teacher/schedule`), read-only schedule view.  
Sprint 2 delivered availability management — but only for owner/admin at `/teachers/[id]/availability` and `/teachers/[id]/overrides`.  
Teachers today cannot self-manage their time. Admins handle every change, adding coordination overhead.

---

## Story 1 — Schema: Organization Holidays

**`supabase/migrations/20260330000002_org_holidays.sql`**

```sql
CREATE TABLE organization_holidays (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date          date NOT NULL,
  name          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, date)
);

COMMENT ON TABLE organization_holidays IS 'Org-wide dates on which no bookings are accepted (חגים, ימי עיון, etc.).';

-- RLS: owner/admin can manage; teachers can read own org holidays (for display in schedule)
ALTER TABLE organization_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_holidays_owner_admin_all"
  ON organization_holidays
  FOR ALL
  TO authenticated
  USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT app_role FROM profiles WHERE id = auth.uid()) IN ('owner', 'admin')
  );

CREATE POLICY "org_holidays_teacher_read"
  ON organization_holidays
  FOR SELECT
  TO authenticated
  USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );
```

No changes to `availability` or `availability_overrides` tables. Holidays are a separate concern layered on top.

---

## Story 2 — Holiday Management: Settings Page

**`src/app/(dashboard)/settings/holidays/page.tsx`** (new, server component)

- Owner/admin only (`forbidden()` for teacher role).
- Lists all `organization_holidays` for the org, sorted by date.
- Inline "add holiday" form: `date` (input type=date) + `name` (text).
- Delete button per row (owner/admin).

**`src/app/(dashboard)/settings/holidays/actions.ts`** (new)

```typescript
// Zod: { date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), name: z.string().min(1).max(100) }
export async function addHoliday(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState>

export async function deleteHoliday(id: string): Promise<void>
```

Both enforce `role === 'owner' || role === 'admin'` via `getSession()`. Use `createClient()` (RLS enforced, not service-role).

**`src/lib/organizations/holidays.ts`** (new)

```typescript
export type OrgHoliday = { id: string; date: string; name: string }

export async function getOrgHolidays(orgId: string): Promise<OrgHoliday[]>
```

---

## Story 3 — Booking: Block Holiday Slots

**`src/lib/booking/getAvailableSlots.ts`** (or wherever slot generation happens) — update

After generating candidate slots for a given date, check if that date exists in `organization_holidays` for the org. If yes, return `[]` for that date (no slots available).

```typescript
const holidays = await getOrgHolidays(orgId)
const holidayDates = new Set(holidays.map((h) => h.date)) // 'YYYY-MM-DD'

// Filter generated slots
return slots.filter((slot) => {
  const slotDate = toLocalDate(slot.start, timezone) // 'YYYY-MM-DD'
  return !holidayDates.has(slotDate)
})
```

This is the single enforcement point — no duplicate checks needed because booking never completes without slot validation.

---

## Story 4 — Teacher Self-Service Availability

Teachers are identified server-side via `getTeacherByProfileId(userId, orgId)`. They can only ever read/write their own teacher record.

**`src/app/(dashboard)/teacher/availability/page.tsx`** (new, server component)

- Redirects non-teacher roles to `/dashboard`.
- Fetches `teacher` record via `getTeacherByProfileId(userId, orgId)`.
- Lists existing `availability` rows for this teacher (by day-of-week).
- Form to add a new slot (same form as admin view at `/teachers/[id]/availability`).
- Delete button per existing slot.

**`src/app/(dashboard)/teacher/availability/actions.ts`** (new)

```typescript
'use server'

export async function addTeacherAvailability(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { userId, orgId, role } = await getSession()
  if (role !== 'teacher') return { error: 'אין הרשאה' }

  const teacher = await getTeacherByProfileId(userId, orgId, { activeOnly: true })
  if (!teacher) return { error: 'לא נמצאה רשומת מורה' }

  // Reuse same validation + overlap check as admin flow
  // Insert into availability with teacherId = teacher.id (from session — never from formData)
  // revalidatePath('/teacher/availability')
}

export async function deleteTeacherAvailability(id: string): Promise<void> {
  const { userId, orgId, role } = await getSession()
  if (role !== 'teacher') return

  const teacher = await getTeacherByProfileId(userId, orgId, { activeOnly: true })
  if (!teacher) return

  // Delete only if availability.teacher_id = teacher.id AND availability.organization_id = orgId
  // This ensures a teacher cannot delete another teacher's availability
  const supabase = await createClient()
  await supabase
    .from('availability')
    .delete()
    .eq('id', id)
    .eq('teacher_id', teacher.id)   // ← security: scoped to own record
    .eq('organization_id', orgId)
}
```

Key security constraint: `teacherId` is always resolved from the authenticated session, never from the request body or URL params.

---

## Story 5 — Teacher Self-Service Overrides

**`src/app/(dashboard)/teacher/overrides/page.tsx`** (new, server component)

Same pattern as availability — lists `availability_overrides` for this teacher, allows adding/removing date-specific overrides (day off or extended hours).

**`src/app/(dashboard)/teacher/overrides/actions.ts`** (new)

Mirrors the admin actions in `/teachers/[id]/overrides/actions.ts` but:
- `role` must be `'teacher'`
- `teacher_id` resolved from session, never from params

---

## Story 6 — Sidebar + Navigation

**`src/components/dashboard/Sidebar.tsx`** (update)

Add two items for teacher role:

```typescript
{ href: '/teacher/availability', label: 'הזמינות שלי', icon: Clock, roles: ['teacher'] },
{ href: '/teacher/overrides', label: 'חריגים ביומן', icon: CalendarX, roles: ['teacher'] },
```

Add holiday settings for owner/admin:

```typescript
{ href: '/settings/holidays', label: 'חגים וחופשות', icon: CalendarOff, roles: ['owner', 'admin'] },
```

---

## Story 7 — Holiday Visibility in Teacher Schedule

**`src/app/(dashboard)/teacher/schedule/page.tsx`** (update)

Fetch `getOrgHolidays(orgId)` alongside lessons. In the week-grid, if a day's date falls on a holiday, render a small label inside the day column:

```tsx
{holidayDates.has(dateStr) && (
  <div className="px-1.5 py-0.5 text-xs text-center text-purple-600 bg-purple-50 rounded border border-purple-100">
    {holidays.find(h => h.date === dateStr)?.name}
  </div>
)}
```

---

## Architecture After Sprint 10

```
Teacher login → /teacher/schedule (existing)
                /teacher/availability (new)  — edit own availability windows
                /teacher/overrides (new)     — add/remove date exceptions

Owner/Admin → /settings/holidays (new)      — define org-wide holiday dates
                ↓ stored in organization_holidays
                  → getAvailableSlots filters out holiday dates
                  → teacher schedule renders holiday label
```

---

## What is NOT in Sprint 10

- Teacher requesting time off (approval workflow) — this is owner-managed via overrides
- Substitute teacher assignment
- Room/resource scheduling
- Admin receiving notification when teacher updates availability
- Recurring lessons (Sprint 11)
- Automated reminders (Sprint 12)
