# Sprint 8 — Real Payments (Multi-Provider)

**Status:** In Progress  
**Goal:** Every org connects its own payment provider. Owner configures credentials per-org (encrypted at rest). Cardcom is the first supported provider. Payment links are sent via WhatsApp; payment status is updated automatically via webhook.

---

## Pre-Sprint State

Sprint 7 delivered per-org WhatsApp credentials (AES-256-GCM encrypted, stored on `organizations`).  
Sprint 8 applies the same pattern to payment providers.

**Deferred from Sprint 7 (tested on staging only):**
- WhatsApp Embedded Signup UI flow — requires HTTPS; tested on Vercel staging, not localhost
- Webhook routing via `phone_number_id` — verified on staging with real Meta webhook

---

## Story 0 — Staging QA Docs Update

**`docs/release-checklist.md`** — add Sprint 7 env vars to Phase 1.1:
- `WHATSAPP_TOKEN_ENCRYPTION_KEY`
- `META_APP_ID`
- `META_APP_SECRET`
- `PAYMENT_CONFIG_ENCRYPTION_KEY` (Sprint 8)

**`docs/qa-e2e-staging.md`** — add Scenario 7:
- WhatsApp Embedded Signup E2E on staging (HTTPS required)
- Verify `phone_number_id` and encrypted token saved to DB
- Verify disconnect clears both fields
- Update sign-off gate from "6 scenarios" → "7 scenarios"

---

## Story 1 — Schema Migration

**`supabase/migrations/20260325000003_payments.sql`**

Added to `organizations`:
- `payment_provider text CHECK (payment_provider IN ('cardcom'))` — nullable; NULL = not connected
- `payment_config_encrypted text` — AES-256-GCM encrypted JSON blob with provider-specific credentials (plaintext never stored)

Added to `charges`:
- `payment_link text` — payment URL sent to parent via WhatsApp
- `payment_reference text` — provider transaction ID (arrives via webhook)
- `payment_provider text` — snapshot of which provider processed this charge

Comments added on all new columns.

---

## Story 2 — Payment Abstraction Layer

**`src/lib/payments/index.ts`** (new, server-only)

```typescript
export interface PaymentProvider {
  createPaymentLink(params: {
    chargeId: string
    amount: number
    description: string
    orgId: string
  }): Promise<{ url: string; reference: string }>
}

export type SupportedProvider = 'cardcom'

export class PaymentProviderNotConfiguredError extends Error {}
```

**`src/lib/payments/cardcom.ts`** (new)
- Implements `PaymentProvider`
- Calls Cardcom J5 API: `https://secure.cardcom.solutions/api/v11/LowProfile/Create`
- Config: `{ terminal: string; apiName: string; apiPassword: string }` — decrypted from DB at call time
- Returns `{ url: lowProfileUrl, reference: lowProfileCode }`

**`src/lib/payments/factory.ts`** (new)
- `getPaymentProvider(orgId: string): Promise<{ provider: PaymentProvider; providerName: SupportedProvider }>`
- Fetches org, decrypts `payment_config_encrypted`, returns correct provider instance
- Throws `PaymentProviderNotConfiguredError` if `payment_provider` is null

Encryption key: `PAYMENT_CONFIG_ENCRYPTION_KEY` env var (32-byte hex).  
Reuses `encryptToken` / `decryptToken` from `src/lib/crypto/index.ts`.

---

## Story 3 — Owner Payment Settings Page

**`src/app/(dashboard)/settings/payment/page.tsx`** (new)
- Owner-only (`forbidden()` for non-owner roles)
- Connected state: shows provider name + masked credentials summary + Disconnect button
- Disconnected state: provider selector dropdown + credential form

**`src/app/(dashboard)/settings/payment/actions.ts`** (new)
- `savePaymentProvider(prevState, formData)` — Zod-validated, owner-only
  - Validates provider-specific fields (terminal, apiName, apiPassword for Cardcom)
  - Encrypts config JSON → persists `payment_provider` + `payment_config_encrypted` on org
  - `revalidatePath('/settings/payment')`
- `disconnectPayment(prevState, formData)` — owner-only
  - Nulls both `payment_provider` and `payment_config_encrypted`

**`src/app/(dashboard)/settings/payment/PaymentProviderForm.tsx`** (new, client component)
- `useActionState` for form state
- Dynamic fields based on selected provider (Cardcom: terminal, apiName, apiPassword)

**`src/app/(dashboard)/settings/payment/DisconnectPaymentButton.tsx`** (new, client component)
- Form wrapper around `disconnectPayment`

New env var: `PAYMENT_CONFIG_ENCRYPTION_KEY` (production-required).

---

## Story 4 — Payment Request Action (update)

**`src/app/(dashboard)/charges/[id]/actions.ts`** (existing — update `sendPaymentRequest`)

Current: sends WhatsApp message with amount only (no real payment link).  
New:
1. Calls `getPaymentProvider(orgId)` — returns error to UI if not configured
2. Calls `provider.createPaymentLink({ chargeId, amount, description, orgId })`
3. Updates `charges` row: `payment_link`, `payment_reference`, `payment_provider`
4. Sends WhatsApp message with the payment link
5. Fire-and-forget pattern for WhatsApp — payment link already saved before send attempt

---

## Story 5 — Cardcom Webhook

**`src/app/api/payments/cardcom/route.ts`** (new)

- POST from Cardcom when payment completes
- Verifies `payment_reference` exists in `charges` table (org-scoped lookup)
- Updates `charge.status = 'paid'`, `paid_at = now()`
- Returns 200 always (Cardcom requires immediate 200)
- Logs success/failure with `chargeId` and `orgId`

Cardcom sends: `lowProfileCode` (= `payment_reference`), `ReturnValue` (= `chargeId`), `ResponseCode` (0 = success).

---

## Story 6 — Env Vars

**`src/lib/env.ts`** — added to `REQUIRED_IN_PRODUCTION`:
- `PAYMENT_CONFIG_ENCRYPTION_KEY`

**`.env.local.example`** — documented with generation instructions:
```
# Generate with: openssl rand -hex 32
PAYMENT_CONFIG_ENCRYPTION_KEY=
```

Provider credentials (terminal, apiName, apiPassword) are stored per-org in DB encrypted — NOT as env vars.

---

## Story 7 — Sidebar Nav

**`src/components/dashboard/Sidebar.tsx`**

Added: `{ href: '/settings/payment', label: 'תשלומים', icon: CreditCard, roles: ['owner'] }`

---

## Story 8 — Charges UI Update

**`src/app/(dashboard)/charges/`** (existing)

- Charge detail / list: show `payment_provider` and `payment_link` when present
- "שלח בקשת תשלום" button: disabled with tooltip if payment provider not configured, with link to `/settings/payment`
- Payment status: distinguish "שולם דרך Cardcom" vs "סומן ידנית"

---

## Architecture After Sprint 8

```
Owner Dashboard /settings/payment
  → select Cardcom → enter credentials
    → savePaymentProvider server action
      → encryptConfig → organizations.payment_config_encrypted

Owner Dashboard /charges/[id]
  → "שלח בקשת תשלום"
    → getPaymentProvider(orgId) → decryptConfig → CardcomProvider
      → Cardcom J5 API → payment URL
        → charges.payment_link + payment_reference saved
          → WhatsApp message with link → parent

Cardcom POST /api/payments/cardcom
  → lookup by payment_reference
    → charge.status = 'paid', paid_at = now()
```

---

## What is NOT in Sprint 8

- Additional payment providers beyond Cardcom (interface supports them; not implemented)
- Automatic charge on lesson completion (manual trigger only)
- Recurring billing / subscriptions
- PDF invoices
- Refund flows
- WhatsApp bot platform (Sprint 9)
- Google Calendar sync (Sprint 10)
