-- Sprint 24: Explicit RLS deny policies on new tables.
-- All access is via service role client; these policies ensure anon/authenticated
-- users cannot bypass service role by querying tables directly.

-- homework_attachments
CREATE POLICY "deny_all_homework_attachments"
  ON homework_attachments AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

-- homework_submissions
CREATE POLICY "deny_all_homework_submissions"
  ON homework_submissions AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

-- lesson_notes
CREATE POLICY "deny_all_lesson_notes"
  ON lesson_notes AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

-- student_goals
CREATE POLICY "deny_all_student_goals"
  ON student_goals AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);
