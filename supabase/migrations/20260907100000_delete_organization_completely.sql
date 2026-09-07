-- Hard-delete an organization and every row that belongs to it.
--
-- Reached only from the superadmin danger zone (/admin/orgs/[id]?tab=danger)
-- through the service-role client; no dashboard, portal or anon caller can
-- execute either function.
--
-- Why a database function rather than a sequence of PostgREST deletes:
--   * it is one transaction — a failure half-way leaves the tenant intact
--     instead of half-deleted;
--   * it discovers tenant tables at run time from pg_catalog, so a table added
--     next sprint with an organization_id column is covered without anyone
--     remembering to update a list;
--   * several child foreign keys (charges.parent_id, lessons.teacher_id,
--     homework_assignments.teacher_id, student_goals.created_by, ...) carry no
--     ON DELETE rule, so the order of deletion matters. Instead of hand-sorting
--     the graph, the loop deletes whatever it can each pass inside a savepoint
--     and retries the rest until nothing is left.
--
-- Tables whose organization_id references organizations ON DELETE SET NULL
-- (admin_audit_log, error_events, tracking_destinations, ...) are platform
-- records that were designed to outlive a tenant. They are left alone and the
-- final DELETE on organizations nulls their pointer as the schema intends.

CREATE OR REPLACE FUNCTION public.list_organization_storage_objects(p_org_id uuid)
RETURNS TABLE (bucket_id text, name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, storage
AS $$
  -- Every bucket stores tenant files under "<orgId>/..." (org-logos,
  -- homework-attachments, homework-submissions, exam-files, progress-reports).
  SELECT o.bucket_id, o.name
  FROM storage.objects o
  WHERE o.name LIKE p_org_id::text || '/%';
$$;

REVOKE EXECUTE ON FUNCTION public.list_organization_storage_objects(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_organization_storage_objects(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.delete_organization_completely(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_name    text;
  v_remaining   text[];
  v_next        text[];
  v_tbl         text;
  v_count       bigint;
  v_deleted     jsonb := '{}'::jsonb;
  v_pass        int := 0;
  v_progress    boolean;
  v_last_error  text;
BEGIN
  SELECT name INTO v_org_name FROM organizations WHERE id = p_org_id;
  IF v_org_name IS NULL THEN
    RAISE EXCEPTION 'organization % not found', p_org_id USING ERRCODE = 'no_data_found';
  END IF;

  -- A platform operator never carries an org_id, so this only ever trips if
  -- someone hand-edited profiles. Refuse rather than delete the operator.
  IF EXISTS (
    SELECT 1 FROM profiles
    WHERE organization_id = p_org_id
      AND role IN ('superadmin', 'platform_support', 'platform_billing', 'platform_marketing', 'platform_viewer')
  ) THEN
    RAISE EXCEPTION 'organization % holds a platform staff profile; refusing to delete', p_org_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Every public table with an organization_id column, minus organizations
  -- itself and minus tables whose org FK is ON DELETE SET NULL.
  SELECT array_agg(c.table_name::text ORDER BY c.table_name)
  INTO v_remaining
  FROM information_schema.columns c
  JOIN pg_class pc ON pc.relname = c.table_name
  JOIN pg_namespace pn ON pn.oid = pc.relnamespace AND pn.nspname = c.table_schema
  WHERE c.table_schema = 'public'
    AND c.column_name = 'organization_id'
    AND c.table_name <> 'organizations'
    AND pc.relkind = 'r'
    AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint k
      WHERE k.conrelid = pc.oid
        AND k.contype = 'f'
        AND k.confrelid = 'public.organizations'::regclass
        AND k.confdeltype = 'n'   -- SET NULL
    );

  v_remaining := COALESCE(v_remaining, ARRAY[]::text[]);

  -- Multi-pass delete. A pass that deletes nothing and still has tables left
  -- means a dependency outside the tenant's own tables; surface the last
  -- foreign-key error rather than loop forever.
  WHILE array_length(v_remaining, 1) > 0 LOOP
    v_pass := v_pass + 1;
    v_progress := false;
    v_next := ARRAY[]::text[];

    FOREACH v_tbl IN ARRAY v_remaining LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE organization_id = $1', v_tbl)
          USING p_org_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count > 0 THEN
          v_deleted := v_deleted || jsonb_build_object(v_tbl, v_count);
        END IF;
        v_progress := true;
      EXCEPTION
        WHEN foreign_key_violation THEN
          v_last_error := SQLERRM;
          v_next := v_next || v_tbl;
      END;
    END LOOP;

    IF NOT v_progress THEN
      RAISE EXCEPTION 'delete_organization_completely: no progress after pass % — tables still blocked: % (last error: %)',
        v_pass, array_to_string(v_next, ', '), v_last_error
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    v_remaining := v_next;

    IF v_pass > 50 THEN
      RAISE EXCEPTION 'delete_organization_completely: gave up after % passes', v_pass;
    END IF;
  END LOOP;

  -- Everything without an organization_id column that still points at the
  -- tenant (lesson_students via lessons, storage rows, SET NULL platform logs)
  -- is handled by the cascade / set-null rules on this last delete.
  DELETE FROM organizations WHERE id = p_org_id;

  RETURN jsonb_build_object(
    'org_id', p_org_id,
    'org_name', v_org_name,
    'passes', v_pass,
    'deleted', v_deleted
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_organization_completely(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_organization_completely(uuid) TO service_role;

COMMENT ON FUNCTION public.delete_organization_completely(uuid) IS
  'Superadmin danger zone: hard-deletes a tenant and every row with its organization_id in one transaction. Auth users and storage files are removed by the calling server action (deleteOrganizationAction) — see src/lib/superadmin/deleteOrganization.ts.';
