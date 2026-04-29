-- Sprint 27 — Billing & Accounting Pro
-- PDF invoices, tax invoice mode, quotas, credit notes

-- ─── Story 1a: Business branding fields on organizations ───────────────────
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS business_legal_name text,
  ADD COLUMN IF NOT EXISTS tax_id              text,
  ADD COLUMN IF NOT EXISTS business_address    text,
  ADD COLUMN IF NOT EXISTS logo_url            text,
  ADD COLUMN IF NOT EXISTS currency            text NOT NULL DEFAULT 'ILS',
  ADD COLUMN IF NOT EXISTS default_vat_rate    numeric(4,2) NOT NULL DEFAULT 0;

-- ─── Story 1b: Invoice counters (atomic sequential numbers) ────────────────
CREATE TABLE invoice_counters (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  year            int  NOT NULL,
  kind            text NOT NULL DEFAULT 'invoice'
                       CHECK (kind IN ('invoice', 'credit_note')),
  last_number     int  NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_id, year, kind)
);
ALTER TABLE invoice_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_invoice_counters" ON invoice_counters
  AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);

-- ─── Story 1d: Invoice fields on student_monthly_billing ───────────────────
ALTER TABLE student_monthly_billing
  ADD COLUMN IF NOT EXISTS invoice_number    text,
  ADD COLUMN IF NOT EXISTS invoice_pdf_url   text,
  ADD COLUMN IF NOT EXISTS vat_amount        numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invoice_issued_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_smb_invoice_number_per_org
  ON student_monthly_billing (organization_id, invoice_number)
  WHERE invoice_number IS NOT NULL;

-- ─── Story 2e: Document type on charges + parent tax_id ────────────────────
ALTER TABLE charges
  ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'receipt'
    CHECK (document_type IN ('receipt', 'tax_invoice'));

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS receipt_document_type text NOT NULL DEFAULT 'receipt'
    CHECK (receipt_document_type IN ('receipt', 'tax_invoice'));

ALTER TABLE parents
  ADD COLUMN IF NOT EXISTS tax_id text;

-- ─── Story 3b: Quota columns on saas_plans ─────────────────────────────────
ALTER TABLE saas_plans
  ADD COLUMN IF NOT EXISTS students_quota        int,
  ADD COLUMN IF NOT EXISTS lessons_monthly_quota int;

UPDATE saas_plans SET students_quota = 50,  lessons_monthly_quota = 100
  WHERE name = 'free' AND students_quota IS NULL;
UPDATE saas_plans SET students_quota = 100, lessons_monthly_quota = 200
  WHERE name = 'basic' AND students_quota IS NULL;

-- ─── Story 5a: Credit note fields on student_monthly_billing ───────────────
ALTER TABLE student_monthly_billing
  ADD COLUMN IF NOT EXISTS credit_note_number      text,
  ADD COLUMN IF NOT EXISTS credit_note_pdf_url     text,
  ADD COLUMN IF NOT EXISTS credit_note_issued_at   timestamptz,
  ADD COLUMN IF NOT EXISTS credit_note_reason      text,
  ADD COLUMN IF NOT EXISTS credited_invoice_number text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_smb_credit_note_per_org
  ON student_monthly_billing (organization_id, credit_note_number)
  WHERE credit_note_number IS NOT NULL;
