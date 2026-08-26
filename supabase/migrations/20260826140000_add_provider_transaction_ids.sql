-- ── Linking a provider's invoice back to its charge ──────────────────────────
-- Grow issues the invoice itself and announces it on a separate webhook that
-- carries only { transactionCode, invoiceNumber, invoiceUrl }. It does NOT
-- carry processToken, which is what charges.payment_reference holds, so the
-- invoice cannot be matched on that.
--
-- The payment webhook that arrives first does carry several identifiers
-- (transactionId, transactionToken, asmachta). We keep all of them, because
-- Grow's docs never say which one becomes transactionCode, and matching the
-- invoice against the set is robust to that ambiguity.

ALTER TABLE charges
  ADD COLUMN IF NOT EXISTS provider_transaction_ids text[];

COMMENT ON COLUMN charges.provider_transaction_ids IS
  'Every identifier the payment provider gave us for the transaction that paid
   this charge. Used to match asynchronous provider events — notably Grow''s
   invoice webhook — back to the charge.';

CREATE INDEX IF NOT EXISTS charges_provider_transaction_ids_idx
  ON charges USING gin (provider_transaction_ids);
