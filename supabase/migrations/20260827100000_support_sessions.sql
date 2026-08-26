-- ── WhatsApp support-request sessions ────────────────────────────────────────
-- An owner or admin taps "support" in their bot menu, types what is wrong, and
-- confirms. That is three turns, so unlike cancellation_sessions — where the
-- presence of the row IS the state, because the flow is exactly two turns —
-- this one carries an explicit step.
--
-- Same shape otherwise, deliberately: one open session per (org, phone), expiry
-- checked at read time with no cleanup cron, and the row deleted by any
-- higher-priority event (a menu tap, a completed submission, a cancel).
--
-- draft_text holds what they typed while we ask "send this?". It is not a
-- ticket yet: a support request that nobody confirmed is a half-typed thought,
-- and filing it would train people that the bot files things they did not send.

CREATE TABLE support_sessions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  phone           text        NOT NULL,
  step            text        NOT NULL DEFAULT 'awaiting_description'
                              CHECK (step IN ('awaiting_description', 'awaiting_confirm')),
  draft_text      text,
  expires_at      timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- The upsert target. One in-flight support request per phone per org: a
  -- second "support" tap replaces the first rather than racing it.
  CONSTRAINT support_sessions_org_phone_unique UNIQUE (organization_id, phone)
);

ALTER TABLE support_sessions ENABLE ROW LEVEL SECURITY;

-- Webhook-only, via service role — same posture as cancellation_sessions.
CREATE POLICY "deny_all_support_sessions"
  ON support_sessions AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

COMMENT ON TABLE support_sessions IS
  'In-flight WhatsApp support requests from org staff; webhook-only via service role. Expiry is read-time, no cleanup cron.';
