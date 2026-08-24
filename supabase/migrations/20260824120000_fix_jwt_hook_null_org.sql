-- Migration: 20260824120000_fix_jwt_hook_null_org.sql
-- The custom access token hook broke login for superadmins: their profile has
-- organization_id = NULL, and `jsonb_set(claims, '{org_id}', to_jsonb(NULL::text))`
-- returns SQL NULL (jsonb_set propagates a NULL new_value), wiping the whole
-- claims object. GoTrue then rejects the token with "output claims do not conform
-- to the expected schema", which surfaces in the UI as "Invalid email or password".
--
-- Never triggered before because no superadmin existed in prod until 24.08.2026.
-- Fix: coalesce a NULL org into jsonb null so the claims object survives.
-- RLS is unaffected: (auth.jwt() ->> 'org_id') yields SQL NULL for jsonb null,
-- so every org-scoped policy still evaluates false for superadmins.

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
