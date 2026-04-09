-- Monthly billing ledger unification.
-- Adds `monthly` as a first-class charge type and links ledger rows back to
-- student_monthly_billing for one-source-of-truth reporting.

alter table charges
  drop constraint if exists charges_charge_type_check;

alter table charges
  add constraint charges_charge_type_check
  check (charge_type in ('lesson', 'cancellation', 'manual', 'monthly'));

alter table charges
  add column if not exists billing_record_id uuid references student_monthly_billing(id) on delete set null,
  add column if not exists billing_month text;

create unique index if not exists charges_monthly_billing_record_unique
  on charges(billing_record_id)
  where billing_record_id is not null;

create index if not exists idx_charges_org_type_billing_month
  on charges(organization_id, charge_type, billing_month);
