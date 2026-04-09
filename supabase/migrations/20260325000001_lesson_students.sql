-- Migration: 20260325000001_lesson_students.sql
-- Pre-Sprint 7: lesson_students junction table + lesson_type + group_pricing_mode.
-- Per /docs/status.md § Pre-Sprint 7 Migration (Urgent).
--
-- Execution order:
--   1. Add lesson_type + max_students to lessons
--   2. Add group_pricing_mode to organizations
--   3. Create lesson_students junction table with RLS
--   4. Migrate existing lessons.student_id → lesson_students rows
--   5. Update RLS policies that subquery lessons.student_id
--   6. Update guard_teacher_lesson_update trigger (remove student_id check)
--   7. Drop lessons.student_id column + its index

-- ─── 1. New columns on lessons ────────────────────────────────────────────────

ALTER TABLE lessons
  ADD COLUMN lesson_type  text NOT NULL DEFAULT 'individual'
    CONSTRAINT lessons_lesson_type_check
      CHECK (lesson_type IN ('individual', 'pair', 'group')),
  ADD COLUMN max_students int  NOT NULL DEFAULT 1;

-- ─── 2. New column on organizations ──────────────────────────────────────────

ALTER TABLE organizations
  ADD COLUMN group_pricing_mode text NOT NULL DEFAULT 'per_student'
    CONSTRAINT organizations_group_pricing_mode_check
      CHECK (group_pricing_mode IN ('fixed', 'per_student'));

-- ─── 3. lesson_students junction table ───────────────────────────────────────

CREATE TABLE lesson_students (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id  uuid NOT NULL REFERENCES lessons(id)  ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status     text NOT NULL DEFAULT 'enrolled'
    CONSTRAINT lesson_students_status_check
      CHECK (status IN ('enrolled', 'cancelled')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (lesson_id, student_id)
);

CREATE INDEX idx_lesson_students_lesson  ON lesson_students (lesson_id);
CREATE INDEX idx_lesson_students_student ON lesson_students (student_id);

ALTER TABLE lesson_students ENABLE ROW LEVEL SECURITY;

-- Owner: full access (checked via lessons.organization_id)
CREATE POLICY "lesson_students_owner_full" ON lesson_students
  FOR ALL
  USING (
    (auth.jwt() ->> 'app_role') = 'owner'
    AND EXISTS (
      SELECT 1 FROM lessons l
      WHERE l.id = lesson_students.lesson_id
        AND l.organization_id = (auth.jwt() ->> 'org_id')::uuid
    )
  )
  WITH CHECK (
    (auth.jwt() ->> 'app_role') = 'owner'
    AND EXISTS (
      SELECT 1 FROM lessons l
      WHERE l.id = lesson_students.lesson_id
        AND l.organization_id = (auth.jwt() ->> 'org_id')::uuid
    )
  );

-- Admin: full access
CREATE POLICY "lesson_students_admin_full" ON lesson_students
  FOR ALL
  USING (
    (auth.jwt() ->> 'app_role') = 'admin'
    AND EXISTS (
      SELECT 1 FROM lessons l
      WHERE l.id = lesson_students.lesson_id
        AND l.organization_id = (auth.jwt() ->> 'org_id')::uuid
    )
  )
  WITH CHECK (
    (auth.jwt() ->> 'app_role') = 'admin'
    AND EXISTS (
      SELECT 1 FROM lessons l
      WHERE l.id = lesson_students.lesson_id
        AND l.organization_id = (auth.jwt() ->> 'org_id')::uuid
    )
  );

-- Teacher: read only, own lessons
CREATE POLICY "lesson_students_teacher_read_own" ON lesson_students
  FOR SELECT
  USING (
    (auth.jwt() ->> 'app_role') = 'teacher'
    AND EXISTS (
      SELECT 1 FROM lessons l
      WHERE l.id = lesson_students.lesson_id
        AND l.organization_id = (auth.jwt() ->> 'org_id')::uuid
        AND l.teacher_id = get_my_teacher_id()
    )
  );

-- ─── 4. Migrate existing data ─────────────────────────────────────────────────

INSERT INTO lesson_students (lesson_id, student_id, status)
SELECT id, student_id, 'enrolled'
FROM lessons
WHERE student_id IS NOT NULL;

-- ─── 5. Update RLS policies that subquery lessons.student_id ─────────────────
-- Both policies below used lessons.student_id which is being dropped.
-- Replace subquery with lesson_students join.

DROP POLICY IF EXISTS "students_teacher_read_linked" ON students;
CREATE POLICY "students_teacher_read_linked" ON students
  FOR SELECT USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'teacher'
    AND id IN (
      SELECT ls.student_id
      FROM lesson_students ls
      JOIN lessons l ON l.id = ls.lesson_id
      WHERE l.teacher_id = get_my_teacher_id()
    )
  );

DROP POLICY IF EXISTS "relationships_teacher_read_linked" ON relationships;
CREATE POLICY "relationships_teacher_read_linked" ON relationships
  FOR SELECT USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'teacher'
    AND student_id IN (
      SELECT ls.student_id
      FROM lesson_students ls
      JOIN lessons l ON l.id = ls.lesson_id
      WHERE l.teacher_id = get_my_teacher_id()
    )
  );

-- ─── 6. Update guard_teacher_lesson_update (remove student_id check) ─────────

CREATE OR REPLACE FUNCTION public.guard_teacher_lesson_update()
RETURNS trigger AS $$
DECLARE
  app_role text := coalesce(auth.jwt() ->> 'app_role', auth.jwt() ->> 'role', '');
BEGIN
  IF app_role <> 'teacher' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'cancelled' THEN
    RAISE EXCEPTION 'לא ניתן לשנות סטטוס של שיעור שבוטל';
  END IF;

  -- student_id removed from lessons; only structural fields that remain are checked.
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.teacher_id   IS DISTINCT FROM OLD.teacher_id
     OR NEW.start_at     IS DISTINCT FROM OLD.start_at
     OR NEW.end_at       IS DISTINCT FROM OLD.end_at THEN
    RAISE EXCEPTION 'מורה יכול לעדכן רק את תוצאת השיעור שלו';
  END IF;

  IF NEW.status NOT IN ('completed', 'no_show') THEN
    RAISE EXCEPTION 'מורה יכול לעדכן שיעור רק להושלם או לא הגיע';
  END IF;

  IF NEW.cancel_reason IS DISTINCT FROM OLD.cancel_reason THEN
    RAISE EXCEPTION 'מורה אינו יכול לעדכן סיבת ביטול';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── 7. Drop student_id from lessons ─────────────────────────────────────────

DROP INDEX IF EXISTS idx_lessons_org_student;
ALTER TABLE lessons DROP COLUMN student_id;
