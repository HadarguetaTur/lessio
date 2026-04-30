-- Teacher dashboard: read/update assigned students; read/update linked parents.
-- JWT role may live in app_role (custom hook) or role — mirror lesson_students policies.

-- Assigned students (students.teacher_id) — read
CREATE POLICY "students_teacher_read_assigned" ON students
  FOR SELECT USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND COALESCE(NULLIF(auth.jwt() ->> 'app_role', ''), NULLIF(auth.jwt() ->> 'role', '')) = 'teacher'
    AND teacher_id = get_my_teacher_id()
  );

-- Assigned students — update pedagogical / academic fields (app layer restricts columns)
CREATE POLICY "students_teacher_update_assigned" ON students
  FOR UPDATE USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND COALESCE(NULLIF(auth.jwt() ->> 'app_role', ''), NULLIF(auth.jwt() ->> 'role', '')) = 'teacher'
    AND teacher_id = get_my_teacher_id()
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND teacher_id = get_my_teacher_id()
  );

-- Parents linked to students this teacher teaches (assignment or shared lessons)
CREATE POLICY "parents_teacher_read_linked" ON parents
  FOR SELECT USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND COALESCE(NULLIF(auth.jwt() ->> 'app_role', ''), NULLIF(auth.jwt() ->> 'role', '')) = 'teacher'
    AND EXISTS (
      SELECT 1
      FROM relationships r
      INNER JOIN students s ON s.id = r.student_id AND s.organization_id = parents.organization_id
      WHERE r.parent_id = parents.id
        AND r.organization_id = parents.organization_id
        AND (
          s.teacher_id = get_my_teacher_id()
          OR EXISTS (
            SELECT 1
            FROM lesson_students ls
            INNER JOIN lessons l ON l.id = ls.lesson_id AND l.organization_id = s.organization_id
            WHERE ls.student_id = s.id
              AND l.teacher_id = get_my_teacher_id()
          )
        )
    )
  );

CREATE POLICY "parents_teacher_update_linked" ON parents
  FOR UPDATE USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND COALESCE(NULLIF(auth.jwt() ->> 'app_role', ''), NULLIF(auth.jwt() ->> 'role', '')) = 'teacher'
    AND EXISTS (
      SELECT 1
      FROM relationships r
      INNER JOIN students s ON s.id = r.student_id AND s.organization_id = parents.organization_id
      WHERE r.parent_id = parents.id
        AND r.organization_id = parents.organization_id
        AND (
          s.teacher_id = get_my_teacher_id()
          OR EXISTS (
            SELECT 1
            FROM lesson_students ls
            INNER JOIN lessons l ON l.id = ls.lesson_id AND l.organization_id = s.organization_id
            WHERE ls.student_id = s.id
              AND l.teacher_id = get_my_teacher_id()
          )
        )
    )
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND EXISTS (
      SELECT 1
      FROM relationships r
      INNER JOIN students s ON s.id = r.student_id AND s.organization_id = parents.organization_id
      WHERE r.parent_id = parents.id
        AND r.organization_id = parents.organization_id
        AND (
          s.teacher_id = get_my_teacher_id()
          OR EXISTS (
            SELECT 1
            FROM lesson_students ls
            INNER JOIN lessons l ON l.id = ls.lesson_id AND l.organization_id = s.organization_id
            WHERE ls.student_id = s.id
              AND l.teacher_id = get_my_teacher_id()
          )
        )
    )
  );
