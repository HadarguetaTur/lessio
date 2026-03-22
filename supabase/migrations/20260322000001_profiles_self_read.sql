-- Migration: 20260322000001_profiles_self_read.sql
-- Adds a fallback SELECT policy so every authenticated user can read their own
-- profile row. This does NOT depend on org_id / role JWT claims from the
-- custom_access_token hook, which means getSession() can bootstrap even if the
-- hook hasn't injected those claims yet (e.g. first login after local db reset).
--
-- Security: auth.uid() is derived from the session signature — a user can only
-- ever satisfy id = auth.uid() for their own row.

CREATE POLICY "profiles_self_read" ON profiles
  FOR SELECT USING (id = auth.uid());
