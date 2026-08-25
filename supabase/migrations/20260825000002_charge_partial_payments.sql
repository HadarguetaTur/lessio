-- Migration: 20260825000002_charge_partial_payments.sql
-- Debt management, phase 3a: a charge can be paid in instalments.
--
-- charge_payments is the source of truth — one row per payment received, with
-- who recorded it, when, and how. charges.amount_paid is a denormalised running
-- total maintained in app code so that open debt stays a single-table sum
-- (`amount - amount_paid`) everywhere it is computed.
--
-- Deliberately no 'partially_paid' status: a part-paid charge is still open
-- debt, so leaving it 'pending'/'invoiced' keeps OPEN_CHARGE_STATUSES, the
-- payment webhook's idempotency filter and the reminder cron working unchanged.
-- The UI derives the "partially paid" label from amount_paid > 0.

ALTER TABLE charges
  ADD COLUMN IF NOT EXISTS amount_paid numeric(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN charges.amount_paid IS
  'Running total of charge_payments for this charge. status=''paid'' implies amount_paid = amount.';

-- Backfill: a charge already marked paid is fully covered.
UPDATE charges SET amount_paid = amount WHERE status = 'paid';

CREATE TABLE charge_payments (
  id                     uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  charge_id              uuid          NOT NULL REFERENCES charges(id) ON DELETE CASCADE,
  parent_id              uuid          REFERENCES parents(id) ON DELETE SET NULL,
  amount                 numeric(10,2) NOT NULL CHECK (amount > 0),
  method                 text          NOT NULL DEFAULT 'manual'
                           CHECK (method IN ('manual', 'cash', 'bank_transfer', 'provider', 'other')),
  paid_at                timestamptz   NOT NULL DEFAULT now(),
  -- NULL = recorded by the payment webhook rather than a person.
  recorded_by_profile_id uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  notes                  text,
  created_at             timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_charge_payments_org_charge  ON charge_payments (organization_id, charge_id);
CREATE INDEX idx_charge_payments_org_paid_at ON charge_payments (organization_id, paid_at);

-- No policies: reads and writes both go through the service-role client.
ALTER TABLE charge_payments ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE charge_payments IS
  'One row per payment received against a charge. Service-role access only.';
