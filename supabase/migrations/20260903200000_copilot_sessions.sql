-- ── Owner-copilot action sessions ────────────────────────────────────────────
-- The staff copilot's confirm buttons used to carry the whole action in the
-- reply id (cp:confirm:<action>:<parentId>). That shape cannot grow: params for
-- richer actions (availability, lessons) do not fit a button id, and a stale
-- button could replay old params. From this migration the proposal lives here
-- and the button carries only a session id.
--
-- Unlike support_sessions, rows are NOT deleted when the flow ends — a session
-- that reached 'executed' is the audit trail of "the AI proposed X, this staff
-- member confirmed at T, and this is what happened". Only the partial unique
-- index below enforces one *live* proposal per phone; finished rows pile up
-- underneath it.

CREATE TABLE copilot_sessions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  phone            text        NOT NULL,
  actor_profile_id uuid        NOT NULL,
  action           text        NOT NULL,
  params           jsonb       NOT NULL DEFAULT '{}',
  status           text        NOT NULL DEFAULT 'awaiting_confirm'
                               CHECK (status IN ('collecting', 'awaiting_confirm', 'executed', 'cancelled', 'expired')),
  locale           text        NOT NULL DEFAULT 'he',
  result           jsonb,
  expires_at       timestamptz NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  executed_at      timestamptz
);

-- One in-flight proposal per phone per org. A new proposal supersedes the old
-- one (status -> 'cancelled') rather than racing it.
CREATE UNIQUE INDEX copilot_sessions_one_live_per_phone
  ON copilot_sessions (organization_id, phone)
  WHERE status IN ('collecting', 'awaiting_confirm');

-- The audit/history read path: "what did the copilot do for this org lately".
CREATE INDEX idx_copilot_sessions_org_created
  ON copilot_sessions (organization_id, created_at DESC);

ALTER TABLE copilot_sessions ENABLE ROW LEVEL SECURITY;

-- Webhook-only, via service role — same posture as support_sessions.
CREATE POLICY "deny_all_copilot_sessions"
  ON copilot_sessions AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

COMMENT ON TABLE copilot_sessions IS
  'Staff-copilot action proposals and their audit trail; webhook-only via service role. Live rows expire at read time, finished rows are retained.';

-- The staff copilot gets its own daily call cap, counted per actor phone. The
-- parent assistant already caps at 3 replies/24h; without a source column the
-- two are indistinguishable in ai_usage_log.
ALTER TABLE ai_usage_log
  ADD COLUMN source      text,
  ADD COLUMN actor_phone text;

CREATE INDEX idx_ai_usage_log_org_source_phone
  ON ai_usage_log (organization_id, source, actor_phone, created_at)
  WHERE source IS NOT NULL;
