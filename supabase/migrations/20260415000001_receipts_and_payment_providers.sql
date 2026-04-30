-- ── Sprint 15: Tax Receipts + Bit/PayBox ─────────────────────────────────────
-- Adds receipt tracking to charges, receipt provider config to organizations,
-- and widens the payment_provider CHECK to include Bit and PayBox.

-- ── Receipt columns on charges ────────────────────────────────────────────────
ALTER TABLE charges
  ADD COLUMN IF NOT EXISTS receipt_url        text,
  ADD COLUMN IF NOT EXISTS receipt_issued_at  timestamptz;

-- ── Receipt provider config on organizations ──────────────────────────────────
-- Encrypted JSON: { "id": "...", "secret": "..." } for Green Invoice.
-- Uses PAYMENT_CONFIG_ENCRYPTION_KEY (no new env var required).
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS receipt_config_encrypted text;

COMMENT ON COLUMN organizations.receipt_config_encrypted IS
  'AES-256-GCM encrypted JSON: { id, secret } for Green Invoice (חשבוניות ירוקות).
   Uses the same PAYMENT_CONFIG_ENCRYPTION_KEY as payment_config_encrypted.';

-- ── Widen payment_provider CHECK to include Bit and PayBox ───────────────────
ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_payment_provider_check;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_payment_provider_check
  CHECK (payment_provider IN ('cardcom', 'payplus', 'bit', 'paybox'));
