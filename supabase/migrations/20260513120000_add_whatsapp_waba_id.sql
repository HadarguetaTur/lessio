-- Add WABA ID column to organizations.
-- The WhatsApp Business Account ID is returned by Meta Embedded Signup
-- and is needed to register message templates via the Meta Graph API.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS whatsapp_waba_id text;
