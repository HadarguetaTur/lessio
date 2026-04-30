-- ── Sprint 16: Multi-Provider Receipts ───────────────────────────────────────
-- Adds a plaintext receipt_provider column so the factory can dispatch to the
-- correct adapter without decrypting receipt_config_encrypted.
-- Backward compat: existing rows with receipt_config_encrypted set and
-- receipt_provider = NULL are treated as 'green-invoice' by the factory.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS receipt_provider text;

COMMENT ON COLUMN organizations.receipt_provider IS
  'Receipt provider type stored in plaintext for factory dispatch.
   Supported values: green-invoice | icount | sumit
   NULL on pre-migration rows → factory defaults to green-invoice.';
