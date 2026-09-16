-- Durable research jobs and opt-in automatic promotion. Safe to deploy before code.
ALTER TABLE outbound_candidates
  ADD COLUMN research_requested_at timestamptz,
  ADD COLUMN research_claimed_at timestamptz,
  ADD COLUMN research_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN research_completed_at timestamptz,
  ADD COLUMN opener_fact_ids integer[] NOT NULL DEFAULT '{}',
  ADD COLUMN approval_mode text CHECK (approval_mode IN ('manual', 'automatic'));

-- Existing unfinished candidates are researched under the new quality gate.
UPDATE outbound_candidates SET research_requested_at = now(), review_status = 'new',
  personal_line = NULL, opener_status = 'pending'
WHERE review_status IN ('new', 'ready_for_review') AND prospect_id IS NULL;

CREATE INDEX outbound_candidate_research_queue_idx
  ON outbound_candidates (research_requested_at) WHERE research_requested_at IS NOT NULL;

CREATE TABLE outbound_discovery_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  auto_approve boolean NOT NULL DEFAULT false,
  campaign_id uuid REFERENCES outbound_campaigns(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL
);
INSERT INTO outbound_discovery_settings (id) VALUES (true);
ALTER TABLE outbound_discovery_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_all_outbound_discovery_settings ON outbound_discovery_settings
  AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);

-- Single transaction owns the daily discovery budget; repeats never overwrite reviewed rows.
CREATE FUNCTION reserve_outbound_candidates(p_places jsonb, p_queries jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_run uuid; v_place jsonb; v_id uuid; v_count integer; v_inserted integer := 0;
  v_day timestamptz := date_trunc('day', now() AT TIME ZONE 'Asia/Jerusalem') AT TIME ZONE 'Asia/Jerusalem';
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('outbound-discovery-budget'));
  SELECT count(*) INTO v_count FROM outbound_candidates WHERE created_at >= v_day;
  IF v_count >= 50 THEN RETURN jsonb_build_object('found', 0, 'ready', 0, 'skipped', 0, 'budget_left', 0); END IF;
  INSERT INTO outbound_discovery_runs(provider, queries, requested_limit)
    VALUES ('google_places', p_queries, 50 - v_count) RETURNING id INTO v_run;
  FOR v_place IN SELECT value FROM jsonb_array_elements(p_places) LIMIT 100 LOOP
    EXIT WHEN v_inserted >= 50 - v_count;
    IF coalesce(v_place->>'provider_place_id', '') = '' OR coalesce(v_place->>'business_name', '') = '' THEN CONTINUE; END IF;
    v_id := NULL;
    INSERT INTO outbound_candidates(discovery_run_id, provider_place_id, business_name, phone,
      address, website_url, source_url, category, research_requested_at)
    VALUES (v_run, v_place->>'provider_place_id', v_place->>'business_name', v_place->>'phone',
      v_place->>'address', v_place->>'website_url', v_place->>'website_url', v_place->>'category', now())
    ON CONFLICT (provider, provider_place_id) DO NOTHING RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN v_inserted := v_inserted + 1; END IF;
  END LOOP;
  UPDATE outbound_discovery_runs SET found_count = v_inserted, finished_at = now() WHERE id = v_run;
  RETURN jsonb_build_object('found', v_inserted, 'ready', 0, 'skipped', jsonb_array_length(p_places) - v_inserted,
    'budget_left', 50 - v_count - v_inserted);
END;
$$;

CREATE FUNCTION claim_outbound_research(p_limit integer DEFAULT 3)
RETURNS SETOF outbound_candidates LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  UPDATE outbound_candidates c SET research_claimed_at = now(), research_attempts = research_attempts + 1
  WHERE c.id IN (
    SELECT q.id FROM outbound_candidates q
    WHERE q.review_status IN ('new', 'ready_for_review') AND q.prospect_id IS NULL
      AND q.research_requested_at <= now() AND q.research_attempts < 3
      AND (q.research_claimed_at IS NULL OR q.research_claimed_at < now() - interval '10 minutes')
    ORDER BY q.research_requested_at, q.id LIMIT LEAST(GREATEST(p_limit, 1), 3)
    FOR UPDATE SKIP LOCKED
  ) RETURNING c.*;
$$;

-- Completion and evidence commit together; a stale worker cannot overwrite a rerun.
CREATE FUNCTION complete_outbound_research(p_id uuid, p_claim timestamptz, p_result jsonb, p_evidence jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_candidate outbound_candidates; v_evidence jsonb;
BEGIN
  SELECT * INTO v_candidate FROM outbound_candidates WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR v_candidate.research_claimed_at IS DISTINCT FROM p_claim
    OR v_candidate.review_status NOT IN ('new', 'ready_for_review') OR v_candidate.prospect_id IS NOT NULL THEN RETURN false; END IF;
  UPDATE outbound_candidates SET
    email = p_result->>'email', email_source_url = p_result->>'email_source_url',
    research_facts = p_result->'research_facts', quality_score = (p_result->>'quality_score')::integer,
    quality_reasons = p_result->'quality_reasons', research_status = p_result->>'research_status',
    review_status = p_result->>'review_status', rejection_reason = p_result->>'rejection_reason',
    personal_line = p_result->>'personal_line', opener_status = p_result->>'opener_status',
    opener_error = p_result->>'opener_error',
    opener_fact_ids = ARRAY(SELECT jsonb_array_elements_text(p_result->'opener_fact_ids')::integer),
    research_completed_at = now(), research_claimed_at = NULL,
    research_requested_at = CASE WHEN coalesce((p_result->>'retry')::boolean, false)
      AND research_attempts < 3 THEN now() + interval '30 minutes' ELSE NULL END
  WHERE id = p_id;
  DELETE FROM outbound_candidate_evidence WHERE candidate_id = p_id;
  FOR v_evidence IN SELECT value FROM jsonb_array_elements(p_evidence) LOOP
    INSERT INTO outbound_candidate_evidence(candidate_id, source_url, kind, excerpt)
    VALUES (p_id, v_evidence->>'source_url', v_evidence->>'kind', left(v_evidence->>'excerpt', 3000));
  END LOOP;
  RETURN true;
END;
$$;

-- Both manual and automatic promotion use the SAME locked quality gate.
CREATE FUNCTION promote_outbound_candidate(p_id uuid, p_actor uuid DEFAULT NULL, p_automatic boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c outbound_candidates; settings outbound_discovery_settings; v_campaign uuid; v_prospect uuid;
  v_facts integer; v_text text;
BEGIN
  SELECT * INTO settings FROM outbound_discovery_settings WHERE id = true FOR SHARE;
  IF p_automatic AND NOT settings.auto_approve THEN RETURN 'paused'; END IF;
  IF NOT p_automatic AND p_actor IS NULL THEN RETURN 'actor_required'; END IF;
  SELECT * INTO c FROM outbound_candidates WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR c.review_status <> 'ready_for_review' OR c.prospect_id IS NOT NULL
    OR c.research_claimed_at IS NOT NULL OR c.research_requested_at IS NOT NULL THEN RETURN 'not_ready'; END IF;
  SELECT count(DISTINCT f->>'label') INTO v_facts FROM jsonb_array_elements(c.research_facts) f
    WHERE length(coalesce(f->>'quote', '')) > 0 AND coalesce(f->>'sourceUrl', '') ~ '^https?://';
  IF c.email IS NULL OR c.email_source_url IS NULL OR c.quality_score < 70 OR v_facts < 2
    OR c.rejection_reason IS NOT NULL OR c.opener_status <> 'generated'
    OR coalesce(array_length(c.opener_fact_ids, 1), 0) NOT BETWEEN 1 AND 2 THEN RETURN 'quality_blocked'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(c.opener_fact_ids) i WHERE i < 0 OR i >= jsonb_array_length(c.research_facts))
    OR (SELECT count(DISTINCT i) FROM unnest(c.opener_fact_ids) i) <> array_length(c.opener_fact_ids, 1) THEN RETURN 'quality_blocked'; END IF;
  SELECT 'קראתי באתר שלכם על ' || string_agg(c.research_facts->i->>'value', ' ועל ' ORDER BY ord) || '.'
    INTO v_text FROM unnest(c.opener_fact_ids) WITH ORDINALITY a(i, ord);
  IF c.personal_line IS DISTINCT FROM v_text THEN RETURN 'quality_blocked'; END IF;
  IF EXISTS (SELECT 1 FROM outbound_suppressions WHERE email = c.email) THEN
    UPDATE outbound_candidates SET review_status = 'rejected', rejection_reason = 'SUPPRESSED' WHERE id = p_id;
    RETURN 'suppressed';
  END IF;
  SELECT id INTO v_campaign FROM outbound_campaigns
    WHERE is_active AND locale = 'he' AND body_text LIKE '%{{personal_line}}%'
      AND (settings.campaign_id IS NULL OR id = settings.campaign_id)
    ORDER BY created_at DESC LIMIT 1;
  -- Automatic operation must be bound to a deliberately selected campaign.
  IF v_campaign IS NULL OR (p_automatic AND settings.campaign_id IS NULL) THEN RETURN 'no_campaign'; END IF;
  INSERT INTO outbound_prospects(campaign_id, email, company, phone, locale, personal_line, subject_area,
    source_url, metadata, status, opener_status, unsubscribe_token)
  VALUES (v_campaign, c.email, c.business_name, c.phone, 'he', c.personal_line, c.category,
    c.source_url, jsonb_build_object('discovery_candidate_id', c.id, 'source', 'google_places',
      'approval_mode', CASE WHEN p_automatic THEN 'automatic' ELSE 'manual' END),
    'queued', 'approved', replace(gen_random_uuid()::text, '-', ''))
  ON CONFLICT (email) DO NOTHING RETURNING id INTO v_prospect;
  UPDATE outbound_candidates SET review_status = CASE WHEN v_prospect IS NULL THEN 'duplicate' ELSE 'approved' END,
    prospect_id = v_prospect, reviewed_at = now(), reviewed_by = p_actor,
    approval_mode = CASE WHEN p_automatic THEN 'automatic' ELSE 'manual' END
  WHERE id = p_id;
  RETURN CASE WHEN v_prospect IS NULL THEN 'duplicate' ELSE 'approved' END;
END;
$$;

-- Retire the old four-argument overload, which had no daily budget.
DROP FUNCTION IF EXISTS claim_next_outbound_prospects(timestamptz, interval, integer, uuid);

-- Includes in-flight reservations, so parallel sender ticks cannot spend the same budget.
CREATE OR REPLACE FUNCTION claim_next_outbound_prospects(
  p_now timestamptz, p_lease interval, p_limit integer, p_campaign_id uuid DEFAULT NULL,
  p_day_start timestamptz DEFAULT date_trunc('day', now()), p_daily_limit integer DEFAULT 50
) RETURNS SETOF outbound_prospects LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_used integer; v_reserved integer; v_limit integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('outbound-cold-daily-budget'));
  SELECT count(*) INTO v_used FROM outbound_prospects WHERE sent_at >= p_day_start;
  SELECT count(*) INTO v_reserved FROM outbound_prospects
    WHERE status = 'claimed' AND claimed_at >= p_now - p_lease;
  v_limit := GREATEST(0, LEAST(p_limit, 50, LEAST(p_daily_limit, 50) - v_used - v_reserved));
  RETURN QUERY
    UPDATE outbound_prospects p SET status = 'claimed', claimed_at = p_now
    WHERE p.id IN (
      SELECT q.id FROM outbound_prospects q JOIN outbound_campaigns c ON c.id = q.campaign_id AND c.is_active
      WHERE (q.status = 'queued' OR (q.status = 'claimed' AND q.claimed_at < p_now - p_lease))
        AND q.opener_status IN ('none', 'approved')
        AND (p_campaign_id IS NULL OR q.campaign_id = p_campaign_id)
        AND NOT EXISTS (SELECT 1 FROM outbound_suppressions s WHERE s.email = q.email)
        AND (q.metadata->>'approval_mode' IS DISTINCT FROM 'automatic'
          OR EXISTS (SELECT 1 FROM outbound_discovery_settings s WHERE s.id = true AND s.auto_approve AND s.campaign_id = q.campaign_id))
      ORDER BY q.created_at LIMIT v_limit FOR UPDATE OF q SKIP LOCKED
    ) RETURNING p.*;
END;
$$;

REVOKE EXECUTE ON FUNCTION reserve_outbound_candidates(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION claim_outbound_research(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION complete_outbound_research(uuid, timestamptz, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION promote_outbound_candidate(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION claim_next_outbound_prospects(timestamptz, interval, integer, uuid, timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION reserve_outbound_candidates(jsonb, jsonb), claim_outbound_research(integer),
  complete_outbound_research(uuid, timestamptz, jsonb, jsonb), promote_outbound_candidate(uuid, uuid, boolean),
  claim_next_outbound_prospects(timestamptz, interval, integer, uuid, timestamptz, integer) TO service_role;

COMMENT ON TABLE outbound_candidates IS
  'Discovery and durable research queue. Manual and opt-in automatic promotion share a source-backed quality gate.';
