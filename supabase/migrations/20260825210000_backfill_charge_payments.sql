-- Migration: 20260825210000_backfill_charge_payments.sql
--
-- 20260825000002_charge_partial_payments.sql introduced charge_payments as the
-- source of truth for money received, and backfilled charges.amount_paid — but
-- not the ledger itself. Revenue reporting reads only the ledger
-- (src/lib/dashboard/stats.ts, src/lib/reports/revenue.ts,
-- src/lib/reports/forecast.ts), so every payment taken before that migration
-- became invisible: an org with 152 charges marked paid still saw
-- "Collected this month ₪0", an empty 12-month revenue chart and ₪0 actual in
-- the forecast.
--
-- A charge with status='paid' is fully covered, so it gets one ledger row for
-- its full amount, dated when it was actually paid. method='manual' and
-- recorded_by_profile_id=NULL say the same thing the data does: we know the
-- money arrived, not who keyed it in.
--
-- Idempotent: charges that already have a payment row are skipped, so a re-run
-- (or a re-run against an environment that was fixed by hand) is a no-op.

INSERT INTO charge_payments (
  organization_id,
  charge_id,
  parent_id,
  amount,
  method,
  paid_at,
  recorded_by_profile_id,
  notes
)
SELECT
  c.organization_id,
  c.id,
  c.parent_id,
  c.amount,
  'manual',
  COALESCE(c.paid_at, c.updated_at, c.created_at),
  NULL,
  NULL
FROM charges c
WHERE c.status = 'paid'
  AND c.amount > 0
  AND NOT EXISTS (
    SELECT 1 FROM charge_payments p WHERE p.charge_id = c.id
  );
