-- Migration: 20260820000003_portal_messages_realtime.sql
-- Lets dashboard staff read parent message threads, and publishes the table so
-- the message pages update live.
--
-- portal_messages was deny-all under RLS, which left it as the one table
-- src/lib/realtime/ watches that could never deliver an event (see the closing
-- note in 20260820000002). Per the product decision: owners, admins and
-- teachers may read threads.
--
-- Scope is the whole organization for all three roles, deliberately. That is
-- what the product already does: the sidebar offers /messages to
-- ['owner','admin','teacher'] (src/components/dashboard/Sidebar.tsx) and
-- getDashboardConversationSummaries(orgId) loads every thread in the org with
-- no per-teacher filter. Narrowing RLS to a teacher's own students here would
-- not hide anything — that page reads through the service-role client — it
-- would only stop the live updates on threads the teacher can already see, and
-- leave half the list refreshing and half of it stale.
--
-- Note that this is broader than the teacher convention elsewhere in the schema
-- (lessons_teacher_read_own scopes to get_my_teacher_id()). If teachers should
-- only reach their own students' threads, that is a change to the page query
-- first and this policy second — not a change to this policy alone.
--
-- Reads only. No INSERT/UPDATE/DELETE policy is added, so writes stay
-- service-role: staff replies continue to go through the server action.

DROP POLICY IF EXISTS "portal_messages_owner_read" ON portal_messages;
CREATE POLICY "portal_messages_owner_read"
  ON portal_messages
  FOR SELECT
  USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'owner'
  );

DROP POLICY IF EXISTS "portal_messages_admin_read" ON portal_messages;
CREATE POLICY "portal_messages_admin_read"
  ON portal_messages
  FOR SELECT
  USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'admin'
  );

DROP POLICY IF EXISTS "portal_messages_teacher_read" ON portal_messages;
CREATE POLICY "portal_messages_teacher_read"
  ON portal_messages
  FOR SELECT
  USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'teacher'
  );

COMMENT ON POLICY "portal_messages_teacher_read" ON portal_messages IS
  'Org-wide on purpose: /messages already lists every thread in the organization to teachers via the service-role client. Narrowing this would only break live updates, not restrict access.';

-- Publish for Realtime. Same reasoning as 20260820000002: replica identity
-- stays at the default, since a thread only ever gains rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'portal_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.portal_messages;
  END IF;
END
$$;
