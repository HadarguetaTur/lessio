-- ── 'manual_link' payment provider ───────────────────────────────────────────
-- A fixed payment link for orgs with no processor: the owner stores one static
-- URL (personal Bit page, PayBox link, hosted payment page) and it is sent
-- as-is in every payment request. No webhook exists, so charges close through
-- the manual mark-as-paid paths or POST /api/v1/charges/{id}/payments.
-- Adding the slug to the CHECK is not optional: without it savePaymentProvider
-- fails on write (see the note in 20260826120000_add_grow_payment_provider.sql
-- about Stripe).

ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_payment_provider_check;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_payment_provider_check
  CHECK (payment_provider IN ('cardcom', 'payplus', 'bit', 'paybox', 'stripe', 'grow', 'make', 'manual_link'));
