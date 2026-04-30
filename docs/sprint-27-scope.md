# Sprint 27 — Billing & Accounting Pro
*Branch: `sprint-27`*
*Depends on: Sprint 26 complete*

---

## Carry-Over from Sprint 23/24/25/26

| Item | Reason |
|---|---|
| Sumit SaaS Billing E2E staging validation (manual checklist) | Not code — requires staging environment with real Sumit credentials. Deferred until staging is provisioned. |

---

## Closed Decisions (pre-sprint)

| Topic | Decision |
|---|---|
| PDF library | **`@react-pdf/renderer`** — pure JS, runs in Node (no Puppeteer/Chromium dep), supports Hebrew RTL via embedded font (Heebo). Server-action friendly. |
| Invoice number format | `YYYY-NNNN` per org per year (e.g. `2026-0042`). Atomic increment via `invoice_counters` row lock. |
| Credit note number format | `CR-YYYY-NNNN` per org per year, separate counter from invoices (discriminated by `kind` column). |
| Invoice storage | Supabase Storage `invoices` bucket, private. Signed URLs (24h TTL); permanent reference column on `student_monthly_billing.invoice_pdf_url`. |
| iCount scope | Adapter already exists (`src/lib/receipts/icount.ts`) — Story 2 becomes **"iCount Tax Invoice mode"**: add doctype 300 (חשבונית מס) + 330 (זיכוי) alongside doctype 400 (קבלה), configurable per org. |
| Document-type abstraction | Extend `ReceiptProvider` interface with optional `documentType` param (`'receipt' \| 'tax_invoice'`); default `'receipt'` keeps existing behavior. Green Invoice mirrors (type 320 vs 305). |
| Credit note flow | New `issueCreditNote()` method on `ReceiptProvider` (optional). Cancels by issuing a *new* credit document — never deletes/edits the original. Single full-amount credit per invoice; partial credits out of scope. |
| Quota model | Add `students_quota` and `lessons_monthly_quota` columns to `saas_plans`. Checked at action entry via `requireQuotaCapacity()` mirroring `requireMutation()`. NULL = unlimited. |
| Quota error handling | New `QuotaExceededError` (typed `Error` subclass). Caught in a Next.js error boundary at `/app/(dashboard)/error.tsx` → renders upgrade card. |
| Accounting CSV format | Single bilingual format with all columns iCount + QuickBooks need (date, doc number, customer name + tax id, description, net + VAT + gross, status, payment date, receipt number). Includes invoices and credit notes as separate rows with `Type` column. |
| Branding fields location | New columns on `organizations` table — not a separate `org_branding` table (1:1, never queried alone). |
| Currency | New `organizations.currency` column (3-letter ISO, default `ILS`). |

---

## Context: What Was Already Built

| Feature | Status |
|---|---|
| `ReceiptProvider` interface + factory | Done (Sprint 15) |
| Green Invoice adapter (doctype 320 only) | Done (Sprint 15) |
| **iCount adapter (doctype 400 only)** | **Done — already in production** |
| Sumit receipt adapter | Done |
| Receipt settings UI w/ provider dropdown (3 options) | Done |
| Receipt issuance flow (idempotent + WhatsApp + email) | Done (Sprint 15/25) |
| `requireFeature(orgId, feature)` (redirects on miss) | Done (Sprint 23) |
| Plan + feature matrix in `saas_plans` | Done (Sprint 22) |
| Sidebar UI-only feature gating | Done (Sprint 22) |
| `requireMutation(session)` pattern | Done (Sprint 18) |
| `student_monthly_billing` table (no invoice columns yet) | Done (Sprint 22) |
| CSV export pipeline (`toCsv` + BOM + UTF-8) | Done (Sprint 17) |
| Revenue report page + CSV button | Done (Sprint 17) |
| `requireFeature` already called in 11 actions/pages | Done (Sprint 23) |
| Monthly billing engine (`buildStudentMonth`, line items) | Done (Sprint 3/22) |

---

## Goal

Move billing from "we send a WhatsApp link" to "we issue a numbered, branded, downloadable PDF invoice with VAT, optionally as a tax invoice through iCount or Green Invoice, with full credit-note support, and we lock features and quotas at the server boundary so plan tiers actually mean something."

---

## Story 1 — PDF Invoice Generation

**Why:** Parents and accountants both want a printable, archivable invoice — not a one-time link. Mid-market customers need sequential invoice numbers, tax IDs, and VAT lines for their bookkeeping. Today the system has none of these.

### 1a — Schema (combined into single migration)

```sql
ALTER TABLE organizations
  ADD COLUMN business_legal_name text,
  ADD COLUMN tax_id              text,
  ADD COLUMN business_address    text,
  ADD COLUMN logo_url            text,
  ADD COLUMN currency            text NOT NULL DEFAULT 'ILS',
  ADD COLUMN default_vat_rate    numeric(4,2) NOT NULL DEFAULT 0;

ALTER TABLE student_monthly_billing
  ADD COLUMN invoice_number    text,
  ADD COLUMN invoice_pdf_url   text,
  ADD COLUMN vat_amount        numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN invoice_issued_at timestamptz;

CREATE UNIQUE INDEX idx_smb_invoice_number_per_org
  ON student_monthly_billing (organization_id, invoice_number)
  WHERE invoice_number IS NOT NULL;

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
```

Storage bucket: `invoices` (private). Path: `{org_id}/{year}/{invoice_number}.pdf`.
Storage bucket: `org-logos` (public, image content types only).

### 1b — PDF Generation Lib

- New: `src/lib/billing/invoices/generateInvoicePdf.ts` — renders React PDF doc → returns `Buffer`. Loads org branding + bill via `buildStudentMonth()`. Computes VAT from `org.default_vat_rate × total_amount`. Embeds Heebo font for Hebrew RTL.
- New: `src/lib/billing/invoices/issueInvoiceNumber.ts` — atomic `INSERT … ON CONFLICT … RETURNING` against `invoice_counters`. Accepts `kind` param. Returns formatted string.
- New: `src/lib/billing/invoices/uploadInvoicePdf.ts` — uploads buffer to `invoices` bucket; signed URL helper (24h TTL).
- New: `src/lib/billing/invoices/InvoiceDocument.tsx` — React PDF component (org header, line items, totals, VAT, footer).

### 1c — Action + UI

- Extend `approveBillingAction()` in `src/app/(dashboard)/billing/actions.ts` → fire-and-forget call to `generateAndStoreInvoice(billingId)`. Sets all 4 invoice fields atomically.
- New action: `downloadInvoiceAction(billingId)` → returns signed URL (regenerates lazily if missing).
- "הורד חשבונית" button on `BillingDetailHeaderActions.tsx` (visible only when `invoice_pdf_url IS NOT NULL`).
- Download icon column on billing list page.
- Payment-request WhatsApp template gets new `{{invoice_url}}` var.
- Email receipt flow: PDF attachment if available.

### 1d — Business Profile Settings Page

- New route: `src/app/(dashboard)/settings/business-profile/page.tsx`.
- Form: `business_legal_name`, `tax_id`, `business_address`, `currency` (dropdown), `default_vat_rate` (number 0–25), `logo_url` (file upload to `org-logos` bucket).
- Sidebar entry: "פרופיל העסק" under Settings.
- `saveBusinessProfileAction()` with `requireMutation()` + `owner` role only.

---

## Story 2 — iCount Tax Invoice Mode + Document Type Abstraction

**Why:** The iCount adapter already ships in production but is hardcoded to doctype 400 (קבלה). Israeli SMBs billing other businesses need חשבונית מס (doctype 300). Same gap exists in Green Invoice (only type 320; type 305 is a common ask).

### 2a — Interface Extension

Update `src/lib/receipts/index.ts`:

```typescript
export type DocumentType = 'receipt' | 'tax_invoice'

export interface ReceiptProvider {
  issueReceipt(params: {
    chargeId: string
    amount: number
    parentName: string
    description: string
    orgName: string
    date: string
    documentType?: DocumentType  // default 'receipt'
    vatAmount?: number           // required when documentType = 'tax_invoice'
    customerTaxId?: string       // optional, for B2B invoices
  }): Promise<{ receiptUrl: string; receiptId: string; documentType: DocumentType }>

  // Optional — providers that don't support credit notes throw NotImplemented
  issueCreditNote?(params: {
    chargeId: string
    amount: number
    parentName: string
    description: string
    orgName: string
    date: string
    vatAmount: number
    customerTaxId?: string
    originalInvoiceNumber: string
  }): Promise<{ creditNoteUrl: string; creditNoteId: string }>
}
```

### 2b — Adapter Updates

- `src/lib/receipts/icount.ts`: branch on `documentType` — `'receipt'` → doctype `400` (current); `'tax_invoice'` → doctype `300` with `item_vat_1` + `client_taxid`. Implement `issueCreditNote()` → doctype `330`.
- `src/lib/receipts/green-invoice.ts`: branch type 320 vs 305. Implement `issueCreditNote()` → type `330`.
- `src/lib/receipts/sumit.ts`: accept `documentType` (no-op default `'receipt'`). `issueCreditNote()` not implemented.

### 2c — Org Config

- Extend `receipt_config_encrypted` JSON: optional `defaultDocumentType: 'receipt' | 'tax_invoice'`.
- `ReceiptSettingsForm.tsx`: when provider is iCount or Green Invoice, show radio "סוג מסמך ברירת מחדל" (קבלה / חשבונית מס).
- `actions.ts`: persist new field.

### 2d — Issuance Wiring

- `src/lib/receipts/issueReceiptForCharge.ts`: read `defaultDocumentType` from decrypted config; pass `vatAmount` (computed from charge × org's `default_vat_rate`) and `customerTaxId` (from new `parents.tax_id` column) to provider. Persist `documentType` on `charges.document_type`.

### 2e — Schema (small additions, in same migration)

```sql
ALTER TABLE charges
  ADD COLUMN document_type text NOT NULL DEFAULT 'receipt'
    CHECK (document_type IN ('receipt', 'tax_invoice'));

ALTER TABLE parents
  ADD COLUMN tax_id text;  -- optional, for B2B
```

---

## Story 3 — Server-Side Feature & Quota Enforcement

**Why:** Today, plan tiers are visual. The sidebar hides `/leads` for basic-plan orgs, but a direct POST to the underlying server action still works — gate is UI-only. Also: no quota enforcement exists, so the "100 students" cap on basic plan is marketing-only.

### 3a — Audit & Add `requireFeature` Calls

| Feature | Files needing the gate |
|---|---|
| `homework` | `homework/[id]/actions.ts`, `homework/templates/actions.ts` (assign already gated) |
| `leads` | `leads/actions.ts`, `leads/[id]/actions.ts` (convert already gated) |
| `ai_assistant` | already covered (3 calls in `settings/ai-assistant`) |
| `parent_portal` | All `/api/portal/**` routes + portal messages action (Sprint 26) |
| `full_reports` | `/api/reports/[report]/route.ts` (currently checks role, not feature); pages already gated |
| `whatsapp_automation` | `settings/whatsapp-automation/actions.ts`, reminder Edge Function trigger registration |

Audit method: grep for `'use server'` + `requireMutation` and cross-reference against feature matrix.

### 3b — Quota Schema + Helpers

```sql
ALTER TABLE saas_plans
  ADD COLUMN students_quota         int,  -- NULL = unlimited
  ADD COLUMN lessons_monthly_quota  int;  -- NULL = unlimited

UPDATE saas_plans SET students_quota = 50,  lessons_monthly_quota = 100 WHERE plan_name = 'free';
UPDATE saas_plans SET students_quota = 100, lessons_monthly_quota = 200 WHERE plan_name = 'basic';
-- advanced + custom: NULL (unlimited)
```

New: `src/lib/saas/quota.ts`:

```typescript
export class QuotaExceededError extends Error {
  constructor(public kind: 'students' | 'lessons_monthly', public limit: number) {
    super(`QUOTA_EXCEEDED:${kind}`)
  }
}

export async function requireQuotaCapacity(orgId: string, kind: 'students' | 'lessons_monthly'): Promise<void>
export async function getOrgQuotaUsage(orgId: string): Promise<{
  studentsUsed: number; studentsLimit: number | null;
  lessonsUsed: number;  lessonsLimit: number | null;
}>
```

- Students count: `SELECT count(*) FROM students WHERE organization_id = $1`
- Lessons count: `SELECT count(*) FROM lessons WHERE organization_id = $1 AND start_at >= date_trunc('month', now()) AND start_at < date_trunc('month', now()) + interval '1 month'`
- Throws `QuotaExceededError` when usage ≥ limit (and limit non-null).

### 3c — Wire Quotas to Action Entry Points

- `students/actions.ts` `createStudentAction()` → `requireQuotaCapacity(orgId, 'students')`.
- `lessons/new/actions.ts` `createLessonAction()`, recurring series creation, single-lesson booking → `requireQuotaCapacity(orgId, 'lessons_monthly')`.
- Bulk import `api/import/execute/route.ts` — count after parse, fail fast if would push over quota.
- Onboarding wizard import — same check.

### 3d — Error Boundary + Upgrade UX

- New: `src/app/(dashboard)/error.tsx` (Next.js error boundary).
- Catches `QuotaExceededError` → renders friendly card "הגעת למכסה החודשית של החבילה" + CTA "שדרג חבילה" → `/account/billing?upgrade=quota`.
- `account/billing/page.tsx`: show current usage bars (students X/100, lessons Y/200) on basic plan.

### 3e — UI Quota Indicators

- Sidebar usage indicator at the bottom (basic plan only).
- Settings → Subscription page: usage breakdown + warning at 80%.

---

## Story 4 — Accounting CSV Export

**Why:** Israeli accountants want one file they can import into iCount or QuickBooks. Current revenue report is summary-by-month — they need row-per-charge detail with all the columns iCount/QuickBooks expect, including credit notes as separate negative rows.

### 4a — Data Layer

New: `src/lib/reports/accounting.ts`:

```typescript
export interface AccountingExportRow {
  type:           'invoice' | 'credit_note'
  date:           string  // YYYY-MM-DD (org timezone)
  documentNumber: string  // e.g. "2026-0042" or "CR-2026-0007"
  customerName:   string
  customerTaxId:  string  // empty if none
  description:    string
  amountNet:      string
  vatAmount:      string
  amountGross:    string  // negative for credit notes
  paymentStatus:  'paid' | 'open'
  paymentDate:    string  // empty if open
  receiptNumber:  string  // empty if none
}

export async function getAccountingExport(
  orgId: string,
  range: { from: string; to: string }
): Promise<AccountingExportRow[]>
```

- Joins: `student_monthly_billing` × `parents` × `students` × `charges` (1:1 via `billing_record_id`).
- Yields one row per invoice + one row per credit note (negative amounts).

### 4b — API Endpoint

- Extend `src/app/api/reports/[report]/route.ts` — add `case 'accounting'`:
  - Reuses `toCsv()` + BOM.
  - Bilingual headers: `Type / סוג מסמך`, `Date / תאריך`, `Document # / מס׳ מסמך`, `Customer / לקוח`, `Tax ID / ח.פ.`, `Description / תיאור`, `Net / סכום ללא מע״מ`, `VAT / מע״מ`, `Total / סה״כ`, `Status / סטטוס`, `Paid On / שולם בתאריך`, `Receipt # / מס׳ קבלה`.
  - Query params: `from=YYYY-MM-DD&to=YYYY-MM-DD` (default = current calendar month).
- Gate: `requireFeature(orgId, 'full_reports')` (covered by 3a).

### 4c — UI Button

- Add to `src/app/(dashboard)/reports/revenue/page.tsx` actions area — "ייצוא לחשבונאות" button → opens date range picker → calls `/api/reports/accounting?from=...&to=...`.
- New component: `AccountingExportButton.tsx` with date range modal (reuse existing date picker).

---

## Story 5 — Credit Notes (חשבוניות זיכוי)

**Why:** Once we issue numbered tax invoices (Stories 1+2), Israeli law requires us to *cancel/reverse* them via a credit note (חשבונית זיכוי) — never by deleting or editing the original. Without this, our invoicing breaks the moment a real-world correction is needed.

### 5a — Schema (in same migration)

```sql
ALTER TABLE student_monthly_billing
  ADD COLUMN credit_note_number      text,
  ADD COLUMN credit_note_pdf_url     text,
  ADD COLUMN credit_note_issued_at   timestamptz,
  ADD COLUMN credit_note_reason      text,
  ADD COLUMN credited_invoice_number text;

CREATE UNIQUE INDEX idx_smb_credit_note_per_org
  ON student_monthly_billing (organization_id, credit_note_number)
  WHERE credit_note_number IS NOT NULL;
```

Credit-note counters share the `invoice_counters` table via the `kind` column (added in Story 1a).

Storage path: `{org_id}/{year}/credit-{credit_note_number}.pdf`.

### 5b — Lib

- New: `src/lib/billing/invoices/generateCreditNotePdf.ts` — same React PDF template pattern as `InvoiceDocument` but with red header "חשבונית זיכוי", negative amounts, and "מבטלת חשבונית מס׳ {original}" reference line.
- Extend `issueInvoiceNumber()` to accept `kind: 'invoice' | 'credit_note'` param. Credit format: `CR-YYYY-NNNN`.
- New: `src/lib/billing/invoices/issueCreditNote.ts` — orchestrator: issue number → generate PDF → upload → call provider's `issueCreditNote()` if present → persist all fields atomically.
- New: `src/lib/billing/invoices/CreditNoteDocument.tsx` — React PDF component.

### 5c — Action + UI

- New action: `issueCreditNoteAction(billingId, reason)` in `billing/actions.ts`.
  - `requireMutation()` + `requireFeature()` + role check (`owner`/`admin`).
  - Guard 1: `invoice_number IS NOT NULL` (only invoiced records can be credited).
  - Guard 2: `credit_note_number IS NULL` (cannot credit twice).
  - Atomic transaction: issue number → generate PDF → upload → call provider → persist.
- "ביטול חשבונית" button on `BillingDetailHeaderActions.tsx` — visible only when guards pass.
- New: `IssueCreditNoteDialog.tsx` — confirmation dialog with required reason textarea.
- After issuance: PDF download button for the credit note + visual "בוטל" badge.
- Billing list page: small red badge column for credited records.

### 5d — Notification

- On credit note issuance: `createNotification()` for primary parent (type: `invoice_cancelled`) with action URL → portal payments page.

---

## Schema Changes (consolidated)

All schema changes ship in a single migration: `supabase/migrations/20260603000001_sprint27_invoices_branding.sql`. See the per-story `### *a — Schema` blocks above for the full SQL. Highlights:

- `organizations`: +6 branding/currency/VAT columns
- `student_monthly_billing`: +4 invoice columns, +5 credit-note columns
- `invoice_counters`: new table with `kind` discriminator
- `charges`: +`document_type`
- `parents`: +`tax_id`
- `saas_plans`: +`students_quota`, +`lessons_monthly_quota` + seed updates

---

## Files to Create

| File | Story |
|---|---|
| `supabase/migrations/20260603000001_sprint27_invoices_branding.sql` | All |
| `src/lib/billing/invoices/generateInvoicePdf.ts` | 1b |
| `src/lib/billing/invoices/issueInvoiceNumber.ts` | 1b |
| `src/lib/billing/invoices/uploadInvoicePdf.ts` | 1b |
| `src/lib/billing/invoices/InvoiceDocument.tsx` | 1b |
| `src/app/(dashboard)/billing/[studentId]/DownloadInvoiceButton.tsx` | 1c |
| `src/app/(dashboard)/settings/business-profile/page.tsx` | 1d |
| `src/app/(dashboard)/settings/business-profile/BusinessProfileForm.tsx` | 1d |
| `src/app/(dashboard)/settings/business-profile/actions.ts` | 1d |
| `src/lib/saas/quota.ts` | 3b |
| `src/app/(dashboard)/error.tsx` | 3d |
| `src/components/saas/QuotaUsageBars.tsx` | 3e |
| `src/lib/reports/accounting.ts` | 4a |
| `src/app/(dashboard)/reports/revenue/AccountingExportButton.tsx` | 4c |
| `src/lib/billing/invoices/generateCreditNotePdf.ts` | 5b |
| `src/lib/billing/invoices/issueCreditNote.ts` | 5b |
| `src/lib/billing/invoices/CreditNoteDocument.tsx` | 5b |
| `src/app/(dashboard)/billing/[studentId]/IssueCreditNoteDialog.tsx` | 5c |

## Files to Modify

| File | Change |
|---|---|
| `src/lib/receipts/index.ts` | Extend `ReceiptProvider` interface with `documentType`, `vatAmount`, `customerTaxId`, optional `issueCreditNote()` |
| `src/lib/receipts/icount.ts` | Branch doctype 300/400; implement `issueCreditNote()` → doctype 330 |
| `src/lib/receipts/green-invoice.ts` | Branch type 305/320; implement `issueCreditNote()` → type 330 |
| `src/lib/receipts/sumit.ts` | Accept `documentType` (no-op default `'receipt'`) |
| `src/lib/receipts/issueReceiptForCharge.ts` | Pass document type + VAT + customer tax ID through |
| `src/app/(dashboard)/settings/receipts/ReceiptSettingsForm.tsx` | Add document-type radio for iCount + Green Invoice |
| `src/app/(dashboard)/settings/receipts/actions.ts` | Persist `defaultDocumentType` in encrypted config |
| `src/app/(dashboard)/billing/actions.ts` | Trigger PDF generation on approve; add `issueCreditNoteAction()` |
| `src/app/(dashboard)/billing/[studentId]/BillingDetailHeaderActions.tsx` | Add Download Invoice + Issue Credit Note buttons |
| `src/app/(dashboard)/billing/page.tsx` | Add download icon + "בוטל" badge columns |
| `src/app/api/reports/[report]/route.ts` | Add `'accounting'` case |
| `src/lib/billing/monthly/types.ts` | Extend `MonthlyBillingRow` with new invoice + credit-note columns |
| `src/components/dashboard/Sidebar.tsx` | Add "פרופיל העסק" entry; mount `<QuotaUsageBars />` for basic plan |
| ~20 server-action files | Add `requireFeature()` and/or `requireQuotaCapacity()` calls (per Story 3a/3c audit) |
| `src/lib/notifications/index.ts` | Add `invoice_cancelled` to `NotificationType` union |
| `messages/he.json`, `messages/en.json` | Add `billing.invoice.*`, `billing.creditNote.*`, `settings.businessProfile.*`, `quota.*`, `accounting.*` keys |
| `package.json` | Add `@react-pdf/renderer` |
| `docs/sprint-roadmap.md` | Update Sprint 27 row to "Done" + correct iCount note (was already integrated in Sprint 23) |

---

## Acceptance Criteria

### Story 1 — PDF Invoices
- [ ] `student_monthly_billing` has `invoice_number`, `invoice_pdf_url`, `vat_amount`, `invoice_issued_at` columns
- [ ] `organizations` has `logo_url`, `tax_id`, `business_legal_name`, `business_address`, `currency`, `default_vat_rate`
- [ ] `invoice_counters` table exists with RLS deny policy
- [ ] Invoice numbers are sequential per org per year, atomically incremented (concurrent generation does not collide)
- [ ] Approving a billing record auto-generates a PDF, uploads to Supabase Storage, and stores URL
- [ ] Download button on billing detail page returns a signed URL (24h TTL)
- [ ] PDF includes: org logo, legal name, tax ID, address; invoice number + date; line items (lessons, subscriptions, cancellations, manual adjustment); net + VAT + gross totals; Hebrew RTL renders correctly
- [ ] Business profile settings page allows owners to upload logo and edit tax ID, address, currency, VAT rate

### Story 2 — Tax Invoices
- [ ] iCount adapter supports both doctype 400 (receipt) and 300 (tax invoice) selectable per org
- [ ] Green Invoice adapter supports both type 320 and 305 selectable per org
- [ ] Receipt settings UI has document-type radio for iCount + Green Invoice
- [ ] `charges.document_type` populated; `parents.tax_id` flows into tax invoices

### Story 3 — Server-Side Enforcement
- [ ] `requireFeature()` gates every plan-gated server action (per audit table)
- [ ] `requireQuotaCapacity()` blocks student creation past plan limit (basic = 100)
- [ ] `requireQuotaCapacity()` blocks lesson creation past plan limit (basic = 200/month)
- [ ] `QuotaExceededError` is caught by error boundary → renders upgrade card
- [ ] Bulk import respects quotas (basic plan org cannot import 200 students)
- [ ] Sidebar shows usage bars on basic plan only

### Story 4 — Accounting Export
- [ ] `/api/reports/accounting?from=...&to=...` returns CSV with all required columns
- [ ] CSV opens cleanly in Excel (Hebrew renders, no mojibake) and imports into iCount
- [ ] "ייצוא לחשבונאות" button on revenue reports page opens date picker → downloads
- [ ] Accounting CSV includes both invoices and credit notes as separate rows with `Type` column

### Story 5 — Credit Notes
- [ ] `student_monthly_billing` has `credit_note_number`, `credit_note_pdf_url`, `credit_note_issued_at`, `credit_note_reason`, `credited_invoice_number` columns
- [ ] `invoice_counters` extended with `kind` discriminator; credit notes increment independently from invoices
- [ ] Credit note numbers follow format `CR-YYYY-NNNN`, sequential per org per year
- [ ] "ביטול חשבונית" button visible only when an invoice exists and no credit note has been issued
- [ ] Issuing a credit note requires a non-empty reason
- [ ] Credit note PDF includes red header, negative amounts, and "מבטלת חשבונית מס׳ {original}" reference
- [ ] iCount and Green Invoice both issue credit documents (doctype 330) when configured
- [ ] Cannot credit-note the same invoice twice (guard returns user-friendly error)

### Cross-cutting
- [ ] All new tables have RLS with deny policies (service-role only)
- [ ] All migrations are forward-only (`supabase db reset` succeeds)
- [ ] All new UI is i18n-ready (Hebrew + English)
- [ ] `npm run build` succeeds; `npx tsc --noEmit` clean; `npm test` 100% pass
- [ ] No regressions in existing receipt issuance for orgs that don't change settings

---

## Out of Scope

- E-signature on invoices (digital cert, חתימה ממוחשבת) — defer to a future "compliance" sprint
- Partial credit notes (זיכוי חלקי) — v1 cancels the full invoice; partial refunds deferred
- Multi-currency display (org has single currency in v1; converting historical data deferred)
- QuickBooks Online direct API integration (CSV import is the v1 path)
- iCount tax invoice + receipt combo (חשבונית מס/קבלה, doctype 320 in iCount) — single-doctype only in v1
- Invoice email *attachment* — v1 sends URL only (PDF attachment requires Resend `attachments` and is mailbox-size-sensitive)
- Sumit tax invoice / credit note support — Sumit covered for receipts only this sprint
- Real-time quota counters (cached) — recompute per request is acceptable at our scale; cache layer if needed in Sprint 28+
- Plan upgrade self-service flow improvements — already exists from Sprint 22; only error-boundary CTA in scope
