-- Exclude by business name only. Google files private tutors and learning
-- centres under "בית ספר" / school, so matching its category ruled out the
-- target audience at insert time. Keep in sync with EXCLUDED_BUSINESS_NAME
-- in src/lib/outbound/discoveryResearch.ts.
BEGIN;

CREATE FUNCTION outbound_excluded_business(p_name text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(p_name, '') ~* 'אינדקס|מאגר מורים|בית[ -]?ה?ספר|ביה"ס|אוניברסיט|מכלל|רשת\s|קידום אתרים|יואל גבע|אנקורי|היי[ -]?קיו|נהיגה|פסנתר|גיטרה|תופים|פיתוח קול|מוזיקה|ריקוד|מחול|יוגה|פילאטיס|כושר|איפור|ברלינגטון|וול סטריט|הלן דורון|ברליץ|wall street|berlitz|college|university|academy|school';
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
  IF team = 'out_of_range' OR (p_automatic AND team <> 'verified') OR outbound_excluded_business(c.business_name)
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
    AND NOT outbound_excluded_business(c.business_name)
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

CREATE OR REPLACE FUNCTION guard_outbound_candidate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.prospect_id IS NOT NULL OR NEW.review_status IN ('approved','rejected','duplicate') THEN RETURN NEW; END IF;
  IF outbound_candidate_known(NEW) THEN
    -- Do not populate the research queue with a previously handled business.
    IF TG_OP='INSERT' THEN RETURN NULL; END IF;
    NEW.review_status := 'duplicate'; NEW.rejection_reason := 'KNOWN_BUSINESS';
    NEW.research_requested_at := NULL; NEW.research_claimed_at := NULL;
  ELSIF outbound_excluded_business(NEW.business_name) THEN
    IF TG_OP='INSERT' THEN RETURN NULL; END IF;
    NEW.review_status := 'rejected'; NEW.rejection_reason := 'EXCLUDED_BUSINESS';
    NEW.research_requested_at := NULL; NEW.research_claimed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- Give back what the category rule (or a social-only website) ruled out by mistake.
-- Their memory keys go first, unless another reviewed candidate or a prospect shares them.
WITH revived AS (
  SELECT c.id, outbound_identity_keys(c.email,c.phone,c.website_url,c.provider_place_id) AS keys
  FROM outbound_candidates c
  WHERE c.prospect_id IS NULL AND c.review_status='rejected'
    AND c.rejection_reason='EXCLUDED_BUSINESS' AND NOT outbound_excluded_business(c.business_name)
)
DELETE FROM outbound_business_history h
USING revived r
WHERE h.identity_key = ANY(r.keys) AND h.reason IN ('rejected','reviewed')
  AND NOT EXISTS (SELECT 1 FROM outbound_candidates o
    WHERE o.id NOT IN (SELECT id FROM revived) AND o.review_status IN ('rejected','approved')
      AND h.identity_key = ANY(outbound_identity_keys(o.email,o.phone,o.website_url,o.provider_place_id)));

UPDATE outbound_candidates SET review_status='new', rejection_reason=NULL,
  research_requested_at=now(), research_claimed_at=NULL, research_attempts=0
WHERE prospect_id IS NULL AND review_status='rejected'
  AND rejection_reason='EXCLUDED_BUSINESS' AND NOT outbound_excluded_business(business_name);

REVOKE ALL ON FUNCTION outbound_excluded_business(text) FROM PUBLIC,anon,authenticated;
COMMIT;
