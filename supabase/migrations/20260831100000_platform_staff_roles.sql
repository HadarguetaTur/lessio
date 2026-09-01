-- ── Platform staff roles (Sprint 34, § B) ───────────────────────────────────
-- Per /docs/sprint-34-scope.md.
--
-- Until now `profiles.role = 'superadmin'` was necessary *and sufficient* to
-- reply to a support ticket — and the same predicate also changed any org's
-- plan, cancelled subscriptions, exported tenant data and entered support mode.
-- There was no separation, so a support colleague could not be given access
-- without handing them the entire platform.
--
-- Four staff roles join superadmin. Capabilities themselves live in TypeScript
-- (src/lib/superadmin/capabilities.ts), because platform writes run on the
-- service-role client and never touch RLS — the guard is the only gate. What
-- SQL still owns is *reads*: the unscoped tenant SELECT policies below.

-- ── role predicates ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_platform_role(r text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT r = 'superadmin' OR r LIKE 'platform\_%'
$$;

COMMENT ON FUNCTION public.is_platform_role(text) IS
  'True for org-less platform operators. Mirrors isPlatformRole() in src/lib/superadmin/capabilities.ts.';

-- Who keeps the unscoped tenant read grants. Marketing is deliberately absent:
-- its people work on leads and aggregate numbers and have no business reading
-- student or parent records. Excluding them here, and not only in the UI, is
-- what makes that a boundary rather than a convention.
CREATE OR REPLACE FUNCTION public.is_platform_reader()
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT public.is_platform_role(public.app_role())
     AND public.app_role() <> 'platform_marketing'
$$;

COMMENT ON FUNCTION public.is_platform_reader() IS
  'True when the caller may read any tenant. Mirrors isPlatformReader() in src/lib/superadmin/capabilities.ts.';

-- ── extend the role check ───────────────────────────────────────────────────

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'owner', 'admin', 'teacher',
    'superadmin',
    'platform_support', 'platform_billing', 'platform_marketing', 'platform_viewer'
  ));

-- The org invariant was a biconditional naming one role. Generalise it rather
-- than adding four more literals: every platform role is org-less, every tenant
-- role has an org.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_superadmin_org_check;

-- The platform subset is enumerated rather than matched with LIKE: '_' is a
-- single-character wildcard in LIKE, so 'platform_%' needs escaping to mean
-- what it looks like, and a CHECK that depends on a user-defined function is
-- fragile across dump/restore. Explicit is worth the duplication here.
ALTER TABLE profiles
  ADD CONSTRAINT profiles_platform_org_check
  CHECK (
    (role IN ('superadmin', 'platform_support', 'platform_billing', 'platform_marketing', 'platform_viewer') AND organization_id IS NULL)
    OR
    (role NOT IN ('superadmin', 'platform_support', 'platform_billing', 'platform_marketing', 'platform_viewer') AND organization_id IS NOT NULL)
  );

-- ── widen the tenant read policies ──────────────────────────────────────────
-- 20260824130000 wrote these as `(auth.jwt() ->> 'app_role') = 'superadmin'`.
-- A new platform role would see empty pages everywhere — the exact failure that
-- migration was written to fix. Same table list, same loop, one predicate.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'organizations', 'profiles', 'teachers', 'parents', 'students',
    'relationships', 'lessons', 'lesson_students', 'lesson_series',
    'availability', 'availability_overrides', 'organization_holidays',
    'day_off_requests', 'subscriptions', 'student_cancellation_events',
    'student_monthly_billing', 'charges', 'cancellation_policies',
    'student_groups', 'student_group_members', 'leads', 'homework_templates',
    'homework_assignments', 'homework_submissions', 'homework_attachments',
    'lesson_notes', 'student_goals', 'student_exams', 'message_templates'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_superadmin_read', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT USING (public.is_platform_reader())',
        t || '_superadmin_read', t
      );
    END IF;
  END LOOP;
END $$;

-- Added later than the loop above, so it carries the same literal.
DROP POLICY IF EXISTS "org_holiday_dismissals_superadmin_read" ON organization_holiday_dismissals;
CREATE POLICY "org_holiday_dismissals_superadmin_read"
  ON organization_holiday_dismissals FOR SELECT
  USING (public.is_platform_reader());

-- ── who invited whom ────────────────────────────────────────────────────────
-- Staff rows are profiles; only the provenance is new. Nullable because the
-- founding superadmin was inserted by hand before any of this existed.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS invited_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;

COMMENT ON COLUMN profiles.deactivated_at IS
  'Set when a platform colleague is offboarded. is_active stays the flag the guard reads; this records when.';

CREATE INDEX IF NOT EXISTS profiles_platform_staff_idx
  ON profiles (role)
  WHERE organization_id IS NULL;
