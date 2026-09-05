-- Cleanup for decision #37 — Lessio does not issue tax documents itself.
--
-- The Sprint-27 internal PDF invoice/credit-note generator was removed from
-- the code (deployed 2026-09-05, commit e3b3016 and after). This migration
-- drops the schema that only that generator ever wrote. Every one of these was
-- verified empty in production before the removal: zero invoices were ever
-- issued (the generator had failed silently since it shipped), invoice_counters
-- had zero rows, and all nine columns were NULL on every row.
--
-- DEPLOY ORDER: this must run only AFTER the code removal is live. The
-- pre-removal code joined student_monthly_billing(invoice_number) on /charges
-- and would break on a missing column. That code stopped being production on
-- 2026-09-05.
--
-- KEEP (receipt-provider / SaaS schema, unrelated to the internal generator):
-- charges.document_type, charges.receipt_url, charges.receipt_issued_at,
-- organizations.receipt_document_type, organizations.default_vat_rate,
-- parents.tax_id, saas_plans.*_quota, and the whole saas_invoices table.
--
-- The empty `invoices` storage bucket is deliberately NOT dropped here:
-- storage rows are trigger-protected against SQL deletes (protect_delete), and
-- an empty private bucket is harmless. Remove it from the dashboard if desired.

DROP TABLE IF EXISTS invoice_counters;

ALTER TABLE student_monthly_billing
  DROP COLUMN IF EXISTS invoice_number,
  DROP COLUMN IF EXISTS invoice_pdf_url,
  DROP COLUMN IF EXISTS invoice_issued_at,
  DROP COLUMN IF EXISTS vat_amount,
  DROP COLUMN IF EXISTS credit_note_number,
  DROP COLUMN IF EXISTS credit_note_pdf_url,
  DROP COLUMN IF EXISTS credit_note_issued_at,
  DROP COLUMN IF EXISTS credit_note_reason,
  DROP COLUMN IF EXISTS credited_invoice_number;

-- The partial unique indexes (idx_smb_invoice_number_per_org and the credit
-- note counterpart) are dropped automatically with their columns.
