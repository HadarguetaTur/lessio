-- Add the business portfolio ID column to organizations.
-- Embedded Signup v4 returns business_id alongside waba_id and phone_number_id
-- in the FINISH session-info event. Nullable: a connection must not fail over it.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS whatsapp_business_id text;
