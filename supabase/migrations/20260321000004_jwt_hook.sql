-- Migration: 20260321000004_jwt_hook.sql
-- Custom access token hook: injects org_id and role into every JWT.
-- Required for RLS policies that check auth.jwt() ->> 'org_id' and auth.jwt() ->> 'role'.
-- Enabled via config.toml [auth.hook.custom_access_token].

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb AS $$
DECLARE
  claims    jsonb;
  profile   record;
BEGIN
  claims := event -> 'claims';

  SELECT organization_id, role
    INTO profile
    FROM public.profiles
   WHERE id = (event ->> 'user_id')::uuid;

  IF FOUND THEN
    claims := jsonb_set(claims, '{org_id}', to_jsonb(profile.organization_id::text));
    claims := jsonb_set(claims, '{role}',   to_jsonb(profile.role::text));
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant execute to the Supabase Auth service role
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC;
