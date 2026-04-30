-- Migration: 20260426000001_fix_lesson_students_rls.sql
-- Fix: lesson_students RLS policies used the old 'role' JWT claim.
-- The custom_access_token_hook (fixed in 20260323000001) stores the business
-- role in 'app_role', so these policies were effectively blocking all reads
-- through the normal Supabase client — making lessons appear unlinked to students.

DROP POLICY IF EXISTS "lesson_students_owner_full" ON lesson_students;
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

DROP POLICY IF EXISTS "lesson_students_admin_full" ON lesson_students;
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

DROP POLICY IF EXISTS "lesson_students_teacher_read_own" ON lesson_students;
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
