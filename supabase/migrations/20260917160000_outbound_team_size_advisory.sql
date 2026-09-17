-- Team size becomes advisory for a person, strict for automation.
-- Almost no tutoring site states "צוות של X מורים", so requiring the quote hid
-- every proposal. A proven out-of-range team (1 or 6+) still never reaches the
-- list; an unknown or conflicting size is shown for a manual decision, and
-- automatic promotion keeps requiring a verified 2-5 team.
BEGIN;

-- 'verified' | 'unknown' | 'conflict' | 'out_of_range'. Same evidence rules as
-- outbound_team_qualified and teamSizeStatus() in discoveryResearch.ts.
CREATE FUNCTION outbound_team_status(facts jsonb, website text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN count(DISTINCT n.teacher_count) = 0 THEN 'unknown'
    WHEN count(DISTINCT n.teacher_count) > 1 THEN 'conflict'
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

CREATE OR REPLACE FUNCTION promote_outbound_candidate(p_id uuid, p_actor uuid DEFAULT NULL, p_automatic boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c outbound_candidates; team text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('outbound-business-promotion'));
  SELECT * INTO c FROM outbound_candidates WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR c.review_status <> 'ready_for_review' OR c.prospect_id IS NOT NULL THEN RETURN 'not_ready'; END IF;
  IF EXISTS (SELECT 1 FROM outbound_suppressions WHERE email=c.email) THEN RETURN 'suppressed'; END IF;
  IF outbound_candidate_known(c) THEN
    UPDATE outbound_candidates SET review_status='duplicate', rejection_reason='KNOWN_BUSINESS',
      research_requested_at=NULL, research_claimed_at=NULL WHERE id=p_id;
    RETURN 'duplicate';
  END IF;
  team := outbound_team_status(c.research_facts,c.website_url);
  -- A person may approve an unverified size; automation may not.
  IF team = 'out_of_range' OR (p_automatic AND team <> 'verified')
    OR concat_ws(' ',c.business_name,c.category) ~* 'אינדקס|מאגר מורים|בית[ -]?ספר|אוניברסיט|מכלל|רשת\s|קידום אתרים|יואל גבע|אנקורי|היי[ -]?קיו|college|university|school'
    THEN RETURN 'quality_blocked'; END IF;
  RETURN promote_outbound_candidate_quality_v1(p_id,p_actor,p_automatic);
END;
$$;

CREATE OR REPLACE FUNCTION list_eligible_outbound_candidates(p_limit integer DEFAULT 100)
RETURNS SETOF outbound_candidates LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.* FROM outbound_candidates c
  WHERE c.review_status='ready_for_review' AND c.prospect_id IS NULL
    AND c.research_requested_at IS NULL AND c.research_claimed_at IS NULL
    AND c.rejection_reason IS NULL AND c.quality_score >= 70
    AND c.email IS NOT NULL AND c.email_source_url IS NOT NULL
    AND c.opener_status='generated' AND c.personal_line IS NOT NULL
    AND outbound_team_status(c.research_facts,c.website_url) <> 'out_of_range'
    AND NOT outbound_candidate_known(c)
    AND concat_ws(' ',c.business_name,c.category) !~* 'אינדקס|מאגר מורים|בית[ -]?ספר|אוניברסיט|מכלל|רשת\s|קידום אתרים|יואל גבע|אנקורי|היי[ -]?קיו|college|university|school'
    -- Same business, two places: show only one qualified proposal.
    AND NOT EXISTS (SELECT 1 FROM outbound_candidates other
      WHERE other.review_status='ready_for_review' AND other.prospect_id IS NULL
        AND other.rejection_reason IS NULL AND other.quality_score >= 70
        AND other.research_requested_at IS NULL AND other.research_claimed_at IS NULL
        AND other.opener_status='generated' AND other.personal_line IS NOT NULL
        AND other.email IS NOT NULL AND other.email_source_url IS NOT NULL
        AND outbound_team_status(other.research_facts,other.website_url) <> 'out_of_range'
        AND (other.created_at,other.id) < (c.created_at,c.id)
        AND outbound_identity_keys(other.email,other.phone,other.website_url,other.provider_place_id)
          && outbound_identity_keys(c.email,c.phone,c.website_url,c.provider_place_id))
  ORDER BY c.created_at DESC,c.id LIMIT LEAST(GREATEST(p_limit,1),100);
$$;

-- Candidates held only for a missing team-size quote get an opener and a place in the list.
UPDATE outbound_candidates SET research_requested_at=now(), research_claimed_at=NULL,
  research_attempts=0, rejection_reason=NULL
WHERE prospect_id IS NULL AND review_status='new'
  AND rejection_reason IN ('TEAM_SIZE_UNKNOWN','TEAM_SIZE_CONFLICT');

REVOKE ALL ON FUNCTION outbound_team_status(jsonb,text) FROM PUBLIC,anon,authenticated;
COMMIT;
