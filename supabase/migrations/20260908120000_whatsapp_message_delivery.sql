-- ── WhatsApp delivery status ──────────────────────────────────────────────────
--
-- Until now an outbound row was born 'sent' and stayed 'sent' forever: the
-- webhook ignored Meta's `statuses` events, so a reply Meta accepted (a wamid
-- came back) and then failed to deliver — undeliverable recipient, template
-- paused, per-user limits — was indistinguishable from one that was read.
-- Diagnosing "I never got the reply" meant guessing.
--
-- The webhook now applies delivered / read / failed to the matching row by
-- wa_message_id, keeping Meta's error on a failure.

ALTER TABLE whatsapp_messages
  DROP CONSTRAINT IF EXISTS whatsapp_messages_status_check;

ALTER TABLE whatsapp_messages
  ADD CONSTRAINT whatsapp_messages_status_check
  CHECK (status IN ('received', 'sent', 'delivered', 'read', 'failed'));

ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS error_code        integer,
  ADD COLUMN IF NOT EXISTS error_message     text,
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz;

COMMENT ON COLUMN whatsapp_messages.status IS
  'Inbound: received. Outbound: sent (Meta accepted) → delivered → read, or failed. Updated from the statuses webhook; never moves backwards.';
COMMENT ON COLUMN whatsapp_messages.error_code IS
  'Meta error code from a failed status callback (e.g. 131026 undeliverable, 131047 re-engagement, 132001 template missing).';

-- The status callback carries only Meta's message id.
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_wa_message_id
  ON whatsapp_messages (wa_message_id)
  WHERE wa_message_id IS NOT NULL;
