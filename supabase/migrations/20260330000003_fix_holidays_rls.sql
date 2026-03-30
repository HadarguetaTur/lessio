-- Fix: org_holidays_owner_admin_all used the old 'role' JWT claim.
-- Since 20260323000001_fix_auth_role_claim, the app business role is stored
-- in 'app_role', not 'role'. This migration aligns the holidays policies.

DROP POLICY IF EXISTS "org_holidays_owner_admin_all" ON organization_holidays;
CREATE POLICY "org_holidays_owner_admin_all"
  ON organization_holidays
  FOR ALL
  TO authenticated
  USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') IN ('owner', 'admin')
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') IN ('owner', 'admin')
  );

DROP POLICY IF EXISTS "org_holidays_teacher_read" ON organization_holidays;
CREATE POLICY "org_holidays_teacher_read"
  ON organization_holidays
  FOR SELECT
  TO authenticated
  USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
  );
