-- Migration: 20260325000002_whatsapp_embedded_signup.sql
-- Sprint 7: per-org WhatsApp credentials for Meta Embedded Signup.
-- Per /docs/sprint-7-scope.md § Story 1.
--
-- whatsapp_phone_number_id — Meta internal phone number ID, used to route
--   incoming webhook messages to the correct organization.
-- whatsapp_access_token    — encrypted Meta access token (AES-256-GCM at app
--   layer). Plaintext NEVER stored.
--
-- Existing whatsapp_number + whatsapp_token columns are kept for rollback
-- safety and are deprecated; they will be ignored after the routing cutover.

ALTER TABLE organizations
  ADD COLUMN whatsapp_phone_number_id text UNIQUE,
  ADD COLUMN whatsapp_access_token    text;

COMMENT ON COLUMN organizations.whatsapp_phone_number_id IS
  'Meta phone_number_id for this org — used to route incoming webhook messages. Set via Embedded Signup.';
COMMENT ON COLUMN organizations.whatsapp_access_token IS
  'AES-256-GCM encrypted Meta access token. Plaintext never stored. Set via Embedded Signup.';
