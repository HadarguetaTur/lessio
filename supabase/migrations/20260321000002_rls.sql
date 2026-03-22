-- Migration: 20260321000002_rls.sql
-- Row Level Security policies for all Sprint 1 tables.
-- Per /docs/security.md and the RLS Summary in /docs/schema.md.
--
-- TODO(LESSIO): These policies depend on custom JWT claims injected by a Supabase
-- Auth JWT hook: { org_id: uuid, role: 'owner'|'admin'|'teacher' }.
-- This hook is NOT configured by this migration — it must be set up separately
-- in the Supabase dashboard (Auth → Hooks) before dashboard auth will function.
-- Question: Where is the JWT hook implementation tracked? No story currently covers it.

-- ─── Enable RLS on all tables ─────────────────────────────────────────────────

ALTER TABLE organizations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers               ENABLE ROW LEVEL SECURITY;
ALTER TABLE parents                ENABLE ROW LEVEL SECURITY;
ALTER TABLE students               ENABLE ROW LEVEL SECURITY;
ALTER TABLE relationships          ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability           ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons                ENABLE ROW LEVEL SECURITY;
ALTER TABLE slot_locks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE charges                ENABLE ROW LEVEL SECURITY;
ALTER TABLE cancellation_policies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads                  ENABLE ROW LEVEL SECURITY;

-- ─── Helper: resolve the caller's teacher record id ───────────────────────────
-- SECURITY DEFINER runs as the function owner, bypassing RLS on the teachers table
-- to prevent infinite recursion inside teacher-scoped policies.

CREATE OR REPLACE FUNCTION get_my_teacher_id()
RETURNS uuid AS $$
  SELECT id FROM teachers WHERE profile_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- ORGANIZATIONS
-- Owner: full | Admin: read | Teacher: read
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "organizations_owner_full" ON organizations
  FOR ALL USING (
    id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'owner'
  )
  WITH CHECK (
    id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'owner'
  );

CREATE POLICY "organizations_admin_read" ON organizations
  FOR SELECT USING (
    id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'admin'
  );

CREATE POLICY "organizations_teacher_read" ON organizations
  FOR SELECT USING (
    id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'teacher'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- PROFILES
-- Owner: full | Admin: read (org) | Teacher: read (self only)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "profiles_owner_full" ON profiles
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'owner'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'owner'
  );

CREATE POLICY "profiles_admin_read" ON profiles
  FOR SELECT USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'admin'
  );

CREATE POLICY "profiles_teacher_read_self" ON profiles
  FOR SELECT USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'teacher'
    AND id = auth.uid()
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- TEACHERS
-- Owner: full | Admin: full | Teacher: read (self) + update (self)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "teachers_owner_full" ON teachers
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'owner'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'owner'
  );

CREATE POLICY "teachers_admin_full" ON teachers
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'admin'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'admin'
  );

CREATE POLICY "teachers_teacher_read_self" ON teachers
  FOR SELECT USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'teacher'
    AND profile_id = auth.uid()
  );

CREATE POLICY "teachers_teacher_update_self" ON teachers
  FOR UPDATE USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'teacher'
    AND profile_id = auth.uid()
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'teacher'
    AND profile_id = auth.uid()
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- PARENTS
-- Owner: full | Admin: full | Teacher: no access
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "parents_owner_full" ON parents
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'owner'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'owner'
  );

CREATE POLICY "parents_admin_full" ON parents
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'admin'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'admin'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- STUDENTS
-- Owner: full | Admin: full | Teacher: read (linked via lessons)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "students_owner_full" ON students
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'owner'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'owner'
  );

CREATE POLICY "students_admin_full" ON students
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'admin'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'admin'
  );

-- Teacher reads students who have at least one lesson with that teacher.
-- Exact policy per docs/security.md.
CREATE POLICY "students_teacher_read_linked" ON students
  FOR SELECT USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'teacher'
    AND id IN (
      SELECT student_id FROM lessons
      WHERE teacher_id = get_my_teacher_id()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- RELATIONSHIPS
-- Owner: full | Admin: full | Teacher: read (linked via lessons)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "relationships_owner_full" ON relationships
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'owner'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'owner'
  );

CREATE POLICY "relationships_admin_full" ON relationships
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'admin'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'admin'
  );

CREATE POLICY "relationships_teacher_read_linked" ON relationships
  FOR SELECT USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'teacher'
    AND student_id IN (
      SELECT student_id FROM lessons
      WHERE teacher_id = get_my_teacher_id()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- AVAILABILITY
-- Owner: full | Admin: full | Teacher: full (own records only)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "availability_owner_full" ON availability
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'owner'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'owner'
  );

CREATE POLICY "availability_admin_full" ON availability
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'admin'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'admin'
  );

CREATE POLICY "availability_teacher_full_self" ON availability
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'teacher'
    AND teacher_id = get_my_teacher_id()
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'teacher'
    AND teacher_id = get_my_teacher_id()
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- AVAILABILITY_OVERRIDES
-- Owner: full | Admin: full | Teacher: full (own records only)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "availability_overrides_owner_full" ON availability_overrides
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'owner'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'owner'
  );

CREATE POLICY "availability_overrides_admin_full" ON availability_overrides
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'admin'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'admin'
  );

CREATE POLICY "availability_overrides_teacher_full_self" ON availability_overrides
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'teacher'
    AND teacher_id = get_my_teacher_id()
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'teacher'
    AND teacher_id = get_my_teacher_id()
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- LESSONS
-- Owner: full | Admin: full | Teacher: read (own) + update status (own)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "lessons_owner_full" ON lessons
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'owner'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'owner'
  );

CREATE POLICY "lessons_admin_full" ON lessons
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'admin'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'admin'
  );

CREATE POLICY "lessons_teacher_read_own" ON lessons
  FOR SELECT USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'teacher'
    AND teacher_id = get_my_teacher_id()
  );

-- Teacher may update status / cancel_reason on their own lessons only.
-- WITH CHECK ensures teacher_id and organization_id cannot be changed after update.
-- Note: preventing changes to student_id / start_at / end_at is enforced at the
-- application layer — RLS alone cannot restrict individual column writes in Postgres.
-- Exact policy per docs/security.md.
CREATE POLICY "lessons_teacher_update_own" ON lessons
  FOR UPDATE USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'teacher'
    AND teacher_id = get_my_teacher_id()
  )
  WITH CHECK (
    teacher_id      = get_my_teacher_id()
    AND organization_id = (auth.jwt() ->> 'org_id')::uuid
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- SLOT_LOCKS
-- Service role only. All authenticated user access denied.
-- Supabase service role bypasses RLS automatically — no additional policy needed.
-- Exact policy per docs/security.md.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "slot_locks_deny_all" ON slot_locks
  FOR ALL USING (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- CHARGES
-- Owner: full | Admin: read | Teacher: no access
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "charges_owner_full" ON charges
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'owner'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'owner'
  );

CREATE POLICY "charges_admin_read" ON charges
  FOR SELECT USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'admin'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- CANCELLATION_POLICIES
-- Owner: full | Admin: read | Teacher: no access
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "cancellation_policies_owner_full" ON cancellation_policies
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'owner'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'owner'
  );

CREATE POLICY "cancellation_policies_admin_read" ON cancellation_policies
  FOR SELECT USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'admin'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- LEADS
-- Owner: full | Admin: full | Teacher: no access
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "leads_owner_full" ON leads
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'owner'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'owner'
  );

CREATE POLICY "leads_admin_full" ON leads
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'admin'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'admin'
  );
