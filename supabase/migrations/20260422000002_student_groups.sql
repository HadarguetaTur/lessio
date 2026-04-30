-- Migration: 20260422000002_student_groups.sql
-- Groups feature: student_groups + student_group_members tables with RLS.
-- Per /docs/groups-spec.md.
--
-- Roles use JWT claims injected by the Auth hook: { org_id, role }.
-- Pattern mirrors lesson_students RLS from 20260325000001_lesson_students.sql.

-- ─── 1. student_groups ────────────────────────────────────────────────────────

CREATE TABLE student_groups (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  status          text        NOT NULL DEFAULT 'active'
                                CONSTRAINT student_groups_status_check
                                  CHECK (status IN ('active', 'paused')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_student_groups_org ON student_groups (organization_id);

ALTER TABLE student_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "student_groups_owner_full" ON student_groups
  FOR ALL
  USING  ((auth.jwt() ->> 'org_id')::uuid = organization_id AND (auth.jwt() ->> 'role') = 'owner')
  WITH CHECK ((auth.jwt() ->> 'org_id')::uuid = organization_id AND (auth.jwt() ->> 'role') = 'owner');

CREATE POLICY "student_groups_admin_full" ON student_groups
  FOR ALL
  USING  ((auth.jwt() ->> 'org_id')::uuid = organization_id AND (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'org_id')::uuid = organization_id AND (auth.jwt() ->> 'role') = 'admin');

-- Teachers: read-only (so GroupPicker works on teacher-facing pages in future)
CREATE POLICY "student_groups_teacher_read" ON student_groups
  FOR SELECT
  USING ((auth.jwt() ->> 'org_id')::uuid = organization_id AND (auth.jwt() ->> 'role') = 'teacher');

-- ─── 2. student_group_members ─────────────────────────────────────────────────

CREATE TABLE student_group_members (
  group_id   uuid NOT NULL REFERENCES student_groups(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id)       ON DELETE CASCADE,
  PRIMARY KEY (group_id, student_id)
);

CREATE INDEX idx_student_group_members_group   ON student_group_members (group_id);
CREATE INDEX idx_student_group_members_student ON student_group_members (student_id);

ALTER TABLE student_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "student_group_members_owner_full" ON student_group_members
  FOR ALL
  USING (
    group_id IN (
      SELECT id FROM student_groups
      WHERE organization_id = (auth.jwt() ->> 'org_id')::uuid
    )
    AND (auth.jwt() ->> 'role') = 'owner'
  )
  WITH CHECK (
    group_id IN (
      SELECT id FROM student_groups
      WHERE organization_id = (auth.jwt() ->> 'org_id')::uuid
    )
    AND (auth.jwt() ->> 'role') = 'owner'
  );

CREATE POLICY "student_group_members_admin_full" ON student_group_members
  FOR ALL
  USING (
    group_id IN (
      SELECT id FROM student_groups
      WHERE organization_id = (auth.jwt() ->> 'org_id')::uuid
    )
    AND (auth.jwt() ->> 'role') = 'admin'
  )
  WITH CHECK (
    group_id IN (
      SELECT id FROM student_groups
      WHERE organization_id = (auth.jwt() ->> 'org_id')::uuid
    )
    AND (auth.jwt() ->> 'role') = 'admin'
  );

CREATE POLICY "student_group_members_teacher_read" ON student_group_members
  FOR SELECT
  USING (
    group_id IN (
      SELECT id FROM student_groups
      WHERE organization_id = (auth.jwt() ->> 'org_id')::uuid
    )
    AND (auth.jwt() ->> 'role') = 'teacher'
  );
