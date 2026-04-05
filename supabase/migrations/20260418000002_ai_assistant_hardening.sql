-- Sprint 19 hardening: AI assistant production safeguards
-- 1. Align conversation log access with the owner-only dashboard UI.
-- 2. Track processed WhatsApp inbound messages to deduplicate webhook retries.

DROP POLICY IF EXISTS "conversation_log_select_org" ON conversation_log;

CREATE POLICY "conversation_log_select_owner" ON conversation_log
  FOR SELECT
  USING (
    organization_id = (
      SELECT organization_id FROM profiles
      WHERE id = auth.uid() AND role = 'owner' AND is_active = true
    )
  );

CREATE TABLE whatsapp_processed_messages (
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  message_id      text        NOT NULL,
  phone           text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, message_id)
);

CREATE INDEX idx_whatsapp_processed_messages_org_created
  ON whatsapp_processed_messages (organization_id, created_at DESC);

ALTER TABLE whatsapp_processed_messages ENABLE ROW LEVEL SECURITY;
