# Sprint 11 — Recurring Lessons

**Status:** Planned  
**Goal:** Admins can create a series of weekly (or bi-weekly) lessons in one action. Each lesson in the series is individually cancellable; the whole series can be cancelled forward. This eliminates the biggest weekly scheduling overhead for tutoring businesses.

---

## Pre-Sprint State

Every lesson is currently created individually — via WhatsApp booking flow or (if planned) admin dashboard. For a student with a fixed weekly lesson, an admin must re-book every single occurrence. This is the single largest coordination pain point for recurring teaching relationships.

---

## Story 1 — Schema

**`supabase/migrations/20260330000004_recurring_lessons.sql`**

> Note: `20260330000003` is taken by `fix_holidays_rls.sql` (Sprint 10 hotfix).

```sql
-- Represents a recurrence series (one row per series)
CREATE TABLE lesson_series (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  teacher_id      uuid NOT NULL REFERENCES teachers(id),
  student_id      uuid NOT NULL,   -- first / primary student (for display; actual per lesson_students)
  rule            jsonb NOT NULL,  -- { frequency: 'weekly'|'biweekly', day_of_week: 0-6, start_time: 'HH:MM', duration_minutes: number, until: 'YYYY-MM-DD' }
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES profiles(id)
);

COMMENT ON TABLE lesson_series IS 'Metadata for a recurring lesson series. Individual lessons reference this via series_id.';

-- Add series_id to lessons
ALTER TABLE lessons
  ADD COLUMN series_id uuid REFERENCES lesson_series(id) ON DELETE SET NULL;

COMMENT ON COLUMN lessons.series_id IS 'If set, this lesson belongs to a recurring series.';

-- Index for "cancel all future in series" queries
CREATE INDEX idx_lessons_series_id ON lessons(series_id) WHERE series_id IS NOT NULL;

-- RLS for lesson_series: same as lessons (owner/admin full, teacher read-own)
ALTER TABLE lesson_series ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lesson_series_owner_admin_all"
  ON lesson_series FOR ALL TO authenticated
  USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT app_role FROM profiles WHERE id = auth.uid()) IN ('owner', 'admin')
  );

CREATE POLICY "lesson_series_teacher_read"
  ON lesson_series FOR SELECT TO authenticated
  USING (
    teacher_id IN (
      SELECT id FROM teachers WHERE profile_id = auth.uid() AND organization_id = (
        SELECT organization_id FROM profiles WHERE id = auth.uid()
      )
    )
  );
```

**Rule JSON schema:**
```json
{
  "frequency": "weekly",          // "weekly" | "biweekly"
  "day_of_week": 2,              // 0=Sun … 6=Sat
  "start_time": "17:00",         // local time in org timezone
  "duration_minutes": 60,
  "until": "2026-07-31"          // inclusive end date (ISO 8601 date)
}
```

---

## Story 2 — Series Creation Logic

**`src/lib/lessons/createSeries.ts`** (new, server-only)

```typescript
export type CreateSeriesParams = {
  orgId: string
  teacherId: string
  studentId: string
  rule: SeriesRule                 // validated from form
  createdByProfileId: string
}

export type CreateSeriesResult = {
  seriesId: string
  created: number                  // number of lessons created
  skipped: number                  // slots that were already occupied or on org holiday
  conflicts: string[]              // dates that were skipped (ISO strings)
}

export async function createLessonSeries(params: CreateSeriesParams): Promise<CreateSeriesResult>
```

**Algorithm:**
1. Insert `lesson_series` row → get `seriesId`.
2. Generate candidate dates: from the next occurrence of `day_of_week` after today, stepping by 7 or 14 days, up to `until`.
3. For each candidate date/time:
   a. Check `organization_holidays` — skip if holiday.
   b. Check existing `lessons` for teacher/student overlap (same teacher, overlapping time window, status != 'cancelled') — skip if conflict.
   c. Check `slot_locks` active for that slot — skip.
   d. Insert `lessons` row with `series_id`, `status = 'scheduled'`, and insert `lesson_students` row.
4. Return result with counts.

Uses `createServiceRoleClient()`. Wrapped in a loop (not a DB transaction) — partial success is acceptable; conflicts are reported to the UI.

**`src/lib/lessons/cancelSeries.ts`** (new, server-only)

```typescript
export type CancelSeriesScope = 'all' | 'from_date'

export async function cancelLessonSeries(
  seriesId: string,
  orgId: string,
  scope: CancelSeriesScope,
  fromDate?: string   // ISO date — required when scope === 'from_date'
): Promise<{ cancelled: number }>
```

Updates `lessons.status = 'cancelled'` + `cancel_reason = 'ביטול סדרה'` for all `scheduled` lessons in the series (with optional `start_at >= fromDate` filter). Does NOT auto-charge cancellation fees (operator must decide manually).

---

## Story 3 — Admin UI: Create Recurring Series

**`src/app/(dashboard)/lessons/new-series/page.tsx`** (new)

Owner/admin only. Single-page form:

| Field | Input type | Notes |
|---|---|---|
| מורה | `<select>` populated from `getTeachers(orgId)` | |
| תלמיד | `<select>` or searchable | |
| יום בשבוע | `<select>` (ראשון–שישי) | |
| שעת התחלה | `<input type="time">` | |
| משך (דקות) | `<select>` 30/45/60/90 | |
| תדירות | radio: שבועי / דו-שבועי | |
| עד תאריך | `<input type="date">` | |

On submit → `createSeriesAction` server action → show result: "נוצרו X שיעורים. דולגו Y תאריכים: ..." with list of skipped dates.

**`src/app/(dashboard)/lessons/new-series/actions.ts`** (new)

```typescript
export async function createSeriesAction(
  _prevState: CreateSeriesState,
  formData: FormData
): Promise<CreateSeriesState>
```

Zod validation:
```typescript
const SeriesFormSchema = z.object({
  teacher_id: z.string().uuid(),
  student_id: z.string().uuid(),
  day_of_week: z.coerce.number().int().min(0).max(6),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  duration_minutes: z.coerce.number().int().positive(),
  frequency: z.enum(['weekly', 'biweekly']),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})
```

After successful creation: `revalidatePath('/lessons')`.

**`src/components/dashboard/lessons/`** — add a "יצירת שיעורים קבועים" button/link on the `/lessons` page header, visible to owner/admin.

---

## Story 4 — Lesson Detail: Series Indicator + Cancel Options

**`src/app/(dashboard)/lessons/[id]/page.tsx`** (update)

If `lesson.series_id` is set, show a banner:

```tsx
<div className="flex items-center gap-2 p-3 rounded-lg bg-purple-50 border border-purple-100 text-sm text-purple-700 mb-4">
  <Repeat size={15} />
  שיעור זה הוא חלק מסדרה קבועה.
  <button ...>בטל שיעור זה בלבד</button>
  <button ...>בטל מכאן והלאה</button>
  <button ...>בטל את כל הסדרה</button>
</div>
```

**`src/app/(dashboard)/lessons/[id]/actions.ts`** (update)

Add `cancelSeriesAction`:

```typescript
export async function cancelSeriesAction(
  lessonId: string,
  _prevState: CancelLessonResult,
  formData: FormData
): Promise<CancelLessonResult>
```

Reads `scope: 'all' | 'from_date'` from `formData`. Fetches `lesson.series_id` (org-scoped). Calls `cancelLessonSeries(seriesId, orgId, scope, lessonDate)`. Revalidates `/lessons`.

Cancelling a single lesson in a series uses the existing `cancelLesson` action — no change needed.

---

## Story 5 — Lessons List: Series Badge

**`src/app/(dashboard)/lessons/page.tsx`** (update)

In the lesson list, if `lesson.series_id` is set, render a small `Repeat` icon badge next to the lesson title. This makes it easy to distinguish ad-hoc lessons from recurring ones.

---

## Story 6 — Teacher Schedule: Series Visibility

No change needed — recurring lessons appear as normal lessons in the weekly grid. The `Repeat` badge can be added optionally in the lesson card if `series_id` is returned by the existing `getLessonsForWeek` query.

**`src/lib/lessons/index.ts`** (update): add `series_id` to `LESSON_SELECT` and `Lesson` type.

---

## Architecture After Sprint 11

```
Admin → /lessons/new-series
  → createSeriesAction (Zod validated)
    → createLessonSeries (server-only)
      → lesson_series row created
      → for each candidate date:
          → check holiday, overlap, slot_lock
          → insert lesson + lesson_students (series_id set)
      → returns { created, skipped, conflicts }
  → success page with summary

Admin → /lessons/[id] (series lesson)
  → "בטל מכאן והלאה"
    → cancelSeriesAction(scope='from_date')
      → cancelLessonSeries(seriesId, 'from_date', lessonDate)
        → UPDATE lessons SET status='cancelled' WHERE series_id=? AND start_at >= ? AND status='scheduled'
```

---

## What is NOT in Sprint 11

- Rescheduling an entire series (change time/day for all future lessons)
- Moving a single lesson to a different date within the series
- Auto-charging cancellation fees for series cancellation
- WhatsApp notification to parent when series is cancelled (manual process — admin sends message)
- Bi-weekly series starting mid-week (always starts from next eligible `day_of_week`)
- Automated lesson reminders (Sprint 12)
