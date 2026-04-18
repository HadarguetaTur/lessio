# Sprint 23 — International Launch Readiness
*Branch: `sprint-23`*
*Depends on: Sprint 22 complete*

---

## Closed Decisions (from pre-sprint Q&A)

| Topic | Decision |
|---|---|
| Cookie consent banner | **Deferred** — app uses only technically-necessary cookies (`sb-*`, `NEXT_LOCALE`). No analytics provider, no consent required. |
| Anonymisation method | **Masking only** — name → `[מחוק]`, phone → `***`. No row deletion (preserves billing/audit history). GDPR permits this. |
| Deletion notification | **Admin UI only** — visible in superadmin org detail page. No WhatsApp/email alert. |
| Data retention default | **365 days for all orgs**. Setting UI visible to Advanced/Custom plan owners only. free/basic are silently auto-anonymised at 365 days. |
| URL prefix locale routing | **Deferred** — too risky (breaks portal URLs, file restructure). Replace with: Accept-Language detection + redirect `/portal/[orgId]` → `/he/portal/[orgId]`. |
| `/book/[token]` locale | Auto-detect from `Accept-Language` header on arrival (no locale in JWT). |
| Stripe model | **Per-org keys** — each org enters its own Stripe secret key + webhook secret in settings, stored in `payment_config_encrypted`. No platform-level Stripe env var. |
| Stripe currency | **Manual selection** in payment settings UI (dropdown). Stored in `payment_config_encrypted` JSON alongside keys. |
| SEPA | **Deferred** — requires mandate UI + legal text. Sprint 24+. |
| PayPal | **Deferred** — Stripe covers 95% of target markets. |
| Feature gate UX | **Redirect to `/account/billing?upgrade=<feature>`** — not `notFound()`. Existing data stays readable (read-only); only creation is blocked. |
| WhatsApp template names | Build infrastructure with **placeholder names**. Real Meta-approved names filled in post-approval. |
| `whatsapp_processed_messages` index | **Add** `(organization_id, from_phone, created_at)` index in sprint-23 migration. |

---

## Context: What Was Already Built

| Feature | Status |
|---|---|
| SaaS platform schema — `saas_plans`, `organization_subscriptions`, `saas_plan_inquiries` | ✅ Done |
| `src/lib/saas/` — plans, subscriptions, feature gates, Sumit checkout | ✅ Done |
| `src/app/api/webhooks/sumit-saas/` — Sumit payment webhook | ✅ Done |
| Onboarding plan selection + payment flow (mock-payment, payment-callback, pending-custom) | ✅ Done |
| `src/app/(dashboard)/account/billing/` — org subscription management page | ✅ Done |
| `src/lib/saas/featureGate.ts` — `getEffectiveSaasFeatures`, `assertOrgNotSaasReadOnly` | ✅ Done |
| `src/app/privacy/page.tsx` + `src/app/terms/page.tsx` — placeholder content | ✅ Done |
| `src/components/marketing/LandingPage.tsx` | ✅ Done |
| `src/app/forgot-password/page.tsx` | ✅ Done |
| `supabase/functions/saas-subscription-checker/` | ✅ Done |

---

## Goal

Four workstreams (cookie banner and PayPal/SEPA deferred per closed decisions above):

1. **GDPR compliance** — deletion request flow, data masking, retention Edge Function, legal pages
2. **Locale auto-detection** — Accept-Language detection + portal URL backward-compat redirect
3. **Stripe payment provider** — card payments for non-IL orgs (per-org keys, manual currency)
4. **WhatsApp Approved Templates** — `sendSmartMessage` infrastructure + session-window fallback logic
5. **Production hardening** — error boundaries, server-side feature gate enforcement

---

## Story 1 — GDPR Compliance

**Why:** Required to legally serve EU/UK customers. Cookie banner deferred (no analytics cookies).

### 1a — Right to Deletion (Portal → Admin)

- DB: `data_deletion_requests` table (see Schema Changes)
- Portal: "בקשת מחיקת נתונים" button in `/portal/[orgId]/home` → confirmation modal → inserts row via service role action
- Admin (`/admin/orgs/[id]`): "Deletion Requests" section — lists open requests, action buttons: **Anonymise** / **Dismiss**
- `src/lib/superadmin/dataDeletion.ts`:
  - `listDeletionRequests(orgId)` — returns open requests
  - `processDeletionRequest(requestId, action)` — on Anonymise: masks `parents.name` → `[מחוק]`, `parents.phone` → `***`, `students.name` → `[מחוק]` for the requester's phone; sets `status = 'processed'`
- No email/WhatsApp notification — visible in admin UI only

### 1b — Data Export (Superadmin)

- `src/app/(admin)/admin/orgs/[id]/actions.ts` — `exportOrgDataAction(orgId)` — JSON of all parents + students + lessons + charges for the org
- Download button in org detail page (superadmin only)

### 1c — Data Retention Policy

- `organizations.data_retention_days` column — default `365`, nullable (`null` = never auto-anonymise)
- `supabase/functions/data-retention/index.ts` — daily cron at 03:00 UTC:
  - Anonymises `conversation_log` rows older than `data_retention_days`: `user_phone` → `***`, `message` → `[anonymised]`, `response` → `[anonymised]`
  - Anonymises `whatsapp_processed_messages.from_phone` → `***` for rows older than `data_retention_days`
  - Skips orgs where `data_retention_days IS NULL`
- Settings page (`/settings/general` or `/settings/privacy`): retention days dropdown (90 / 180 / 365 / never) — **visible to owner on Advanced/Custom plan only**; free/basic silently use 365-day default
- Register cron in `supabase/config.toml`

### 1d — Legal Pages with Structured Content

- `messages/he.json` + `messages/en.json`: add `legal.privacy.*` + `legal.terms.*` namespaces with real section headings and short placeholder bodies (not Lorem — descriptive "coming soon" text per section):
  - Privacy: Information We Collect / How We Use It / Data Storage / Your Rights / Contact
  - Terms: Service Description / Acceptable Use / Payment Terms / Termination / Governing Law
- Update `src/app/privacy/page.tsx` + `src/app/terms/page.tsx` to render section list from translation keys
- Add "Last updated" date and contact email via `src/lib/marketing/siteContact.ts` (`NEXT_PUBLIC_SUPPORT_EMAIL`)

---

## Story 2 — Locale Auto-Detection + Portal Backward Compatibility

**Why:** International users arriving at login/portal for the first time should get the correct locale automatically. Existing portal URLs shared with parents must continue to work.

### 2a — Accept-Language Detection

- `src/i18n/request.ts` — if `NEXT_LOCALE` cookie is absent, parse `Accept-Language` header:
  - `he*` → `he`; `en*` → `en`; anything else → `en` (English as international default)
- On first dashboard login: `src/app/login/actions.ts` — if `profiles.preferred_locale` is null, write detected locale to both cookie and DB

### 2b — Portal URL Backward Compatibility

- `src/proxy.ts` (or `next.config.ts` redirects): add permanent redirect `301` from `/portal/:orgId` → `/he/portal/:orgId`
- Existing portal links shared with Hebrew-speaking parents continue to work
- No file restructure — `/portal/[orgId]/` stays at its current path; the redirect catches legacy URLs

**Note:** Full `[locale]` URL prefix routing (moving files to `src/app/[locale]/`) is deferred. This story is a lightweight bridge.

---

## Story 3 — Stripe Payment Provider

**Why:** Cardcom/PayPlus/Bit/PayBox are Israel-only. Non-IL orgs need Stripe for card payments.

### 3a — Stripe Adapter

- `src/lib/payments/stripe.ts` — implements `PaymentProvider` interface:
  - `createPaymentRequest(charge, org)` → creates Stripe Checkout Session (hosted page), returns URL
  - `handleWebhook(rawBody, headers, config)` → verifies `stripe-signature` using per-org `webhookSecret`, handles `checkout.session.completed` → returns `{ chargeId, status: 'paid' }`
- Config shape (stored encrypted in `payment_config_encrypted`):
  ```ts
  { secretKey: string; webhookSecret: string; currency: string }
  ```
- `src/lib/payments/index.ts` — extend `SupportedProvider` union with `'stripe'`
- `src/lib/payments/registry.ts` — add `stripeEntry`
- `src/lib/payments/registry-ui.ts` — Stripe UI metadata

### 3b — Stripe Webhook Route

- `src/app/api/payments/stripe/route.ts` — reads raw body via `request.arrayBuffer()` before any JSON parse (required for `stripe-signature` verification)
- Existing `src/app/api/payments/[provider]/route.ts` already handles raw body — Stripe routes through it via registry

### 3c — Payment Settings UI

- `src/app/(dashboard)/settings/payment/page.tsx` — add Stripe card alongside existing providers
- Fields: **Secret Key**, **Webhook Secret**, **Currency** (dropdown: ILS / USD / EUR / GBP / AUD)
- Same encrypt-and-store pattern as Cardcom/PayPlus

**No platform-level env vars for Stripe** — all credentials are per-org in `payment_config_encrypted`.

**New dependency:** `stripe` npm package

---

## Story 4 — WhatsApp Approved Templates

**Why:** Session messages only work within 24h of the parent's last inbound message. Proactive reminders and payment requests sent to inactive parents silently fail. Meta Approved Templates remove this restriction.

### 4a — `sendTemplateMessage` Function

- `src/lib/whatsapp/index.ts` — add:
  ```ts
  sendTemplateMessage(phone, accessToken, phoneNumberId, templateName, languageCode, components)
  ```
  Uses `POST /messages` with `type: "template"`. `languageCode` is `"he"` for Hebrew, `"en"` for English.

### 4b — Session-Window Smart Send

- `src/lib/whatsapp/sendSmart.ts` — `sendSmartMessage(orgId, phone, templateType, vars)`:
  1. Query `whatsapp_processed_messages` for a row with `organization_id = orgId AND from_phone = phone AND created_at > now() - interval '24 hours'`
  2. **Within window** → `sendTextMessage` with `resolveTemplate(orgId, templateType, vars)` (current behaviour, customisable body)
  3. **Outside window** → `sendTemplateMessage` with name/language/components from `approvedTemplates.ts`

### 4c — Approved Template Registry

- `src/lib/whatsapp/approvedTemplates.ts` — maps `MessageTemplateType` → Meta template spec:
  ```ts
  type ApprovedTemplate = {
    name: string          // Meta template name — PLACEHOLDER until approved
    languageCode: string  // 'he' | 'en'
    buildComponents: (vars: Record<string, string>) => MetaTemplateComponent[]
  }
  ```
- Initial coverage: `lesson_reminder`, `payment_reminder`, `payment_request`, `homework_reminder`
- Template names are placeholders (`lessio_lesson_reminder_he` etc.) — updated post Meta approval without code change

### 4d — Migrate Reminder Edge Functions

- `supabase/functions/_shared/whatsapp.ts` — add Deno `sendTemplateMessage` + `sendSmartMessage`
- `supabase/functions/lesson-reminders/index.ts` — replace `sendTextMessage` with `sendSmartMessage`
- `supabase/functions/payment-reminders/index.ts` — same
- `supabase/functions/homework-reminders/index.ts` — same

**Out of scope:** Meta template submission UI, Arabic template variants.

---

## Story 5 — Production Hardening

### 5a — Global Error Boundaries

- `src/app/error.tsx` — root error boundary (`"use client"`, reset button + link home)
- `src/app/not-found.tsx` — global 404 page
- `src/app/(dashboard)/error.tsx` — dashboard error boundary with "חזרה לדשבורד" CTA
- `src/app/(admin)/admin/error.tsx` — admin shell error boundary

### 5b — Server-Side Feature Gate Enforcement

Currently, feature gates are UI-only (sidebar hides links). Server actions and pages must also enforce.

**`src/lib/saas/featureGate.ts`** — add:
```ts
function requireFeature(session: Session, feature: keyof SaasFeatures): void
// Throws redirect to /account/billing?upgrade=<feature> if plan lacks the feature
```

**Read-only rule:** Existing data created before a plan downgrade is always readable. Gates only block writes (create/update/delete).

Apply `requireFeature` to:

| Action / Page | Feature |
|---|---|
| `saveAiAssistantSettings` (enable toggle) | `ai_assistant` |
| `createAssignmentAction`, `updateAssignmentAction` | `homework` |
| `convertLeadAction` | `leads` |
| Revenue / teachers / students report pages (page-level) | `full_reports` |
| `verifyOtpAction` (portal login) | `parent_portal` |

Feature gate redirect target: `/account/billing?upgrade=<feature>` — page shows upgrade prompt with plan comparison.

### 5c — Sumit SaaS Billing E2E Validation

Not code — a manual validation checklist to run on staging once `SUMIT_COMPANY_ID` + `SUMIT_API_KEY` are configured:

- [ ] Plan selection in onboarding with Sumit test card
- [ ] `organization_subscriptions` row created with correct `status = 'active'`
- [ ] Sumit webhook fires → `sumit-saas` route updates subscription status
- [ ] `saas-subscription-checker` cron marks expired subscriptions as `past_due`
- [ ] Cancel flow via `/account/billing` sets `cancel_at_period_end = true`

---

## Schema Changes

```sql
-- Story 1a: deletion requests
CREATE TABLE data_deletion_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requester_phone text NOT NULL,
  status          text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'processed', 'dismissed')),
  processed_at    timestamptz,
  processed_by    uuid REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE data_deletion_requests ENABLE ROW LEVEL SECURITY;
-- Inserted via service role (portal action); read via service role (superadmin)

-- Story 1c: retention policy
ALTER TABLE organizations
  ADD COLUMN data_retention_days int NOT NULL DEFAULT 365;
-- null = never auto-anonymise (owner opt-out)

-- Story 4b: index for 24h session-window query (sendSmartMessage)
CREATE INDEX idx_whatsapp_processed_messages_phone
  ON whatsapp_processed_messages (organization_id, from_phone, created_at DESC);
```

**Migration file:** `supabase/migrations/20260430000001_sprint23_gdpr_stripe_whatsapp.sql`

---

## New Dependencies

| Package | Story | Purpose |
|---|---|---|
| `stripe` | 3 | Stripe Node SDK — Checkout Sessions + webhook verification |

---

## New Env Vars

None at platform level — Stripe credentials are per-org in `payment_config_encrypted`.

`NEXT_PUBLIC_SUPPORT_EMAIL` + `NEXT_PUBLIC_BUSINESS_ADDRESS` must be set in staging/production for legal pages (already in `siteContact.ts`, not yet validated at startup — add to `ALWAYS_REQUIRED` if non-empty check desired).

---

## Files to Create

| File | Story |
|---|---|
| `src/lib/superadmin/dataDeletion.ts` | 1a |
| `src/lib/whatsapp/sendSmart.ts` | 4b |
| `src/lib/whatsapp/approvedTemplates.ts` | 4c |
| `src/lib/payments/stripe.ts` | 3a |
| `src/app/api/payments/stripe/route.ts` | 3b |
| `src/app/error.tsx` | 5a |
| `src/app/not-found.tsx` | 5a |
| `src/app/(dashboard)/error.tsx` | 5a |
| `src/app/(admin)/admin/error.tsx` | 5a |
| `supabase/functions/data-retention/index.ts` | 1c |
| `supabase/migrations/20260430000001_sprint23_gdpr_stripe_whatsapp.sql` | 1a+1c+4b |

---

## Files to Modify

| File | Change |
|---|---|
| `src/i18n/request.ts` | Add `Accept-Language` → `he`/`en` detection |
| `src/app/login/actions.ts` | Persist detected locale to `profiles.preferred_locale` if null |
| `src/proxy.ts` | Add `301` redirect `/portal/:orgId` → `/he/portal/:orgId` |
| `src/app/(admin)/admin/orgs/[id]/page.tsx` + `actions.ts` | Add deletion requests UI + `exportOrgDataAction` |
| `src/app/(dashboard)/settings/payment/page.tsx` | Add Stripe card (secret key + webhook secret + currency) |
| `src/lib/payments/index.ts` | Extend `SupportedProvider` with `'stripe'` |
| `src/lib/payments/registry.ts` | Add `stripeEntry` |
| `src/lib/payments/registry-ui.ts` | Stripe UI metadata |
| `src/lib/whatsapp/index.ts` | Add `sendTemplateMessage` |
| `supabase/functions/_shared/whatsapp.ts` | Add Deno `sendTemplateMessage` + `sendSmartMessage` |
| `supabase/functions/lesson-reminders/index.ts` | Use `sendSmartMessage` |
| `supabase/functions/payment-reminders/index.ts` | Use `sendSmartMessage` |
| `supabase/functions/homework-reminders/index.ts` | Use `sendSmartMessage` |
| `supabase/config.toml` | Register `data-retention` daily cron |
| `src/lib/saas/featureGate.ts` | Add `requireFeature` with upgrade redirect |
| `src/app/(dashboard)/settings/ai-assistant/actions.ts` | `requireFeature(session, 'ai_assistant')` |
| `src/app/(dashboard)/homework/assign/page.tsx` + actions | `requireFeature(session, 'homework')` on write |
| `src/app/(dashboard)/leads/[id]/convert/page.tsx` + actions | `requireFeature(session, 'leads')` |
| `src/app/(dashboard)/reports/revenue/page.tsx` + others | `requireFeature(session, 'full_reports')` |
| `src/app/portal/[orgId]/login/actions.ts` | `requireFeature(session, 'parent_portal')` |
| `src/app/privacy/page.tsx` + `src/app/terms/page.tsx` | Render structured sections |
| `messages/he.json` + `messages/en.json` | Add `legal.privacy.*`, `legal.terms.*`, GDPR portal strings |
| `.env.local.example` | Document `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_BUSINESS_ADDRESS` |

---

## Acceptance Criteria

- [ ] Parent can submit a data deletion request from portal; superadmin can anonymise it
- [ ] `data-retention` Edge Function runs daily and anonymises `conversation_log` + `whatsapp_processed_messages` beyond retention window
- [ ] Privacy + Terms pages render structured sections with headings and non-Lorem placeholder text
- [ ] Browser without `NEXT_LOCALE` cookie: Hebrew Accept-Language → `he`, English → `en`, other → `en`
- [ ] Legacy portal URL `/portal/[orgId]` redirects 301 to `/he/portal/[orgId]`
- [ ] Stripe configured in org payment settings; Stripe Checkout Session created and payment marked paid on webhook
- [ ] WhatsApp reminders outside 24h window use `sendTemplateMessage`; within window use `sendTextMessage`
- [ ] Enabling AI assistant on `free` plan redirects to `/account/billing?upgrade=ai_assistant`
- [ ] Homework creation blocked on plans without `homework` feature; existing assignments remain readable
- [ ] Dashboard, root, and admin error boundaries render without crashing on thrown errors
- [ ] `npm test` passes 100%

---

## Out of Scope

- Cookie consent banner (deferred — no analytics cookies exist)
- SEPA Direct Debit (deferred — mandate UI required)
- PayPal (deferred — Stripe sufficient for target markets)
- Full `[locale]` URL prefix routing / file restructure (deferred — sprint 24+)
- Arabic language support (deferred indefinitely)
- Per-org privacy policy pages (Sprint 27)
- DPA agreements
- Meta template submission UI (manual process)
- Google / Apple Pay via Stripe
