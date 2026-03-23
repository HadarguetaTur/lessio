-- Migration: 20260323000001_fix_auth_role_claim.sql
-- Fixes a JWT/RLS regression where the custom access token hook overwrote the
-- reserved `role` claim with the app's business role (`owner` / `admin` / `teacher`).
-- Supabase/PostgREST uses the top-level `role` claim to switch PostgreSQL roles,
-- so overwriting it caused runtime failures like: `role "owner" does not exist`.
--
-- The fix keeps Supabase's built-in `role` claim intact and stores the business
-- role in a custom `app_role` claim instead. RLS policies are updated to read
-- `auth.jwt() ->> 'app_role'`.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb AS $$
DECLARE
  claims  jsonb;
  profile record;
BEGIN
  claims := event -> 'claims';

  SELECT organization_id, role
    INTO profile
    FROM public.profiles
   WHERE id = (event ->> 'user_id')::uuid;

  IF FOUND THEN
    claims := jsonb_set(claims, '{org_id}', to_jsonb(profile.organization_id::text));
    claims := jsonb_set(claims, '{app_role}', to_jsonb(profile.role::text));
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

DROP POLICY IF EXISTS "organizations_owner_full" ON organizations;
CREATE POLICY "organizations_owner_full" ON organizations
  FOR ALL USING (
    id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'owner'
  )
  WITH CHECK (
    id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'owner'
  );

DROP POLICY IF EXISTS "organizations_admin_read" ON organizations;
CREATE POLICY "organizations_admin_read" ON organizations
  FOR SELECT USING (
    id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'admin'
  );

DROP POLICY IF EXISTS "organizations_teacher_read" ON organizations;
CREATE POLICY "organizations_teacher_read" ON organizations
  FOR SELECT USING (
    id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'teacher'
  );

DROP POLICY IF EXISTS "profiles_owner_full" ON profiles;
CREATE POLICY "profiles_owner_full" ON profiles
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'owner'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'owner'
  );

DROP POLICY IF EXISTS "profiles_admin_read" ON profiles;
CREATE POLICY "profiles_admin_read" ON profiles
  FOR SELECT USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'admin'
  );

DROP POLICY IF EXISTS "profiles_teacher_read_self" ON profiles;
CREATE POLICY "profiles_teacher_read_self" ON profiles
  FOR SELECT USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'teacher'
    AND id = auth.uid()
  );

DROP POLICY IF EXISTS "teachers_owner_full" ON teachers;
CREATE POLICY "teachers_owner_full" ON teachers
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'owner'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'owner'
  );

DROP POLICY IF EXISTS "teachers_admin_full" ON teachers;
CREATE POLICY "teachers_admin_full" ON teachers
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'admin'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'admin'
  );

DROP POLICY IF EXISTS "teachers_teacher_read_self" ON teachers;
CREATE POLICY "teachers_teacher_read_self" ON teachers
  FOR SELECT USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'teacher'
    AND profile_id = auth.uid()
  );

DROP POLICY IF EXISTS "teachers_teacher_update_self" ON teachers;
CREATE POLICY "teachers_teacher_update_self" ON teachers
  FOR UPDATE USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'teacher'
    AND profile_id = auth.uid()
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'teacher'
    AND profile_id = auth.uid()
  );

DROP POLICY IF EXISTS "parents_owner_full" ON parents;
CREATE POLICY "parents_owner_full" ON parents
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'owner'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'owner'
  );

DROP POLICY IF EXISTS "parents_admin_full" ON parents;
CREATE POLICY "parents_admin_full" ON parents
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'admin'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'admin'
  );

DROP POLICY IF EXISTS "students_owner_full" ON students;
CREATE POLICY "students_owner_full" ON students
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'owner'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'owner'
  );

DROP POLICY IF EXISTS "students_admin_full" ON students;
CREATE POLICY "students_admin_full" ON students
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'admin'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'admin'
  );

DROP POLICY IF EXISTS "students_teacher_read_linked" ON students;
CREATE POLICY "students_teacher_read_linked" ON students
  FOR SELECT USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'teacher'
    AND id IN (
      SELECT student_id FROM lessons
      WHERE teacher_id = get_my_teacher_id()
    )
  );

DROP POLICY IF EXISTS "relationships_owner_full" ON relationships;
CREATE POLICY "relationships_owner_full" ON relationships
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'owner'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'owner'
  );

DROP POLICY IF EXISTS "relationships_admin_full" ON relationships;
CREATE POLICY "relationships_admin_full" ON relationships
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'admin'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'admin'
  );

DROP POLICY IF EXISTS "relationships_teacher_read_linked" ON relationships;
CREATE POLICY "relationships_teacher_read_linked" ON relationships
  FOR SELECT USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'teacher'
    AND student_id IN (
      SELECT student_id FROM lessons
      WHERE teacher_id = get_my_teacher_id()
    )
  );

DROP POLICY IF EXISTS "availability_owner_full" ON availability;
CREATE POLICY "availability_owner_full" ON availability
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'owner'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'owner'
  );

DROP POLICY IF EXISTS "availability_admin_full" ON availability;
CREATE POLICY "availability_admin_full" ON availability
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'admin'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'admin'
  );

DROP POLICY IF EXISTS "availability_teacher_full_self" ON availability;
CREATE POLICY "availability_teacher_full_self" ON availability
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'teacher'
    AND teacher_id = get_my_teacher_id()
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'teacher'
    AND teacher_id = get_my_teacher_id()
  );

DROP POLICY IF EXISTS "availability_overrides_owner_full" ON availability_overrides;
CREATE POLICY "availability_overrides_owner_full" ON availability_overrides
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'owner'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'owner'
  );

DROP POLICY IF EXISTS "availability_overrides_admin_full" ON availability_overrides;
CREATE POLICY "availability_overrides_admin_full" ON availability_overrides
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'admin'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'admin'
  );

DROP POLICY IF EXISTS "availability_overrides_teacher_full_self" ON availability_overrides;
CREATE POLICY "availability_overrides_teacher_full_self" ON availability_overrides
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'teacher'
    AND teacher_id = get_my_teacher_id()
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'teacher'
    AND teacher_id = get_my_teacher_id()
  );

DROP POLICY IF EXISTS "lessons_owner_full" ON lessons;
CREATE POLICY "lessons_owner_full" ON lessons
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'owner'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'owner'
  );

DROP POLICY IF EXISTS "lessons_admin_full" ON lessons;
CREATE POLICY "lessons_admin_full" ON lessons
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'admin'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'admin'
  );

DROP POLICY IF EXISTS "lessons_teacher_read_own" ON lessons;
CREATE POLICY "lessons_teacher_read_own" ON lessons
  FOR SELECT USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'teacher'
    AND teacher_id = get_my_teacher_id()
  );

DROP POLICY IF EXISTS "lessons_teacher_update_own" ON lessons;
CREATE POLICY "lessons_teacher_update_own" ON lessons
  FOR UPDATE USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'teacher'
    AND teacher_id = get_my_teacher_id()
  )
  WITH CHECK (
    teacher_id      = get_my_teacher_id()
    AND organization_id = (auth.jwt() ->> 'org_id')::uuid
  );

DROP POLICY IF EXISTS "charges_owner_full" ON charges;
CREATE POLICY "charges_owner_full" ON charges
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'owner'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'owner'
  );

DROP POLICY IF EXISTS "charges_admin_read" ON charges;
CREATE POLICY "charges_admin_read" ON charges
  FOR SELECT USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'admin'
  );

DROP POLICY IF EXISTS "cancellation_policies_owner_full" ON cancellation_policies;
CREATE POLICY "cancellation_policies_owner_full" ON cancellation_policies
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'owner'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'owner'
  );

DROP POLICY IF EXISTS "cancellation_policies_admin_read" ON cancellation_policies;
CREATE POLICY "cancellation_policies_admin_read" ON cancellation_policies
  FOR SELECT USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'admin'
  );

DROP POLICY IF EXISTS "leads_owner_full" ON leads;
CREATE POLICY "leads_owner_full" ON leads
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'owner'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'owner'
  );

DROP POLICY IF EXISTS "leads_admin_full" ON leads;
CREATE POLICY "leads_admin_full" ON leads
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'admin'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') = 'admin'
  );
