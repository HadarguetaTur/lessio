-- Sprint 8: Real Payments (Multi-Provider)
-- Per /docs/sprint-8-scope.md § Story 1

-- ── organizations: payment provider config ────────────────────────────────────

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS payment_provider text
    CHECK (payment_provider IN ('cardcom'))
    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS payment_config_encrypted text
    DEFAULT NULL;

COMMENT ON COLUMN organizations.payment_provider IS
  'Active payment provider for this org. NULL = not connected. Currently supports: cardcom.';

COMMENT ON COLUMN organizations.payment_config_encrypted IS
  'AES-256-GCM encrypted JSON blob with provider-specific credentials (terminal, apiName, apiPassword for Cardcom). Plaintext is never stored.';

-- ── charges: payment tracking columns ─────────────────────────────────────────

ALTER TABLE charges
  ADD COLUMN IF NOT EXISTS payment_link text
    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS payment_reference text
    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS payment_provider text
    DEFAULT NULL;

COMMENT ON COLUMN charges.payment_link IS
  'Payment URL sent to parent via WhatsApp. Set when sendPaymentRequest generates a real provider link.';

COMMENT ON COLUMN charges.payment_reference IS
  'Provider transaction ID (lowProfileCode for Cardcom). Arrives via webhook after payment. Used to match incoming webhooks to charges.';

COMMENT ON COLUMN charges.payment_provider IS
  'Snapshot of which provider processed this charge (e.g. cardcom). Set alongside payment_link.';

-- Index for webhook lookup by payment_reference (org-scoped)
CREATE INDEX IF NOT EXISTS idx_charges_payment_reference
  ON charges (organization_id, payment_reference)
  WHERE payment_reference IS NOT NULL;
