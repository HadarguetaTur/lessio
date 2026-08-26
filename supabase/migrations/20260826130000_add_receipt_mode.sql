-- ── Who issues the invoices? ─────────────────────────────────────────────────
-- Until now the only signal was "receipt_config_encrypted is set or it isn't",
-- which cannot tell an org that has not answered yet from one that deliberately
-- issues invoices elsewhere. A teacher whose payment provider (Grow, Cardcom)
-- already issues invoices would connect a second service here in good faith and
-- get two documents for the same payment — a real tax problem.
--
--   external          — an invoicing service configured in Lessio issues them
--   payment_provider  — the payment provider issues them at charge time
--   none              — the org does not issue invoices through Lessio
--   NULL              — not answered yet; the settings screen asks

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS receipt_mode text;

ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_receipt_mode_check;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_receipt_mode_check
  CHECK (receipt_mode IS NULL OR receipt_mode IN ('external', 'payment_provider', 'none'));

COMMENT ON COLUMN organizations.receipt_mode IS
  'Who issues invoices: external (a service configured here) | payment_provider
   (the payment provider issues them) | none. NULL = the owner has not chosen yet.
   Only ''external'' lets Lessio issue a document itself.';

-- Anyone who already connected an invoicing service has effectively answered.
UPDATE organizations
   SET receipt_mode = 'external'
 WHERE receipt_config_encrypted IS NOT NULL
   AND receipt_mode IS NULL;
