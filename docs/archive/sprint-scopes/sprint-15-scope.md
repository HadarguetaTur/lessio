# Sprint 15 — Tax Receipts + Bit/PayBox

**Status:** Planned
**Branch:** `sprint-15`
**Depends on:** Sprint 14 complete
**Goal:** Israeli legal compliance — automatic receipt issuance for every payment via חשבוניות ירוקות (Green Invoice). Expand payment options with Bit and PayBox, the two most-used Israeli consumer payment methods.

---

## Pre-Sprint State

After Sprint 14, three gaps remain:

1. **No receipt issuance.** When a charge is marked paid (manually or via payment webhook), no legal receipt is issued. This is a compliance requirement in Israel — every payment must have a `קבלה`.

2. **Payment methods are incomplete.** Cardcom and PayPlus require credit cards. The majority of Israeli parents pay with **Bit** (bank-to-bank via phone) or **PayBox** (popular mobile payments app). No Bit/PayBox support means a significant share of parents cannot pay online.

3. **`payment_provider` constraint is too narrow.** The DB CHECK constraint only allows `'cardcom'` and `'payplus'`. New providers cannot be added without a migration.

---

## Story 0 — Schema Migration

**`supabase/migrations/20260415000001_receipts_and_payment_providers.sql`** (new)

```sql
-- ── Receipt columns on charges ─────────────────────────────────────────────────
-- Already planned in docs/schema.md. Activating here.
ALTER TABLE charges
  ADD COLUMN IF NOT EXISTS receipt_url        text,
  ADD COLUMN IF NOT EXISTS receipt_issued_at  timestamptz;

-- ── Receipt provider config on organizations ──────────────────────────────────
-- Encrypted JSON: { "id": "...", "secret": "..." } for Green Invoice.
-- Uses PAYMENT_CONFIG_ENCRYPTION_KEY (no new env var required).
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS receipt_config_encrypted text;

-- ── Widen payment_provider CHECK to include Bit and PayBox ────────────────────
ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_payment_provider_check;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_payment_provider_check
  CHECK (payment_provider IN ('cardcom', 'payplus', 'bit', 'paybox'));

COMMENT ON COLUMN organizations.receipt_config_encrypted IS
  'AES-256-GCM encrypted JSON: { id, secret } for Green Invoice (חשבוניות ירוקות).
   Uses the same PAYMENT_CONFIG_ENCRYPTION_KEY as payment_config_encrypted.';
```

**Out of scope:** Adding `'stripe'` to the constraint (Sprint 22).

---

## Story 1 — Receipt Provider Abstraction Layer

Mirror the pattern established by `src/lib/payments/` in Sprint 8.

### `src/lib/receipts/index.ts` (new)

```typescript
/**
 * ReceiptProvider — interface all receipt adapters must implement.
 * Currently the only adapter is Green Invoice (חשבוניות ירוקות).
 * Future: iCount, Priority, etc.
 */
export interface ReceiptProvider {
  /**
   * Issues a receipt for a completed payment.
   * Returns the receipt URL (for display + WhatsApp) and the provider's document ID.
   */
  issueReceipt(params: {
    chargeId: string          // stored as external reference in the document
    amount: number            // ILS
    parentName: string        // recipient name on the receipt
    description: string       // line item description (e.g. "שיעור - Maya Cohen")
    orgName: string           // issuing business name
  }): Promise<{ receiptUrl: string; receiptId: string }>
}

export class ReceiptProviderNotConfiguredError extends Error {
  constructor(orgId: string) {
    super(`[receipts] No receipt provider configured for org ${orgId}`)
    this.name = 'ReceiptProviderNotConfiguredError'
  }
}
```

### `src/lib/receipts/green-invoice.ts` (new)

Green Invoice (חשבוניות ירוקות) REST API adapter.

```typescript
/**
 * Green Invoice adapter.
 *
 * API reference: https://app.greeninvoice.co.il/api-docs
 * Base URL: https://api.greeninvoice.co.il/api/v1
 *
 * Auth flow:
 *   POST /account/token  { id, secret }  →  { token }  (JWT, ~30 min TTL)
 *   All subsequent requests: Authorization: Bearer <token>
 *
 * Receipt document type: 320 (קבלה)
 */

export interface GreenInvoiceConfig {
  id: string      // API key ID from Green Invoice dashboard
  secret: string  // API key secret from Green Invoice dashboard
}

export class GreenInvoiceProvider implements ReceiptProvider {
  constructor(private config: GreenInvoiceConfig) {}

  async issueReceipt(params: { ... }): Promise<{ receiptUrl: string; receiptId: string }>
  private async getToken(): Promise<string>
}
```

**Token caching:** The adapter fetches a fresh token per call (no in-memory caching across requests — this is a serverless environment). Token TTL is ~30 min at the provider level but we do not rely on it.

**Document structure sent to Green Invoice:**
```json
{
  "description": "<description>",
  "type": 320,
  "date": "<YYYY-MM-DD in org timezone>",
  "dueDate": "<same as date>",
  "lang": "he",
  "currency": "ILS",
  "vatType": 0,
  "discount": 0,
  "rounding": false,
  "signed": false,
  "client": {
    "name": "<parentName>",
    "add": false
  },
  "income": [
    {
      "catalogNum": "",
      "description": "<description>",
      "quantity": 1,
      "price": <amount>,
      "currency": "ILS",
      "vatType": 0
    }
  ],
  "payment": [
    {
      "type": 5,
      "price": <amount>,
      "currency": "ILS",
      "date": "<YYYY-MM-DD>",
      "ref": "<chargeId>"
    }
  ]
}
```

**Response:** Green Invoice returns `{ id, url }` — store `id` as `receiptId` and `url` as `receiptUrl`.

**Error handling:** If the Green Invoice API returns a non-2xx response, log the error and throw. Callers must catch and handle gracefully (receipt issuance failure must not roll back a completed payment).

### `src/lib/receipts/factory.ts` (new)

```typescript
/**
 * Loads the org's receipt config from the DB, decrypts it,
 * and returns a GreenInvoiceProvider instance.
 *
 * Uses PAYMENT_CONFIG_ENCRYPTION_KEY (reused — no new env var).
 *
 * @throws ReceiptProviderNotConfiguredError if org has no receipt_config_encrypted
 * @throws Error on decryption or JSON parse failure
 */
export async function getReceiptProvider(
  orgId: string
): Promise<ReceiptProvider>
```

---

## Story 2 — issueReceiptForCharge (idempotent helper)

**`src/lib/receipts/issueReceiptForCharge.ts`** (new)

Single entry point for issuing a receipt. Called by both the dashboard action and the payment webhook.

```typescript
/**
 * Issues a receipt for a paid charge and updates the charge row.
 *
 * Idempotent: if charge.receipt_issued_at is already set, returns immediately.
 * Fire-and-forget safe: callers should catch + log errors rather than propagate.
 *
 * Steps:
 * 1. Load charge (with parent + org).
 * 2. Guard: if receipt_issued_at already set → return (already issued).
 * 3. Load receipt provider via factory.
 * 4. Call provider.issueReceipt(...).
 * 5. UPDATE charges SET receipt_url = ..., receipt_issued_at = now()
 *    WHERE id = chargeId AND receipt_issued_at IS NULL  (atomic guard)
 * 6. Send WhatsApp to parent: "קבלה על תשלום ₪X: <link>" (best-effort, catch + log).
 * 7. Return receipt URL.
 */
export async function issueReceiptForCharge(
  chargeId: string,
  orgId: string
): Promise<string | null>
// Returns receipt URL on success, null if provider not configured or receipt already issued.
```

**WhatsApp message format:**
```
קבלה על תשלום ₪[amount]:
[receipt_url]
```

**WhatsApp send helper** — add to `src/lib/whatsapp/index.ts`:
```typescript
export async function sendReceiptMessage(
  phone: string,
  amount: number,
  receiptUrl: string,
  accessToken: string,
  phoneNumberId: string
): Promise<void>
```

---

## Story 3 — Trigger: Mark Charge Paid (Dashboard)

**`src/app/(dashboard)/charges/[id]/actions.ts`** — update `markChargeAsPaidAction`:

After successfully marking a charge as paid, fire-and-forget receipt issuance:

```typescript
// After DB update to status = 'paid':
issueReceiptForCharge(chargeId, orgId).catch((err) => {
  console.error('[charges] receipt issuance failed — charge already marked paid', {
    chargeId,
    orgId,
    err,
  })
})
```

**Out of scope:** Retroactive receipts for charges that were marked paid before Sprint 15. Only new `status = 'paid'` transitions trigger receipt issuance.

---

## Story 4 — Trigger: Payment Webhook

**`src/app/api/payments/[provider]/route.ts`** — update payment webhook handler:

After marking a charge as paid via webhook, fire-and-forget receipt issuance with the same pattern as Story 3.

---

## Story 5 — /settings/receipts

**`src/app/(dashboard)/settings/receipts/page.tsx`** (new)
**`src/app/(dashboard)/settings/receipts/actions.ts`** (new)

**Access control:** owner only.

**`page.tsx`** (server component):
- Loads current receipt config status (configured Y/N — never displays decrypted credentials).
- Renders a card with: connection status badge, input fields when not connected, disconnect button when connected.
- Links back to `/settings`.

**`actions.ts`:**
```typescript
'use server'

const GreenInvoiceSchema = z.object({
  id:     z.string().min(1, 'API ID נדרש'),
  secret: z.string().min(1, 'Secret נדרש'),
})

export async function saveReceiptConfigAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState>
// 1. Validate with GreenInvoiceSchema.
// 2. Test the credentials by calling POST /account/token — if it fails, return error.
// 3. Encrypt JSON config with PAYMENT_CONFIG_ENCRYPTION_KEY.
// 4. UPDATE organizations SET receipt_config_encrypted = ... WHERE id = orgId.
// 5. revalidatePath('/settings/receipts')
// 6. Return { success: true }

export async function disconnectReceiptAction(): Promise<{ error?: string }>
// UPDATE organizations SET receipt_config_encrypted = NULL WHERE id = orgId.
// revalidatePath('/settings/receipts')
```

**Sidebar** — add to settings section in `Sidebar.tsx`:
```typescript
{ href: '/settings/receipts', label: 'קבלות', icon: FileText, roles: ['owner'] }
```

---

## Story 6 — Receipt Link in Charge Detail View

**`src/app/(dashboard)/charges/[id]/page.tsx`** — add receipt display section:

- If `charge.receipt_url` is set: show "קבלה הופקה" badge + "צפה בקבלה" link (opens in new tab).
- If `charge.receipt_issued_at` is null and charge status is `'paid'`: show "לא הופקה קבלה" note.
- If charge status is not `'paid'`: no receipt section (receipt only exists for paid charges).

---

## Story 7 — Bit Payment Provider

**`src/lib/payments/bit.ts`** (new)

```typescript
/**
 * Bit Business payment adapter.
 *
 * Bit Business API: https://developer.bitpay.co.il
 * Generates a payment request link that the parent opens in the Bit app.
 *
 * Config fields: apiKey, secret, merchantId
 * Payment link endpoint: POST /api/v1/payments
 * Webhook field: transactionId (= reference), status ("completed" | "failed" | "expired")
 */

export interface BitConfig {
  apiKey:     string
  secret:     string
  merchantId: string
}

export class BitProvider implements PaymentProvider {
  constructor(private config: BitConfig) {}
  async createPaymentLink(params: { ... }): Promise<{ url: string; reference: string }>
}
```

**Note:** Bit's webhook body field names and payment endpoint path must be verified against the Bit Business developer portal during implementation. The adapter shell above defines the contract — fill in the API specifics from the official docs.

**`registry.ts`** — add `bitEntry`:
```typescript
const bitEntry: RegistryEntry = {
  id: 'bit',

  validateConfig(data) {
    const schema = z.object({
      apiKey:     z.string().min(1, 'API Key נדרש'),
      secret:     z.string().min(1, 'Secret נדרש'),
      merchantId: z.string().min(1, 'Merchant ID נדרש'),
    })
    // ...
  },

  createAdapter(config) {
    return new BitProvider({ apiKey: config.apiKey!, secret: config.secret!, merchantId: config.merchantId! })
  },

  parseWebhookBody(body) {
    // Verify against Bit docs during implementation
    const reference = body.transactionId
    const status = body.status
    if (!reference) return null
    return { reference, isSuccess: status === 'completed' }
  },
}
```

**`registry-ui.ts`** — add Bit UI metadata (label, logo path, field definitions).

---

## Story 8 — PayBox Payment Provider

**`src/lib/payments/paybox.ts`** (new)

```typescript
/**
 * PayBox payment adapter.
 *
 * PayBox API: https://developer.payboxapp.com
 * Generates a hosted payment page link.
 *
 * Config fields: apiKey, secret, merchantId
 * Payment link endpoint: POST /api/v1/charges/create
 * Webhook field: transactionId (= reference), result ("success" | "failure")
 */

export interface PayBoxConfig {
  apiKey:     string
  secret:     string
  merchantId: string
}

export class PayBoxProvider implements PaymentProvider {
  constructor(private config: PayBoxConfig) {}
  async createPaymentLink(params: { ... }): Promise<{ url: string; reference: string }>
}
```

**Note:** Same caveat as Bit — verify exact endpoint paths and webhook field names against the PayBox developer portal during implementation.

**`registry.ts`** — add `payboxEntry`.
**`registry-ui.ts`** — add PayBox UI metadata.

---

## Key Files Changed / Created

### New files

| File | Purpose |
|------|---------|
| `supabase/migrations/20260415000001_receipts_and_payment_providers.sql` | Add receipt columns, receipt_config_encrypted, widen payment_provider CHECK |
| `src/lib/receipts/index.ts` | ReceiptProvider interface + ReceiptProviderNotConfiguredError |
| `src/lib/receipts/green-invoice.ts` | Green Invoice adapter |
| `src/lib/receipts/factory.ts` | Decrypt config + return provider instance |
| `src/lib/receipts/issueReceiptForCharge.ts` | Idempotent receipt issuance + WhatsApp send |
| `src/lib/payments/bit.ts` | Bit Business payment adapter |
| `src/lib/payments/paybox.ts` | PayBox payment adapter |
| `src/app/(dashboard)/settings/receipts/page.tsx` | Receipt settings page (owner) |
| `src/app/(dashboard)/settings/receipts/actions.ts` | saveReceiptConfigAction + disconnectReceiptAction |

### Modified files

| File | Change |
|------|--------|
| `src/lib/payments/index.ts` | Widen `SupportedProvider` union type: add `'bit' \| 'paybox'` |
| `src/lib/payments/registry.ts` | Add `bitEntry` + `payboxEntry` |
| `src/lib/payments/registry-ui.ts` | Add Bit + PayBox UI metadata |
| `src/lib/whatsapp/index.ts` | Add `sendReceiptMessage` helper |
| `src/app/(dashboard)/charges/[id]/actions.ts` | Fire-and-forget receipt after mark-paid |
| `src/app/(dashboard)/charges/[id]/page.tsx` | Display receipt URL + badge |
| `src/app/api/payments/[provider]/route.ts` | Fire-and-forget receipt after webhook mark-paid |
| `src/components/dashboard/Sidebar.tsx` | Add קבלות nav entry (owner) |
| `AGENTS.md` | Update implementation status table |

---

## New Env Vars

**None.** Receipt config is per-org, stored encrypted in `organizations.receipt_config_encrypted`. The encryption uses the existing `PAYMENT_CONFIG_ENCRYPTION_KEY` — no new key required.

---

## Security Notes

- `receipt_config_encrypted` follows the same pattern as `payment_config_encrypted` — AES-256-GCM, decrypted at call time, plaintext never logged or cached.
- Green Invoice token (`/account/token` response) is short-lived and never stored.
- `PAYMENT_CONFIG_ENCRYPTION_KEY` is reused to avoid proliferating encryption keys. One key, two encrypted columns.
- Bit and PayBox webhooks **must** be validated before processing (same pattern as existing payment webhooks — validate signature or shared secret per provider's docs).

---

## Error Handling Rules

1. **Receipt failure must never roll back a completed payment.** `issueReceiptForCharge` is always fire-and-forget from the caller's perspective.
2. **Payment provider failure must never block the webhook 200 response.** Meta and payment providers expect an immediate 200 — process asynchronously or catch all errors.
3. **If Green Invoice is not configured, skip silently.** `issueReceiptForCharge` returns `null` and logs a debug message. No error surfaced to the user.
4. **Idempotency:** `charges.receipt_issued_at IS NULL` checked in SQL before issuing. Concurrent calls are safe — the atomic UPDATE WHERE clause prevents double-issuance.

---

## What Is NOT in Sprint 15

- **Receipts for historical charges** — only new `status = 'paid'` transitions. Backfilling old paid charges is a one-time admin script, not part of this sprint.
- **Parent portal receipt view** — parents see receipt links in the portal in Sprint 16 when the portal gets its payments tab enhancement.
- **Multiple receipt providers** — only Green Invoice in this sprint. iCount, Priority integration deferred.
- **Receipt PDF generation in-app** — use the URL returned by Green Invoice. In-app PDF rendering is Sprint 17+.
- **Stripe payment provider** — Sprint 22 (international launch).
- **Cardcom/PayPlus webhook signature validation hardening** — already implemented in Sprint 8; no change needed.
- **Bit/PayBox receipt issuance** — receipt issuance is provider-agnostic; once `issueReceiptForCharge` is wired to the webhook handler, all providers benefit automatically.

---

## Architecture After Sprint 15

```
Charge marked paid
  ├─ (dashboard) markChargeAsPaidAction
  │     └─ issueReceiptForCharge (fire-and-forget)
  │           ├─ getReceiptProvider(orgId)  →  GreenInvoiceProvider
  │           ├─ provider.issueReceipt(...)  →  { receiptUrl, receiptId }
  │           ├─ UPDATE charges SET receipt_url, receipt_issued_at
  │           └─ sendReceiptMessage(parentPhone, amount, receiptUrl, ...)
  │
  └─ (webhook) POST /api/payments/[provider]
        └─ same issueReceiptForCharge call (identical path)

Payment providers (factory pattern):
  Cardcom  (Sprint 8)  ─┐
  PayPlus  (Sprint 8)  ─┤─ PaymentProvider interface
  Bit      (Sprint 15) ─┤     └─ createPaymentLink()
  PayBox   (Sprint 15) ─┘

Receipt providers (new factory pattern):
  Green Invoice (Sprint 15) ─── ReceiptProvider interface
                                    └─ issueReceipt()
```

---

## Decisions Added (for decisions.md)

**Decision — receipt encryption key:** `receipt_config_encrypted` reuses `PAYMENT_CONFIG_ENCRYPTION_KEY` rather than introducing a new env var. Rationale: both columns store third-party API credentials with the same sensitivity level; one key is simpler to rotate and audit.

**Decision — receipt issuance trigger:** Receipt issued immediately on `status = 'paid'` transition, not on a scheduled cron. Rationale: parents expect the receipt promptly via WhatsApp. If Green Invoice is temporarily down, the charge is still paid — the receipt can be manually reissued from the charge detail page (future Sprint 17 admin action).

**Decision — Bit/PayBox webhook validation:** Exact signature validation implementation deferred to implementation day (field names and HMAC specifics must be read from each provider's live webhook docs). The sprint scope defines the contract; the adapter fills in the details. Document the actual validation method in `registry.ts` comments once confirmed.
