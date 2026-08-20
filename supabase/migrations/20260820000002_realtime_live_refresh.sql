-- Migration: 20260820000002_realtime_live_refresh.sql
-- Publishes the tables the dashboard live-refresh layer subscribes to.
--
-- src/lib/realtime/ opens one Realtime channel per organization and re-renders
-- the current route when a watched table changes. None of these tables were in
-- the `supabase_realtime` publication, so without this migration the module is
-- wired up correctly and silently receives nothing.
--
-- Replica identity is left at the default (primary key). Every trigger in the
-- product is an INSERT or an UPDATE — charges created and paid, lessons booked
-- and cancelled (a status update, not a delete), leads arriving, notifications
-- inserted, availability edited — and those carry the full new row. Switching
-- to REPLICA IDENTITY FULL would be needed only to filter DELETE events by
-- organization_id, and it doubles WAL volume for these tables to buy a case the
-- app does not have.
--
-- RLS still applies on top of the publication: Realtime only delivers a row the
-- subscribed user could SELECT. That is the actual tenant boundary — the
-- organization_id filter in the client is an optimisation, not the guard.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'charges',
    'lessons',
    'leads',
    'availability',
    'availability_overrides',
    'in_app_notifications'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END
$$;

-- in_app_notifications was deny-all under RLS, which is correct for its
-- contents but meant the notification bell could never receive its own pokes.
-- The narrowest possible opening: a signed-in user may read the notifications
-- addressed to them, and nothing else. profiles.id IS auth.users.id (see the
-- profiles definition in 20260321000001_schema.sql), so auth.uid() is the
-- recipient check. Writes stay service-role only — no INSERT/UPDATE/DELETE
-- policy is added here, so the existing deny-all continues to cover them.
DROP POLICY IF EXISTS "in_app_notifications_own_select" ON in_app_notifications;
CREATE POLICY "in_app_notifications_own_select"
  ON in_app_notifications
  FOR SELECT
  USING (recipient_profile_id = auth.uid());

COMMENT ON POLICY "in_app_notifications_own_select" ON in_app_notifications IS
  'Lets a user read their own notifications so the bell can live-update via Realtime. Recipient-scoped: never exposes another user''s notifications, and writes remain service-role only.';

-- NOTE: portal_messages is deliberately NOT published here. It is deny-all
-- under RLS, and deciding who on the staff side may read a family's message
-- thread (owners and admins only? a teacher, and only for their own students?)
-- is a product call, not a migration detail. Until that policy exists the
-- dashboard message pages fall back to their normal on-load fetch.
