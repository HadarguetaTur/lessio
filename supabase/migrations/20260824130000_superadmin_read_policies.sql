-- Migration: 20260824130000_superadmin_read_policies.sql
-- Support mode (superadmin viewing an org's dashboard) rendered empty pages for
-- every page that reads through the RLS-scoped client: the superadmin JWT carries
-- app_role='superadmin' and org_id=null, and no policy anywhere granted that role
-- SELECT. Pages backed by the service-role client (dashboard stats) worked, so the
-- breakage was partial and confusing: subscriptions, lessons, students etc. all
-- looked deleted while the KPI cards showed real numbers.
--
-- Fix: a read-only SELECT policy for app_role='superadmin' on the org-facing
-- tables. Deliberately unscoped by org — a platform operator can read any tenant
-- (support mode's server components still filter by the target org id). Writes
-- remain blocked twice over: no INSERT/UPDATE/DELETE policy is added here, and
-- requireMutation() rejects support-mode server actions before any query runs.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'organizations',
    'profiles',
    'teachers',
    'parents',
    'students',
    'relationships',
    'lessons',
    'lesson_students',
    'lesson_series',
    'availability',
    'availability_overrides',
    'organization_holidays',
    'day_off_requests',
    'subscriptions',
    'student_cancellation_events',
    'student_monthly_billing',
    'charges',
    'cancellation_policies',
    'student_groups',
    'student_group_members',
    'leads',
    'homework_templates',
    'homework_assignments',
    'homework_submissions',
    'homework_attachments',
    'lesson_notes',
    'student_goals',
    'student_exams',
    'message_templates'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_superadmin_read', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT USING ((auth.jwt() ->> ''app_role'') = ''superadmin'')',
        t || '_superadmin_read',
        t
      );
    END IF;
  END LOOP;
END $$;
