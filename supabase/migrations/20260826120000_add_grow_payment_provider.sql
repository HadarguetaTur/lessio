-- ── Grow (formerly Meshulam) payment provider ────────────────────────────────
-- Widens the payment_provider CHECK to accept 'grow'.
--
-- Also repairs a pre-existing gap: the Stripe adapter shipped without a
-- migration, so 'stripe' was never added to the constraint and saving a Stripe
-- configuration failed against any database built from these migrations.

ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_payment_provider_check;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_payment_provider_check
  CHECK (payment_provider IN ('cardcom', 'payplus', 'bit', 'paybox', 'stripe', 'grow'));
