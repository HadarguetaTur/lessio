-- Reviewable discovery sits before outbound_prospects. A candidate is never
-- eligible for the sender; only an explicit approval creates a prospect.

CREATE TABLE outbound_discovery_runs (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider       text        NOT NULL CHECK (provider IN ('google_places')),
  queries        jsonb       NOT NULL DEFAULT '[]',
  requested_limit integer     NOT NULL CHECK (requested_limit BETWEEN 1 AND 50),
  found_count    integer     NOT NULL DEFAULT 0,
  researched_count integer   NOT NULL DEFAULT 0,
  ready_count    integer     NOT NULL DEFAULT 0,
  error          text,
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz
);

ALTER TABLE outbound_discovery_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_outbound_discovery_runs"
  ON outbound_discovery_runs AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

CREATE TABLE outbound_candidates (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  discovery_run_id  uuid        REFERENCES outbound_discovery_runs(id) ON DELETE SET NULL,
  provider          text        NOT NULL DEFAULT 'google_places' CHECK (provider IN ('google_places', 'manual')),
  provider_place_id text,
  business_name     text        NOT NULL,
  email             text        CHECK (email IS NULL OR email = lower(btrim(email))),
  phone             text,
  address           text,
  website_url       text,
  source_url        text,
  category          text,
  locale            text        NOT NULL DEFAULT 'he' CHECK (locale IN ('he', 'en')),
  personal_line     text,
  opener_status     text        NOT NULL DEFAULT 'pending' CHECK (opener_status IN ('pending', 'generated', 'approved', 'failed', 'skipped')),
  research_status   text        NOT NULL DEFAULT 'new' CHECK (research_status IN ('new', 'researched', 'no_contact', 'failed')),
  review_status     text        NOT NULL DEFAULT 'new' CHECK (review_status IN ('new', 'ready_for_review', 'approved', 'rejected', 'duplicate')),
  rejection_reason  text,
  prospect_id       uuid        REFERENCES outbound_prospects(id) ON DELETE SET NULL,
  metadata          jsonb       NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  reviewed_at       timestamptz,
  reviewed_by       uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE (provider, provider_place_id)
);

CREATE UNIQUE INDEX outbound_candidates_email_idx
  ON outbound_candidates (email) WHERE email IS NOT NULL;
CREATE INDEX outbound_candidates_review_created_idx
  ON outbound_candidates (review_status, created_at DESC);
CREATE INDEX outbound_candidates_run_idx ON outbound_candidates (discovery_run_id);

CREATE TRIGGER set_outbound_candidates_updated_at
  BEFORE UPDATE ON outbound_candidates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE outbound_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_outbound_candidates"
  ON outbound_candidates AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

CREATE TABLE outbound_candidate_evidence (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id  uuid        NOT NULL REFERENCES outbound_candidates(id) ON DELETE CASCADE,
  source_url    text        NOT NULL,
  kind          text        NOT NULL CHECK (kind IN ('place', 'website', 'contact_page')),
  excerpt       text        NOT NULL CHECK (char_length(excerpt) <= 3000),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX outbound_candidate_evidence_candidate_idx
  ON outbound_candidate_evidence (candidate_id, created_at);

ALTER TABLE outbound_candidate_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_outbound_candidate_evidence"
  ON outbound_candidate_evidence AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

COMMENT ON TABLE outbound_candidates IS
  'Public-business discovery candidates. They cannot be sent until an operator approves them into outbound_prospects.';
