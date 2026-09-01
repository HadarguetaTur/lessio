-- Financial-integrity guardrails for organization billing modes.
-- A monthly organization accumulates source events and creates one approved
-- monthly ledger charge; a per-lesson organization creates lesson charges.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS billing_cycle_start_day integer NOT NULL DEFAULT 1
    CHECK (billing_cycle_start_day BETWEEN 1 AND 28),
  ADD COLUMN IF NOT EXISTS billing_due_days integer NOT NULL DEFAULT 7
    CHECK (billing_due_days BETWEEN 0 AND 90);

ALTER TABLE student_monthly_billing
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date;

-- Existing rows used calendar months. Preserve that exact historical meaning.
UPDATE student_monthly_billing
SET period_start = to_date(billing_month || '-01', 'YYYY-MM-DD'),
    period_end = (to_date(billing_month || '-01', 'YYYY-MM-DD') + INTERVAL '1 month - 1 day')::date
WHERE period_start IS NULL OR period_end IS NULL;

ALTER TABLE student_monthly_billing
  ALTER COLUMN period_start SET NOT NULL,
  ALTER COLUMN period_end SET NOT NULL,
  ADD CONSTRAINT student_monthly_billing_period_valid
    CHECK (period_end >= period_start);

CREATE INDEX IF NOT EXISTS idx_monthly_billing_org_period
  ON student_monthly_billing (organization_id, period_start, period_end);

COMMENT ON COLUMN organizations.billing_cycle_start_day IS
  'First local calendar day of a monthly billing cycle (1-28). Changes apply to newly generated periods only.';
COMMENT ON COLUMN organizations.billing_due_days IS
  'Number of days after period_end until an approved monthly charge is due.';
COMMENT ON COLUMN student_monthly_billing.period_start IS
  'Inclusive organization-local date captured when the billing draft is generated.';
COMMENT ON COLUMN student_monthly_billing.period_end IS
  'Inclusive organization-local date captured when the billing draft is generated.';
