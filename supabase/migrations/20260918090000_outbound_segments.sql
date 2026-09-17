-- Cold discovery serves two audiences, each with its own campaign: small teams
-- (2-5 teachers) and solo tutors. 6+ stays inbound. Collection budget 50 -> 150 a day;
-- the send cap (50 first emails a day) is a deliverability limit and does not move.
BEGIN;

ALTER TABLE outbound_candidates ADD COLUMN segment text NOT NULL DEFAULT 'unknown'
  CHECK (segment IN ('team','solo','unknown'));
ALTER TABLE outbound_discovery_settings ADD COLUMN solo_campaign_id uuid
  REFERENCES outbound_campaigns(id) ON DELETE RESTRICT;
COMMENT ON COLUMN outbound_discovery_settings.campaign_id IS 'Campaign for the team segment (2-5 teachers).';
COMMENT ON COLUMN outbound_discovery_settings.solo_campaign_id IS 'Campaign for the solo-tutor segment.';

-- One teacher is a solo tutor, not a rejection. Mirrors teamSizeStatus() in discoveryResearch.ts.
CREATE OR REPLACE FUNCTION outbound_team_status(facts jsonb, website text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN count(DISTINCT n.teacher_count) = 0 THEN 'unknown'
    WHEN count(DISTINCT n.teacher_count) > 1 THEN 'conflict'
    WHEN min(n.teacher_count) = 1 THEN 'solo'
    WHEN min(n.teacher_count) BETWEEN 2 AND 5 THEN 'verified'
    ELSE 'out_of_range' END
  FROM jsonb_array_elements(coalesce(facts, '[]')) f,
  LATERAL regexp_matches(f->>'quote', '(?:צוות(?:\s+המורים)?\s+(?:של|מונה)|our\s+team\s+consists of)\s+([0-9]{1,3}|שני|שתי|שלושה|שלוש|ארבעה|ארבע|חמישה|חמש|שישה|שש|שבעה|שבע|שמונה|תשעה|תשע|עשרה|עשר)\s+(?:מורים|מורות|teachers)(?:$|[^[:alnum:]])', 'gi') m
  CROSS JOIN LATERAL (SELECT CASE
    WHEN m[1] IN ('שני','שתי') THEN 2 WHEN m[1] IN ('שלושה','שלוש') THEN 3
    WHEN m[1] IN ('ארבעה','ארבע') THEN 4 WHEN m[1] IN ('חמישה','חמש') THEN 5
    WHEN m[1] IN ('שישה','שש') THEN 6 WHEN m[1] IN ('שבעה','שבע') THEN 7
    WHEN m[1]='שמונה' THEN 8 WHEN m[1] IN ('תשעה','תשע') THEN 9
    WHEN m[1] IN ('עשרה','עשר') THEN 10 ELSE m[1]::integer END AS teacher_count) n
  WHERE f->>'label' = 'מספר מורים' AND f->>'sourceUrl' ~ '^https?://'
    AND website ~ '^https?://'
    AND split_part(regexp_replace(lower(f->>'sourceUrl'), '^https?://(www\.)?', ''), '/', 1)
      = split_part(regexp_replace(lower(website), '^https?://(www\.)?', ''), '/', 1);
$$;

-- Research decides the segment; an undecided rerun keeps what a person chose.
CREATE OR REPLACE FUNCTION complete_outbound_research(p_id uuid, p_claim timestamptz, p_result jsonb, p_evidence jsonb)
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
    segment = CASE WHEN p_result->>'segment' IN ('team','solo') THEN p_result->>'segment' ELSE segment END,
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

-- The locked quality gate, now told which campaign to queue into.
DROP FUNCTION promote_outbound_candidate_quality_v1(uuid,uuid,boolean);
CREATE FUNCTION promote_outbound_candidate_quality_v2(p_id uuid, p_actor uuid, p_automatic boolean, p_campaign uuid)
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
    WHERE id = p_campaign AND is_active AND locale = 'he' AND body_text LIKE '%{{personal_line}}%';
  IF v_campaign IS NULL THEN RETURN 'no_campaign'; END IF;
  INSERT INTO outbound_prospects(campaign_id, email, company, phone, locale, personal_line, subject_area,
    source_url, metadata, status, opener_status, unsubscribe_token)
  VALUES (v_campaign, c.email, c.business_name, c.phone, 'he', c.personal_line, c.category,
    c.source_url, jsonb_build_object('discovery_candidate_id', c.id, 'source', 'google_places', 'segment', c.segment,
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

CREATE OR REPLACE FUNCTION promote_outbound_candidate(p_id uuid, p_actor uuid DEFAULT NULL, p_automatic boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c outbound_candidates; settings outbound_discovery_settings; team text; v_campaign uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('outbound-business-promotion'));
  SELECT * INTO settings FROM outbound_discovery_settings WHERE id = true;
  IF p_automatic AND NOT settings.auto_approve THEN RETURN 'paused'; END IF;
  SELECT * INTO c FROM outbound_candidates WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR c.review_status <> 'ready_for_review' OR c.prospect_id IS NOT NULL THEN RETURN 'not_ready'; END IF;
  IF EXISTS (SELECT 1 FROM outbound_suppressions WHERE email=c.email) THEN RETURN 'suppressed'; END IF;
  IF outbound_candidate_known(c) THEN
    UPDATE outbound_candidates SET review_status='duplicate', rejection_reason='KNOWN_BUSINESS',
      research_requested_at=NULL, research_claimed_at=NULL WHERE id=p_id;
    RETURN 'duplicate';
  END IF;
  team := outbound_team_status(c.research_facts,c.website_url);
  IF team = 'out_of_range' OR outbound_excluded_business(c.business_name) THEN RETURN 'quality_blocked'; END IF;
  IF c.segment = 'unknown' THEN RETURN 'segment_required'; END IF;
  -- A person may approve an unverified team; automation needs the quoted 2-5. Solo needs only its segment.
  IF p_automatic AND c.segment = 'team' AND team <> 'verified' THEN RETURN 'quality_blocked'; END IF;
  IF c.segment = 'solo' THEN
    v_campaign := settings.solo_campaign_id;
  ELSE
    v_campaign := settings.campaign_id;
    -- A manual approval with no team campaign chosen falls back to the newest one that is not the solo campaign.
    IF v_campaign IS NULL AND NOT p_automatic THEN
      SELECT id INTO v_campaign FROM outbound_campaigns
        WHERE is_active AND locale = 'he' AND body_text LIKE '%{{personal_line}}%'
          AND id IS DISTINCT FROM settings.solo_campaign_id
        ORDER BY created_at DESC LIMIT 1;
    END IF;
  END IF;
  IF v_campaign IS NULL THEN RETURN 'no_campaign'; END IF;
  RETURN promote_outbound_candidate_quality_v2(p_id,p_actor,p_automatic,v_campaign);
END;
$$;

-- Automatic prospects of either segment send only while automation is on and their campaign is still the chosen one.
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
          OR EXISTS (SELECT 1 FROM outbound_discovery_settings s WHERE s.id = true AND s.auto_approve
            AND q.campaign_id IN (s.campaign_id, s.solo_campaign_id)))
      ORDER BY q.created_at LIMIT v_limit FOR UPDATE OF q SKIP LOCKED
    ) RETURNING p.*;
END;
$$;

-- Collection budget: 150 new candidates a day.
ALTER TABLE outbound_discovery_runs DROP CONSTRAINT IF EXISTS outbound_discovery_runs_requested_limit_check;
ALTER TABLE outbound_discovery_runs ADD CONSTRAINT outbound_discovery_runs_requested_limit_check
  CHECK (requested_limit BETWEEN 1 AND 150);
CREATE OR REPLACE FUNCTION reserve_outbound_candidates(p_places jsonb, p_queries jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_run uuid; v_place jsonb; v_id uuid; v_count integer; v_inserted integer := 0;
  v_day timestamptz := date_trunc('day', now() AT TIME ZONE 'Asia/Jerusalem') AT TIME ZONE 'Asia/Jerusalem';
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('outbound-discovery-budget'));
  SELECT count(*) INTO v_count FROM outbound_candidates WHERE created_at >= v_day;
  IF v_count >= 150 THEN RETURN jsonb_build_object('found', 0, 'ready', 0, 'skipped', 0, 'budget_left', 0); END IF;
  INSERT INTO outbound_discovery_runs(provider, queries, requested_limit)
    VALUES ('google_places', p_queries, 150 - v_count) RETURNING id INTO v_run;
  FOR v_place IN SELECT value FROM jsonb_array_elements(p_places) LIMIT 400 LOOP
    EXIT WHEN v_inserted >= 150 - v_count;
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
    'budget_left', 150 - v_count - v_inserted);
END;
$$;

-- Pin today's campaign as the team campaign, so a solo campaign created later can never be picked for a team by recency.
UPDATE outbound_discovery_settings SET campaign_id = (
  SELECT id FROM outbound_campaigns WHERE is_active AND locale = 'he' AND body_text LIKE '%{{personal_line}}%'
  ORDER BY created_at DESC LIMIT 1)
WHERE id = true AND campaign_id IS NULL;

-- Existing unpromoted candidates get a segment on their next research pass.
UPDATE outbound_candidates SET research_requested_at=now(), research_claimed_at=NULL, research_attempts=0
WHERE prospect_id IS NULL AND review_status='ready_for_review' AND research_requested_at IS NULL;

REVOKE ALL ON FUNCTION promote_outbound_candidate_quality_v2(uuid,uuid,boolean,uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
