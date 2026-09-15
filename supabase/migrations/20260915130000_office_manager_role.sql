-- Sprint 35: operational office manager role.
-- Existing admin rows remain admin; this only adds an explicitly assigned role.

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN (
    'owner', 'admin', 'office_manager', 'teacher',
    'superadmin', 'platform_support', 'platform_billing',
    'platform_marketing', 'platform_viewer'
  ));

-- Office managers are tenant users and may never become platform operators.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_platform_org_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_platform_org_check CHECK (
    (role IN ('superadmin', 'platform_support', 'platform_billing', 'platform_marketing', 'platform_viewer')
      AND organization_id IS NULL)
    OR
    (role NOT IN ('superadmin', 'platform_support', 'platform_billing', 'platform_marketing', 'platform_viewer')
      AND organization_id IS NOT NULL)
  );

-- These policies intentionally cover operational tables only. Financial tables
-- (charges, billing, receipts and economics tables) receive no office-manager
-- policy and remain unavailable through the authenticated Supabase client.
CREATE POLICY office_manager_organizations_read ON organizations
  FOR SELECT USING (id = (auth.jwt() ->> 'org_id')::uuid AND public.app_role() = 'office_manager');

CREATE POLICY office_manager_profiles_read ON profiles
  FOR SELECT USING (organization_id = (auth.jwt() ->> 'org_id')::uuid AND public.app_role() = 'office_manager');

CREATE POLICY office_manager_teachers_read ON teachers
  FOR SELECT USING (organization_id = (auth.jwt() ->> 'org_id')::uuid AND public.app_role() = 'office_manager');

CREATE POLICY office_manager_students_all ON students
  FOR ALL USING (organization_id = (auth.jwt() ->> 'org_id')::uuid AND public.app_role() = 'office_manager')
  WITH CHECK (organization_id = (auth.jwt() ->> 'org_id')::uuid AND public.app_role() = 'office_manager');

CREATE POLICY office_manager_relationships_all ON relationships
  FOR ALL USING (organization_id = (auth.jwt() ->> 'org_id')::uuid AND public.app_role() = 'office_manager')
  WITH CHECK (organization_id = (auth.jwt() ->> 'org_id')::uuid AND public.app_role() = 'office_manager');

CREATE POLICY office_manager_availability_all ON availability
  FOR ALL USING (organization_id = (auth.jwt() ->> 'org_id')::uuid AND public.app_role() = 'office_manager')
  WITH CHECK (organization_id = (auth.jwt() ->> 'org_id')::uuid AND public.app_role() = 'office_manager');

CREATE POLICY office_manager_availability_overrides_all ON availability_overrides
  FOR ALL USING (organization_id = (auth.jwt() ->> 'org_id')::uuid AND public.app_role() = 'office_manager')
  WITH CHECK (organization_id = (auth.jwt() ->> 'org_id')::uuid AND public.app_role() = 'office_manager');

CREATE POLICY office_manager_lessons_all ON lessons
  FOR ALL USING (organization_id = (auth.jwt() ->> 'org_id')::uuid AND public.app_role() = 'office_manager')
  WITH CHECK (organization_id = (auth.jwt() ->> 'org_id')::uuid AND public.app_role() = 'office_manager');

CREATE POLICY office_manager_lesson_students_all ON lesson_students
  FOR ALL USING (organization_id = (auth.jwt() ->> 'org_id')::uuid AND public.app_role() = 'office_manager')
  WITH CHECK (organization_id = (auth.jwt() ->> 'org_id')::uuid AND public.app_role() = 'office_manager');

CREATE POLICY office_manager_lesson_series_all ON lesson_series
  FOR ALL USING (organization_id = (auth.jwt() ->> 'org_id')::uuid AND public.app_role() = 'office_manager')
  WITH CHECK (organization_id = (auth.jwt() ->> 'org_id')::uuid AND public.app_role() = 'office_manager');

CREATE POLICY office_manager_holidays_all ON organization_holidays
  FOR ALL USING (organization_id = (auth.jwt() ->> 'org_id')::uuid AND public.app_role() = 'office_manager')
  WITH CHECK (organization_id = (auth.jwt() ->> 'org_id')::uuid AND public.app_role() = 'office_manager');
