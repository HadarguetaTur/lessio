-- Controlled-pilot security gate.
-- Public-schema state machines are service-role only, homework media is
-- private, and WhatsApp realtime reads use the application role claim.

ALTER TABLE cancellation_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_all_cancellation_sessions" ON cancellation_sessions;
CREATE POLICY "deny_all_cancellation_sessions"
  ON cancellation_sessions AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

UPDATE storage.buckets
   SET public = false
 WHERE id = 'homework-media';

DROP POLICY IF EXISTS "public read homework media" ON storage.objects;

DO $$
DECLARE
  tbl text;
  business_role text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['whatsapp_messages', 'whatsapp_takeovers'] LOOP
    FOREACH business_role IN ARRAY ARRAY['owner', 'admin', 'teacher'] LOOP
      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON %I',
        tbl || '_' || business_role || '_read', tbl
      );
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR SELECT USING ('
        || 'organization_id = (auth.jwt() ->> ''org_id'')::uuid '
        || 'AND public.app_role() = %L)',
        tbl || '_' || business_role || '_read', tbl, business_role
      );
    END LOOP;
  END LOOP;
END
$$;

-- Do not mint tenant claims for a deactivated profile. Existing access tokens
-- remain bounded by jwt_expiry; the application also checks is_active on every
-- request, while session revocation is performed by the archive action.
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
   WHERE id = (event ->> 'user_id')::uuid
     AND is_active = true;

  IF FOUND THEN
    claims := jsonb_set(
      claims,
      '{org_id}',
      COALESCE(to_jsonb(profile.organization_id::text), 'null'::jsonb)
    );
    claims := jsonb_set(claims, '{app_role}', to_jsonb(profile.role::text));
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
