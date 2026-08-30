-- Migration: 20260829130000_fix_rls_app_role_claim.sql
--
-- Fixes RLS policies that were written AFTER 20260323000001_fix_auth_role_claim.sql
-- but kept reading the reserved `role` claim. That migration moved the business
-- role to `app_role` because Supabase/PostgREST uses top-level `role` to switch
-- the Postgres role — for a logged-in user it is always 'authenticated', so
-- `(auth.jwt() ->> 'role') = 'owner'` can never be true. Every policy below was
-- therefore dead: the table was effectively deny-all for the RLS-scoped client.
--
-- Verified on production 2026-08-29 with the real owner JWT of an org that has
-- 8 subscriptions and 7 student_groups rows:
--     students 123/123 ✓   lessons 1531/1531 ✓   charges 383/383 ✓
--     subscriptions 0/8 ✗  student_groups 0/7 ✗
-- The paying customer could not see her own tuition subscriptions or groups
-- anywhere the read goes through createClient() (src/lib/subscriptions/index.ts,
-- src/lib/groups/index.ts). Writes go through the service-role client, so
-- creating a row "succeeded" and the list stayed empty — the hardest shape of
-- this bug to report.
--
-- The fix introduces public.app_role() so the location of the business role is
-- defined in ONE place. New policies must call it instead of reaching into the
-- JWT themselves; that is what stops this from happening a fourth time.
--
-- ─── Two deliberate behaviour changes, not straight ports ────────────────────
--
-- 1. organization_subscriptions: the owner policy was FOR ALL. Repairing the
--    claim as-is would let an owner UPDATE their own platform subscription
--    straight through PostgREST with their own JWT — status='active',
--    plan_id=<advanced>, current_period_end='2099-01-01'. A self-service free
--    upgrade. Platform billing is written exclusively by the service-role
--    client (src/lib/saas/subscriptions.ts, api/sumit/webhook), so the owner
--    only ever needs SELECT. Narrowed accordingly.
--
-- 2. portal_messages already carries a RESTRICTIVE deny_all_portal_messages
--    (USING false) — the table is service-role-only by design and a restrictive
--    policy overrides every permissive one. Its three permissive policies are
--    repaired for consistency only; the deny still governs. They are kept
--    rather than dropped so that if the deny is ever lifted the policies are
--    correct instead of silently broken.

-- ─── Helper: one place that knows where the business role lives ──────────────

CREATE OR REPLACE FUNCTION public.app_role()
RETURNS text AS $$
  -- app_role is set by custom_access_token_hook. The `role` fallback covers a
  -- token minted before that hook existed; it is never the app role for a
  -- current session.
  SELECT COALESCE(
    NULLIF(auth.jwt() ->> 'app_role', ''),
    NULLIF(auth.jwt() ->> 'role', '')
  )
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION public.app_role() IS
  'Business role (owner/admin/teacher/superadmin) from the JWT. Use this in RLS policies — never (auth.jwt() ->> ''role''), which is the reserved Postgres role claim and is always ''authenticated''.';

-- ─── student_groups (20260422000002) ─────────────────────────────────────────

DROP POLICY IF EXISTS "student_groups_owner_full" ON student_groups;
CREATE POLICY "student_groups_owner_full" ON student_groups
  FOR ALL
  USING      ((auth.jwt() ->> 'org_id')::uuid = organization_id AND app_role() = 'owner')
  WITH CHECK ((auth.jwt() ->> 'org_id')::uuid = organization_id AND app_role() = 'owner');

DROP POLICY IF EXISTS "student_groups_admin_full" ON student_groups;
CREATE POLICY "student_groups_admin_full" ON student_groups
  FOR ALL
  USING      ((auth.jwt() ->> 'org_id')::uuid = organization_id AND app_role() = 'admin')
  WITH CHECK ((auth.jwt() ->> 'org_id')::uuid = organization_id AND app_role() = 'admin');

DROP POLICY IF EXISTS "student_groups_teacher_read" ON student_groups;
CREATE POLICY "student_groups_teacher_read" ON student_groups
  FOR SELECT
  USING ((auth.jwt() ->> 'org_id')::uuid = organization_id AND app_role() = 'teacher');

-- ─── student_group_members (20260422000002) ──────────────────────────────────

DROP POLICY IF EXISTS "student_group_members_owner_full" ON student_group_members;
CREATE POLICY "student_group_members_owner_full" ON student_group_members
  FOR ALL
  USING (
    group_id IN (
      SELECT id FROM student_groups
      WHERE organization_id = (auth.jwt() ->> 'org_id')::uuid
    )
    AND app_role() = 'owner'
  )
  WITH CHECK (
    group_id IN (
      SELECT id FROM student_groups
      WHERE organization_id = (auth.jwt() ->> 'org_id')::uuid
    )
    AND app_role() = 'owner'
  );

DROP POLICY IF EXISTS "student_group_members_admin_full" ON student_group_members;
CREATE POLICY "student_group_members_admin_full" ON student_group_members
  FOR ALL
  USING (
    group_id IN (
      SELECT id FROM student_groups
      WHERE organization_id = (auth.jwt() ->> 'org_id')::uuid
    )
    AND app_role() = 'admin'
  )
  WITH CHECK (
    group_id IN (
      SELECT id FROM student_groups
      WHERE organization_id = (auth.jwt() ->> 'org_id')::uuid
    )
    AND app_role() = 'admin'
  );

DROP POLICY IF EXISTS "student_group_members_teacher_read" ON student_group_members;
CREATE POLICY "student_group_members_teacher_read" ON student_group_members
  FOR SELECT
  USING (
    group_id IN (
      SELECT id FROM student_groups
      WHERE organization_id = (auth.jwt() ->> 'org_id')::uuid
    )
    AND app_role() = 'teacher'
  );

-- ─── subscriptions — student tuition, NOT platform billing (20260424000001) ──

DROP POLICY IF EXISTS "subscriptions_owner_full" ON subscriptions;
CREATE POLICY "subscriptions_owner_full" ON subscriptions
  FOR ALL
  USING      (organization_id = (auth.jwt() ->> 'org_id')::uuid AND app_role() = 'owner')
  WITH CHECK (organization_id = (auth.jwt() ->> 'org_id')::uuid AND app_role() = 'owner');

DROP POLICY IF EXISTS "subscriptions_admin_full" ON subscriptions;
CREATE POLICY "subscriptions_admin_full" ON subscriptions
  FOR ALL
  USING      (organization_id = (auth.jwt() ->> 'org_id')::uuid AND app_role() = 'admin')
  WITH CHECK (organization_id = (auth.jwt() ->> 'org_id')::uuid AND app_role() = 'admin');

-- ─── student_cancellation_events (20260424000001) ────────────────────────────

DROP POLICY IF EXISTS "cancel_events_owner_full" ON student_cancellation_events;
CREATE POLICY "cancel_events_owner_full" ON student_cancellation_events
  FOR ALL
  USING      (organization_id = (auth.jwt() ->> 'org_id')::uuid AND app_role() = 'owner')
  WITH CHECK (organization_id = (auth.jwt() ->> 'org_id')::uuid AND app_role() = 'owner');

DROP POLICY IF EXISTS "cancel_events_admin_full" ON student_cancellation_events;
CREATE POLICY "cancel_events_admin_full" ON student_cancellation_events
  FOR ALL
  USING      (organization_id = (auth.jwt() ->> 'org_id')::uuid AND app_role() = 'admin')
  WITH CHECK (organization_id = (auth.jwt() ->> 'org_id')::uuid AND app_role() = 'admin');

-- ─── student_monthly_billing (20260424000001) ────────────────────────────────

DROP POLICY IF EXISTS "monthly_billing_owner_full" ON student_monthly_billing;
CREATE POLICY "monthly_billing_owner_full" ON student_monthly_billing
  FOR ALL
  USING      (organization_id = (auth.jwt() ->> 'org_id')::uuid AND app_role() = 'owner')
  WITH CHECK (organization_id = (auth.jwt() ->> 'org_id')::uuid AND app_role() = 'owner');

DROP POLICY IF EXISTS "monthly_billing_admin_read" ON student_monthly_billing;
CREATE POLICY "monthly_billing_admin_read" ON student_monthly_billing
  FOR SELECT
  USING (organization_id = (auth.jwt() ->> 'org_id')::uuid AND app_role() = 'admin');

-- ─── organization_subscriptions — platform billing, READ ONLY (see note 1) ───

DROP POLICY IF EXISTS "org_subscriptions_owner_full" ON organization_subscriptions;
DROP POLICY IF EXISTS "org_subscriptions_owner_select" ON organization_subscriptions;
CREATE POLICY "org_subscriptions_owner_select" ON organization_subscriptions
  FOR SELECT
  USING (organization_id = (auth.jwt() ->> 'org_id')::uuid AND app_role() = 'owner');

DROP POLICY IF EXISTS "org_subscriptions_admin_select" ON organization_subscriptions;
CREATE POLICY "org_subscriptions_admin_select" ON organization_subscriptions
  FOR SELECT
  USING (organization_id = (auth.jwt() ->> 'org_id')::uuid AND app_role() = 'admin');

-- ─── saas_invoices (20260428000001) ──────────────────────────────────────────

DROP POLICY IF EXISTS "saas_invoices_owner_select" ON saas_invoices;
CREATE POLICY "saas_invoices_owner_select" ON saas_invoices
  FOR SELECT
  USING (organization_id = (auth.jwt() ->> 'org_id')::uuid AND app_role() = 'owner');

DROP POLICY IF EXISTS "saas_invoices_admin_select" ON saas_invoices;
CREATE POLICY "saas_invoices_admin_select" ON saas_invoices
  FOR SELECT
  USING (organization_id = (auth.jwt() ->> 'org_id')::uuid AND app_role() = 'admin');

-- ─── saas_plan_inquiries (20260428000001) ────────────────────────────────────

DROP POLICY IF EXISTS "saas_inquiries_owner_select" ON saas_plan_inquiries;
CREATE POLICY "saas_inquiries_owner_select" ON saas_plan_inquiries
  FOR SELECT
  USING (organization_id = (auth.jwt() ->> 'org_id')::uuid AND app_role() = 'owner');

-- ─── students / relationships — teacher-via-shared-lesson (20260325000001) ───
--
-- Not part of the SaaS audit's original list; found by asserting that no policy
-- anywhere still reads the reserved claim. These grant a teacher read access to
-- students they teach through a shared/group lesson rather than through
-- students.teacher_id. The direct-assignment policies (20260429000001) were
-- already correct, which is why a teacher sees their own roster today and this
-- stayed invisible — a teacher covering a group lesson for someone else's
-- student could not see that student or their parent links.

DROP POLICY IF EXISTS "students_teacher_read_linked" ON students;
CREATE POLICY "students_teacher_read_linked" ON students
  FOR SELECT USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND app_role() = 'teacher'
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
    AND app_role() = 'teacher'
    AND student_id IN (
      SELECT ls.student_id
      FROM lesson_students ls
      JOIN lessons l ON l.id = ls.lesson_id
      WHERE l.teacher_id = get_my_teacher_id()
    )
  );

-- ─── portal_messages (20260820000003) — see note 2 ───────────────────────────

DROP POLICY IF EXISTS "portal_messages_owner_read" ON portal_messages;
CREATE POLICY "portal_messages_owner_read" ON portal_messages
  FOR SELECT
  USING (organization_id = (auth.jwt() ->> 'org_id')::uuid AND app_role() = 'owner');

DROP POLICY IF EXISTS "portal_messages_admin_read" ON portal_messages;
CREATE POLICY "portal_messages_admin_read" ON portal_messages
  FOR SELECT
  USING (organization_id = (auth.jwt() ->> 'org_id')::uuid AND app_role() = 'admin');

DROP POLICY IF EXISTS "portal_messages_teacher_read" ON portal_messages;
CREATE POLICY "portal_messages_teacher_read" ON portal_messages
  FOR SELECT
  USING (organization_id = (auth.jwt() ->> 'org_id')::uuid AND app_role() = 'teacher');
