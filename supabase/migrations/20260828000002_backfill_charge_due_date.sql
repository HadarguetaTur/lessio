-- Populate charges.due_date.
--
-- The column has existed since the first schema migration and has never been
-- written. src/lib/reports/debt.ts reads it for "oldest due date" and has
-- therefore always rendered a blank, and the parent portal had no way to tell
-- an overdue charge from a fresh one.
--
-- Charge creation now sets it. This backfills the rows written before that.
-- Safe to re-run: both statements only touch rows where due_date IS NULL.

-- Monthly bills fall due on the 10th of the month after the one they cover,
-- derived from billing_month so the value is stable across recalculations.
UPDATE charges
SET due_date = (
      to_date(billing_month || '-01', 'YYYY-MM-DD')
      + INTERVAL '1 month'
      + INTERVAL '9 days'
    )::date
WHERE due_date IS NULL
  AND charge_type = 'monthly'
  AND billing_month ~ '^\d{4}-\d{2}$';

-- Everything else — lesson, cancellation, manual — is net 14 from creation,
-- read in the organization's own timezone. Deliberately unfiltered by type so
-- it also sweeps up monthly rows whose billing_month is missing or malformed.
UPDATE charges c
SET due_date = (
      (c.created_at AT TIME ZONE COALESCE(o.timezone, 'Asia/Jerusalem'))::date
      + INTERVAL '14 days'
    )::date
FROM organizations o
WHERE o.id = c.organization_id
  AND c.due_date IS NULL;

-- Serves the portal's "what is overdue" read and the debtors report.
CREATE INDEX IF NOT EXISTS idx_charges_org_status_due
  ON charges (organization_id, status, due_date)
  WHERE status IN ('pending', 'invoiced');
