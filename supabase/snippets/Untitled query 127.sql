CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  claims jsonb := COALESCE(event -> 'claims', '{}'::jsonb);
  profile record;
BEGIN
  SELECT organization_id, role
  INTO profile
  FROM public.profiles
  WHERE id = (event ->> 'user_id')::uuid;

  IF FOUND THEN
    claims := jsonb_set(claims, '{org_id}', to_jsonb(profile.organization_id::text), true);
    claims := jsonb_set(claims, '{role}', to_jsonb(profile.role::text), true);
  END IF;

  RETURN jsonb_set(event, '{claims}', claims, true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC;