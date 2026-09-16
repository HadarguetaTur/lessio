-- Research must be explainable in the approval screen. Keep the data attached
-- to the candidate, while full page excerpts remain in candidate_evidence.

ALTER TABLE outbound_candidates
  ADD COLUMN email_source_url text,
  ADD COLUMN research_facts jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN quality_score smallint NOT NULL DEFAULT 0 CHECK (quality_score BETWEEN 0 AND 100),
  ADD COLUMN quality_reasons jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN opener_error text;

CREATE INDEX outbound_candidates_quality_review_idx
  ON outbound_candidates (review_status, quality_score DESC, created_at DESC);

COMMENT ON COLUMN outbound_candidates.research_facts IS
  'Short, source-backed facts used for the human review and AI opener.';
