-- A receipt that fails to issue after a successful payment currently exists
-- only as a line in a serverless log: the claim on the charge is released, the
-- money is recorded, and nothing anywhere says the parent never got their tax
-- document. These three columns make that state queryable — "paid charges with
-- no receipt and a recorded failure" is a question someone can now ask.

ALTER TABLE charges
  ADD COLUMN IF NOT EXISTS receipt_error     text,
  ADD COLUMN IF NOT EXISTS receipt_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_attempts  integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN charges.receipt_error IS
  'Last receipt-issuance failure for this charge. NULL once a document is issued.';
COMMENT ON COLUMN charges.receipt_attempts IS
  'How many times receipt issuance has been attempted and failed for this charge.';

-- The set worth looking at: money collected, no document, and we know why.
CREATE INDEX IF NOT EXISTS charges_receipt_failed_idx
  ON charges (organization_id, receipt_failed_at DESC)
  WHERE receipt_failed_at IS NOT NULL AND receipt_url IS NULL;
