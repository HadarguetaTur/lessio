-- Provider callbacks may be retried or delivered concurrently. This key makes
-- the ledger insertion idempotent independently of the denormalised charge
-- status, and lets a retry finish closing a charge after an interrupted run.
ALTER TABLE charge_payments
  ADD COLUMN provider_reference text;

CREATE UNIQUE INDEX charge_payments_provider_reference_unique
  ON charge_payments (charge_id, provider_reference);

COMMENT ON COLUMN charge_payments.provider_reference IS
  'Provider checkout/transaction reference; unique per charge for webhook idempotency.';
