-- Cold discovery is exclusively for verified 2-5 teacher businesses.
-- Deploy before application code. No emails are sent by this migration.
BEGIN;

CREATE FUNCTION outbound_identity_keys(p_email text, p_phone text, p_url text, p_place text DEFAULT NULL)
RETURNS text[] LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE keys text[] := '{}'; host text; phone text; email text := lower(btrim(p_email));
BEGIN
  IF coalesce(email, '') <> '' THEN keys := array_append(keys, 'email:' || md5(email)); END IF;
  phone := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  IF phone LIKE '00972%' THEN phone := substr(phone, 3); END IF;
  IF phone ~ '^0[0-9]{8,9}$' THEN phone := '972' || substr(phone, 2); END IF;
  IF length(phone) >= 9 THEN keys := array_append(keys, 'phone:' || md5(phone)); END IF;
  IF coalesce(p_place, '') <> '' THEN keys := array_append(keys, 'place:' || md5(p_place)); END IF;
  -- Shared hosting/social hosts are NOT business identities. Email still matches exactly.
  FOREACH host IN ARRAY ARRAY[
    lower(regexp_replace(split_part(regexp_replace(coalesce(p_url, ''), '^https?://', '', 'i'), '/', 1), '^www\.|:[0-9]+$', '', 'g')),
    split_part(email, '@', 2)
  ] LOOP
    IF host LIKE '%.%' AND host !~ '(^|\.)(gmail\.com|googlemail\.com|outlook\.com|hotmail\.com|yahoo\.[a-z.]+|walla\.(com|co\.il)|live\.com|icloud\.com|facebook\.com|instagram\.com|linkedin\.com|wixsite\.com|wordpress\.com|sites\.google\.com|d\.co\.il|b144\.co\.il|easy\.co\.il|limudnaim\.co\.il|lessoons\.co\.il)$'
    THEN keys := array_append(keys, 'host:' || md5(host)); END IF;
  END LOOP;
  RETURN ARRAY(SELECT DISTINCT k FROM unnest(keys) k);
END;
$$;

-- Minimal durable memory, including after candidate/prospect deletion.
CREATE TABLE outbound_business_history (
  identity_key text PRIMARY KEY,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE outbound_business_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON outbound_business_history FROM anon, authenticated;
GRANT ALL ON outbound_business_history TO service_role;

CREATE FUNCTION remember_outbound_business() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb; keys text[]; reason text;
BEGIN
  r := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  IF TG_TABLE_NAME = 'outbound_candidates' THEN
    IF TG_OP <> 'DELETE' AND r->>'review_status' NOT IN ('rejected','approved') THEN RETURN NEW; END IF;
    reason := CASE WHEN TG_OP = 'DELETE' THEN 'deleted' ELSE r->>'review_status' END;
    keys := outbound_identity_keys(r->>'email', r->>'phone', r->>'website_url', r->>'provider_place_id');
  ELSE
    reason := 'prospect';
    keys := outbound_identity_keys(r->>'email', r->>'phone', r->>'source_url', NULL);
  END IF;
  INSERT INTO outbound_business_history(identity_key, reason)
    SELECT k, reason FROM unnest(keys) k ON CONFLICT DO NOTHING;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
CREATE TRIGGER remember_outbound_candidate AFTER INSERT OR UPDATE OR DELETE ON outbound_candidates
  FOR EACH ROW EXECUTE FUNCTION remember_outbound_business();
CREATE TRIGGER remember_outbound_prospect AFTER INSERT OR UPDATE OR DELETE ON outbound_prospects
  FOR EACH ROW EXECUTE FUNCTION remember_outbound_business();
CREATE TRIGGER remember_outbound_suppression AFTER INSERT OR UPDATE ON outbound_suppressions
  FOR EACH ROW EXECUTE FUNCTION remember_outbound_business();

INSERT INTO outbound_business_history(identity_key, reason)
SELECT k, 'prospect' FROM outbound_prospects p,
  LATERAL unnest(outbound_identity_keys(p.email,p.phone,p.source_url,NULL)) k ON CONFLICT DO NOTHING;
INSERT INTO outbound_business_history(identity_key, reason)
SELECT k, 'reviewed' FROM outbound_candidates c,
  LATERAL unnest(outbound_identity_keys(c.email,c.phone,c.website_url,c.provider_place_id)) k
WHERE c.review_status IN ('rejected','approved') ON CONFLICT DO NOTHING;
INSERT INTO outbound_business_history(identity_key, reason)
SELECT k, 'suppressed' FROM outbound_suppressions s,
  LATERAL unnest(outbound_identity_keys(s.email,NULL,NULL,NULL)) k ON CONFLICT DO NOTHING;

CREATE FUNCTION outbound_candidate_known(c outbound_candidates) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM outbound_business_history h
    WHERE h.identity_key = ANY(outbound_identity_keys(c.email,c.phone,c.website_url,c.provider_place_id)))
    OR EXISTS (SELECT 1 FROM outbound_suppressions s WHERE s.email = c.email);
$$;

CREATE FUNCTION outbound_team_qualified(facts jsonb, website text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT count(DISTINCT n.teacher_count) = 1 AND min(n.teacher_count) BETWEEN 2 AND 5
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

-- Keep the existing grounded-opener, suppression, campaign and lease checks.
ALTER FUNCTION promote_outbound_candidate(uuid,uuid,boolean) RENAME TO promote_outbound_candidate_quality_v1;
REVOKE ALL ON FUNCTION promote_outbound_candidate_quality_v1(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION promote_outbound_candidate(p_id uuid, p_actor uuid DEFAULT NULL, p_automatic boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c outbound_candidates;
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
  IF NOT outbound_team_qualified(c.research_facts,c.website_url)
    OR concat_ws(' ',c.business_name,c.category) ~* 'אינדקס|מאגר מורים|בית[ -]?ספר|אוניברסיט|מכלל|רשת\s|קידום אתרים|יואל גבע|אנקורי|היי[ -]?קיו|college|university|school'
    THEN RETURN 'quality_blocked'; END IF;
  RETURN promote_outbound_candidate_quality_v1(p_id,p_actor,p_automatic);
END;
$$;

CREATE INDEX outbound_candidate_identity_idx ON outbound_candidates USING gin
  (outbound_identity_keys(email,phone,website_url,provider_place_id))
  WHERE review_status='ready_for_review' AND prospect_id IS NULL;

-- The proposals list is not a research queue or rejection archive. Filter before LIMIT.
CREATE FUNCTION list_eligible_outbound_candidates(p_limit integer DEFAULT 100)
RETURNS SETOF outbound_candidates LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.* FROM outbound_candidates c
  WHERE c.review_status='ready_for_review' AND c.prospect_id IS NULL
    AND c.research_requested_at IS NULL AND c.research_claimed_at IS NULL
    AND c.rejection_reason IS NULL AND c.quality_score >= 70
    AND c.email IS NOT NULL AND c.email_source_url IS NOT NULL
    AND c.opener_status='generated' AND c.personal_line IS NOT NULL
    AND outbound_team_qualified(c.research_facts,c.website_url)
    AND NOT outbound_candidate_known(c)
    AND concat_ws(' ',c.business_name,c.category) !~* 'אינדקס|מאגר מורים|בית[ -]?ספר|אוניברסיט|מכלל|רשת\s|קידום אתרים|יואל גבע|אנקורי|היי[ -]?קיו|college|university|school'
    -- Same business, two places: show only one qualified proposal.
    AND NOT EXISTS (SELECT 1 FROM outbound_candidates other
      WHERE other.review_status='ready_for_review' AND other.prospect_id IS NULL
        AND other.rejection_reason IS NULL AND other.quality_score >= 70
        AND other.research_requested_at IS NULL AND other.research_claimed_at IS NULL
        AND other.opener_status='generated' AND other.personal_line IS NOT NULL
        AND other.email IS NOT NULL AND other.email_source_url IS NOT NULL
        AND outbound_team_qualified(other.research_facts,other.website_url)
        AND (other.created_at,other.id) < (c.created_at,c.id)
        AND outbound_identity_keys(other.email,other.phone,other.website_url,other.provider_place_id)
          && outbound_identity_keys(c.email,c.phone,c.website_url,c.provider_place_id))
  ORDER BY c.created_at DESC,c.id LIMIT LEAST(GREATEST(p_limit,1),100);
$$;

CREATE FUNCTION guard_outbound_candidate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.prospect_id IS NOT NULL OR NEW.review_status IN ('approved','rejected','duplicate') THEN RETURN NEW; END IF;
  IF outbound_candidate_known(NEW) THEN
    -- Do not populate the research queue with a previously handled business.
    IF TG_OP='INSERT' THEN RETURN NULL; END IF;
    NEW.review_status := 'duplicate'; NEW.rejection_reason := 'KNOWN_BUSINESS';
    NEW.research_requested_at := NULL; NEW.research_claimed_at := NULL;
  ELSIF concat_ws(' ',NEW.business_name,NEW.category) ~* 'אינדקס|מאגר מורים|בית[ -]?ספר|אוניברסיט|מכלל|רשת\s|קידום אתרים|יואל גבע|אנקורי|היי[ -]?קיו|college|university|school' THEN
    IF TG_OP='INSERT' THEN RETURN NULL; END IF;
    NEW.review_status := 'rejected'; NEW.rejection_reason := 'EXCLUDED_BUSINESS';
    NEW.research_requested_at := NULL; NEW.research_claimed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_outbound_candidate BEFORE INSERT OR UPDATE ON outbound_candidates
  FOR EACH ROW EXECUTE FUNCTION guard_outbound_candidate();

-- Reassess existing unsent proposals. Preserve sent history and operator verdicts.
UPDATE outbound_candidates SET review_status='new', research_requested_at=now(),
  research_claimed_at=NULL,research_attempts=0,personal_line=NULL,opener_status='pending',
  opener_fact_ids='{}',rejection_reason=NULL
WHERE prospect_id IS NULL AND review_status IN ('new','ready_for_review');

REVOKE ALL ON FUNCTION outbound_identity_keys(text,text,text,text), remember_outbound_business(),
 outbound_candidate_known(outbound_candidates),outbound_team_qualified(jsonb,text),guard_outbound_candidate(),
 promote_outbound_candidate(uuid,uuid,boolean),list_eligible_outbound_candidates(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION promote_outbound_candidate(uuid,uuid,boolean),list_eligible_outbound_candidates(integer) TO service_role;
COMMIT;
