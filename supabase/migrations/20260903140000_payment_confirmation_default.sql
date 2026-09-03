-- Org-level default for the "send the parent a WhatsApp confirmation" checkbox
-- in the mark-as-paid dialogs. Defaults to true so existing orgs keep today's
-- behaviour, where the box is hard-coded pre-checked.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS payment_confirmation_default_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN organizations.payment_confirmation_default_enabled IS
  'Whether the "send the parent a WhatsApp confirmation" box is pre-checked in the mark-as-paid dialogs. A per-payment default only — staff can always flip it.';
