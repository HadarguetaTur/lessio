-- Outbound engine: direct Gmail transport (decision #40).
--
-- The engine sends and reads replies itself, through a Google service
-- account with domain-wide delegation over the Workspace's outreach
-- mailboxes. No Make.com layer. Several mailboxes share the load, each with
-- a daily cap, so one address never looks like a bulk sender.

-- ── Mailbox pool ────────────────────────────────────────────────────────────

CREATE TABLE outbound_mailboxes (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- A Workspace user the service account may impersonate.
  email          text        NOT NULL UNIQUE,
  display_name   text,
  is_active      boolean     NOT NULL DEFAULT true,
  -- Cold emails per Asia/Jerusalem day. 30 is a conservative warm mailbox.
  daily_cap      integer     NOT NULL DEFAULT 30 CHECK (daily_cap BETWEEN 0 AND 500),
  -- Reserved for a future history-based poll; v1 polls the inbox by time.
  last_history_id text,
  last_polled_at timestamptz,
  last_error     text,
  last_error_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_outbound_mailboxes_updated_at
  BEFORE UPDATE ON outbound_mailboxes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE outbound_mailboxes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_outbound_mailboxes"
  ON outbound_mailboxes AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

COMMENT ON TABLE outbound_mailboxes IS
  'Workspace mailboxes the outbound engine sends cold emails from, via service-account delegation. Rotated by daily cap. Service role only.';

-- ── Transport values: make → gmail ──────────────────────────────────────────
-- The engine never went live on Make in production; any local rows are
-- rewritten so the tighter constraint holds.

UPDATE outbound_messages SET transport = 'gmail' WHERE transport = 'make';

ALTER TABLE outbound_messages
  DROP CONSTRAINT IF EXISTS outbound_messages_transport_check;
ALTER TABLE outbound_messages
  ADD CONSTRAINT outbound_messages_transport_check CHECK (transport IN ('gmail', 'resend'));

-- Which mailbox carried a message (out) or received it (in).
ALTER TABLE outbound_messages
  ADD COLUMN mailbox_id uuid REFERENCES outbound_mailboxes(id) ON DELETE SET NULL;
CREATE INDEX outbound_messages_mailbox_day_idx
  ON outbound_messages (mailbox_id, created_at DESC)
  WHERE direction = 'out' AND transport = 'gmail' AND error IS NULL;

-- The mailbox that sent to this prospect: its inbox is where the reply lands.
ALTER TABLE outbound_prospects
  ADD COLUMN mailbox_id uuid REFERENCES outbound_mailboxes(id) ON DELETE SET NULL;

COMMENT ON COLUMN outbound_messages.transport IS
  'gmail = sent/received by the engine through a delegated Workspace mailbox; resend = platform demo email.';
