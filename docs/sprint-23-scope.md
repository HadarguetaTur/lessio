# Sprint 23 — International Launch Readiness
*Branch: `sprint-23`*
*Depends on: Sprint 22 complete*

---

## Context: What Was Already Built

The following was built outside the official sprint cycle and is fully in place before Sprint 23 begins:

| Feature | Status |
|---|---|
| SaaS platform schema — `saas_plans`, `organization_subscriptions`, `saas_plan_inquiries` (migration `20260428`) | ✅ Done |
| `src/lib/saas/` — plans, subscriptions, feature gates, Sumit checkout | ✅ Done |
| `src/app/api/webhooks/sumit-saas/` — Sumit payment webhook | ✅ Done |
| Onboarding plan selection step + payment flow (mock-payment, payment-callback, pending-custom) | ✅ Done |
| `src/app/(dashboard)/account/billing/` — subscription management page for org owners | ✅ Done |
| `src/lib/saas/featureGate.ts` — `getEffectiveSaasFeatures`, `assertOrgNotSaasReadOnly` | ✅ Done |
| `src/app/privacy/page.tsx` + `src/app/terms/page.tsx` — pages exist with placeholder content | ✅ Done |
| `src/components/marketing/LandingPage.tsx` — landing page with copy + FAQ + animations | ✅ Done |
| `src/app/forgot-password/page.tsx` | ✅ Done |
| `supabase/functions/saas-subscription-checker/` — subscription status cron | ✅ Done |

---

## Goal

Five workstreams that make the product ready to legally and technically operate in the EU and English-speaking markets (UK, AU, US):

1. **GDPR compliance** — data deletion request, data export, retention policy, cookie consent
2. **URL-based locale routing + Arabic** — SEO-friendly public URLs, browser auto-detection, RTL Arabic
3. **International payments (Stripe)** — Stripe Checkout + SEPA + PayPal for non-IL markets
4. **WhatsApp Approved Templates** — Meta-approved templates for proactive outbound messages
5. **Production hardening** — global error boundaries, server-side feature gate enforcement on actions

---

## Story 1 — GDPR Compliance

**Why:** Required to legally serve EU customers. Also raises trust for EN-speaking markets (UK, AU).

### 1a — Cookie Consent Banner
- `src/components/marketing/CookieBanner.tsx` — client component, shown on first visit for EU users
- Stores consent choice in `localStorage` + optional cookie `COOKIE_CONSENT`
- Non-EU users: detect via `CF-IPCountry` header (Vercel edge) — skip banner if not EU/UK
- Only needed on public routes (landing, login, signup, portal, booking WebView) — not in dashboard
- Add to `src/app/layout.tsx` (root layout)

### 1b — Right to Deletion (Portal → Admin)
- DB: `data_deletion_requests` table (see Schema Changes below)
- Portal: new "בקשת מחיקת נתונים" button in `/portal/[orgId]/home` → confirms → inserts row
- Admin (`/admin/orgs/[id]`): new "deletion requests" section lists open requests with action buttons: Anonymize / Dismiss
- `src/lib/superadmin/dataDeletion.ts` — `listDeletionRequests`, `processDeletionRequest` (anonymises student/parent name + phone)

### 1c — Data Export
- `src/app/(admin)/admin/orgs/[id]/actions.ts` — `exportOrgDataAction(orgId)` — collects all parents + lessons + charges for the org into a JSON blob
- Download button in org detail page (superadmin only, out-of-scope for org owners in this sprint)

### 1d — Data Retention Policy
- `organizations.data_retention_days` column (nullable, default `null` = no auto-deletion)
- `supabase/functions/data-retention/index.ts` — daily cron, anonymises `conversation_log` + `whatsapp_processed_messages` rows older than `data_retention_days`
- Settings page addition: owner can set retention days (90 / 180 / 365 / never) — shown only if org is on Advanced or Custom plan
- Register cron in `supabase/config.toml`

### 1e — Legal Pages with Real Content
- `messages/he.json` + `messages/en.json`: add `legal.privacy.body` + `legal.terms.body` — real placeholder text (full legal copy is deferred; structured sections now, Lorem-free)
- Update `src/app/privacy/page.tsx` + `src/app/terms/page.tsx` to render sectioned content instead of a single placeholder paragraph
- Add `Last updated: [date]` and contact email from `src/lib/marketing/siteContact.ts`

**Out of scope:** Right to portability PDF export for parents, DPA agreements, per-org privacy policy pages (Sprint 27).

---

## Story 2 — URL-Based Locale Routing + Arabic

**Why:** Public-facing pages (portal, booking WebView, landing) need SEO-friendly URLs and correct locale for non-Hebrew users. Arabic is required for the Israeli Arab market and Gulf expansion.

### 2a — next-intl URL Prefix Routing (public routes only)
- Add `routing.ts` to `src/i18n/` with `defineRouting({ locales: ['he', 'en', 'ar'], defaultLocale: 'he' })`
- Wrap `src/app/` public routes under `src/app/[locale]/` for: `/`, `/login`, `/signup`, `/forgot-password`, `/privacy`, `/terms`, `/portal/[orgId]`, `/book/[token]`
- Dashboard (`(dashboard)`) and admin (`(admin)`) remain cookie-based only (no URL prefix — authenticated users, SEO irrelevant)
- Update `src/proxy.ts` locale-bypass rules accordingly
- `next.config.ts` — plug in next-intl routing plugin

### 2b — Browser `Accept-Language` Auto-Detection
- In `src/i18n/request.ts` — if `NEXT_LOCALE` cookie is absent, read `Accept-Language` header and default to `he`/`en`/`ar` accordingly
- On first dashboard login, persist detected locale to `profiles.preferred_locale` if not yet set

### 2c — Arabic Support
- `messages/ar.json` — full translation of all existing namespaces (copy EN structure, translate strings)
- `dir="rtl"` already set dynamically from locale — Arabic reuses same RTL layout as Hebrew
- Locale switcher: add AR option in `LocaleSwitcher.tsx`

**Out of scope:** Arabic WhatsApp message templates in this sprint (covered in Story 4).

---

## Story 3 — International Payment Methods (Stripe)

**Why:** Cardcom/PayPlus/Bit/PayBox are Israel-only. UK, AU, US customers need Stripe.

### 3a — Stripe Payment Adapter
- `src/lib/payments/stripe.ts` — implements `PaymentProvider` interface
  - `createPaymentRequest` → Stripe Checkout Session (hosted page)
  - `handleWebhook` → verify `stripe-signature`, handle `checkout.session.completed`
- `src/lib/payments/registry.ts` — add `stripeEntry`
- `src/lib/payments/registry-ui.ts` — Stripe UI metadata (logo, label)
- `src/lib/payments/index.ts` — extend `SupportedProvider` union with `'stripe'`

### 3b — Stripe Webhook Route
- `src/app/api/payments/stripe/route.ts` — use raw body for signature verification (cannot use Next.js body parser)
- Add `'stripe'` to webhook handler routing in `src/app/api/payments/[provider]/route.ts`

### 3c — Payment Settings UI
- `src/app/(dashboard)/settings/payment/page.tsx` — add Stripe card (alongside existing Cardcom/PayPlus/Bit/PayBox)
- Fields: Stripe publishable key, Stripe secret key, Stripe webhook secret
- Encrypt via `src/lib/payments/factory.ts` pattern (store in `payment_config_encrypted`)

### 3d — SEPA Direct Debit (via Stripe)
- Stripe Payment Intent with `payment_method_types: ['sepa_debit']`
- Stripe adapter detects `billing_country` from org settings — if EU, offer SEPA option in checkout
- `organizations.billing_country` column (new, nullable)

### 3e — PayPal
- `src/lib/payments/paypal.ts` — PayPal Orders API v2
- Scope: create order → return approval URL → capture on webhook
- Add to registry + settings UI

**New dependency:** `stripe` (official Stripe Node SDK)

**New env vars:**
- `STRIPE_SECRET_KEY` (REQUIRED_IN_PRODUCTION)
- `STRIPE_WEBHOOK_SECRET` (REQUIRED_IN_PRODUCTION)
- `PAYPAL_CLIENT_ID` + `PAYPAL_CLIENT_SECRET` (REQUIRED_IN_PRODUCTION)

---

## Story 4 — WhatsApp Approved Templates (Meta)

**Why:** Currently all outbound WhatsApp messages are "session messages" — valid only within 24h of the parent's last inbound message. For proactive messages (reminders, payment requests) sent to parents who haven't messaged recently, Meta requires pre-approved Message Templates.

### 4a — Template Message Type
- `src/lib/whatsapp/index.ts` — add `sendTemplateMessage(phone, templateName, languageCode, components)` function using `POST /messages` with `type: "template"`
- Keep existing `sendTextMessage` for session messages (AI replies, quick confirmations)

### 4b — Fallback Logic
- `src/lib/whatsapp/sendSmart.ts` — `sendSmartMessage(orgId, phone, templateType, vars)`:
  1. Check if parent sent a message in last 24h (query `whatsapp_processed_messages`)
  2. Within session window → use `sendTextMessage` with resolved template text
  3. Outside window → use `sendTemplateMessage` with approved template name

### 4c — Template Registry for Meta Submission
- `src/lib/whatsapp/approvedTemplates.ts` — maps each `MessageTemplateType` to a Meta template name + language + components structure
- Initially: `lesson_reminder`, `payment_reminder`, `payment_request`, `homework_reminder`
- **Does not** replace the existing DB-customizable template text system — the resolved text is the body of the approved template (submitted to Meta once)

### 4d — Migrate Reminder Functions
- `supabase/functions/lesson-reminders/index.ts` — use `sendSmartMessage` (Deno version)
- `supabase/functions/payment-reminders/index.ts` — same
- `supabase/functions/homework-reminders/index.ts` — same
- `supabase/functions/_shared/whatsapp.ts` — add Deno `sendTemplateMessage` + `sendSmartMessage`

**Out of scope:** Meta template submission UI in dashboard (manual submission to Meta for now). Arabic template variants deferred until AR templates are approved.

---

## Story 5 — Production Hardening

### 5a — Global Error Boundaries
- `src/app/error.tsx` — root error boundary (client component, `"use client"`)
- `src/app/not-found.tsx` — global 404 page
- `src/app/(dashboard)/error.tsx` — dashboard error boundary with "חזרה לדשבורד" CTA
- `src/app/(admin)/admin/error.tsx` — admin shell error boundary

### 5b — Server-Side Feature Gate Enforcement
Sidebar visibility is currently the only gate. Actions + pages must also enforce.

- `src/lib/saas/featureGate.ts` — add `requireFeature(session, featureName)` that throws 403 if plan lacks the feature
- Apply to Server Actions:
  - AI assistant: `saveAiAssistantSettings` — require `ai_assistant`
  - Homework: `createAssignmentAction` — require `homework`
  - Leads: `convertLeadAction` — require `leads`
  - Reports: revenue/teachers/students reports data functions — require `full_reports`
  - Portal: `verifyOtpAction` — require `parent_portal`
- Apply to page-level: throw `notFound()` or redirect to `/account/billing` if feature missing

### 5c — Sumit SaaS Billing E2E Validation
- Not code — a validation checklist:
  - [ ] Plan selection in onboarding with test card
  - [ ] `organization_subscriptions` row created correctly
  - [ ] Sumit webhook fires + updates subscription status
  - [ ] `saas-subscription-checker` cron runs + marks expired correctly
  - [ ] Cancel flow via `/account/billing`

---

## Schema Changes

```sql
-- Story 1b
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
-- Only superadmin reads via service role; portal inserts via service role action

-- Story 1d
ALTER TABLE organizations
  ADD COLUMN data_retention_days int; -- null = no auto-deletion

-- Story 3d
ALTER TABLE organizations
  ADD COLUMN billing_country text; -- ISO 3166-1 alpha-2, nullable
```

**Migration file:** `supabase/migrations/20260430000001_sprint23_gdpr_stripe.sql`

---

## New Dependencies

| Package | Story | Purpose |
|---|---|---|
| `stripe` | 3 | Stripe Payments Node SDK |

(PayPal uses fetch against PayPal REST API — no SDK needed)

---

## New Env Vars

Add to `src/lib/env.ts` (`REQUIRED_IN_PRODUCTION`):

| Var | Story |
|---|---|
| `STRIPE_SECRET_KEY` | 3 |
| `STRIPE_WEBHOOK_SECRET` | 3 |
| `PAYPAL_CLIENT_ID` | 3 |
| `PAYPAL_CLIENT_SECRET` | 3 |

---

## Files to Create

| File | Story |
|---|---|
| `src/components/marketing/CookieBanner.tsx` | 1a |
| `src/lib/superadmin/dataDeletion.ts` | 1b |
| `src/i18n/routing.ts` | 2a |
| `messages/ar.json` | 2c |
| `src/lib/payments/stripe.ts` | 3a |
| `src/app/api/payments/stripe/route.ts` | 3b |
| `src/lib/payments/paypal.ts` | 3e |
| `src/lib/whatsapp/sendSmart.ts` | 4b |
| `src/lib/whatsapp/approvedTemplates.ts` | 4c |
| `src/app/error.tsx` | 5a |
| `src/app/not-found.tsx` | 5a |
| `src/app/(dashboard)/error.tsx` | 5a |
| `src/app/(admin)/admin/error.tsx` | 5a |
| `supabase/functions/data-retention/index.ts` | 1d |
| `supabase/migrations/20260430000001_sprint23_gdpr_stripe.sql` | 1b+1d+3d |

---

## Files to Modify

| File | Change |
|---|---|
| `src/app/layout.tsx` | Add `CookieBanner` |
| `src/i18n/request.ts` | Add `Accept-Language` auto-detection + routing config |
| `next.config.ts` | Plug in next-intl routing plugin |
| `src/proxy.ts` | Update locale bypass for `[locale]` prefix routes |
| `src/components/dashboard/LocaleSwitcher.tsx` | Add AR option |
| `src/lib/payments/registry.ts` | Add Stripe + PayPal entries |
| `src/lib/payments/registry-ui.ts` | Add Stripe + PayPal UI metadata |
| `src/lib/payments/index.ts` | Extend `SupportedProvider` union |
| `src/app/api/payments/[provider]/route.ts` | Route to Stripe webhook (raw body) |
| `src/app/(dashboard)/settings/payment/page.tsx` | Add Stripe + PayPal cards |
| `src/lib/whatsapp/index.ts` | Add `sendTemplateMessage` |
| `supabase/functions/_shared/whatsapp.ts` | Add Deno `sendTemplateMessage` + `sendSmartMessage` |
| `supabase/functions/lesson-reminders/index.ts` | Use `sendSmartMessage` |
| `supabase/functions/payment-reminders/index.ts` | Use `sendSmartMessage` |
| `supabase/functions/homework-reminders/index.ts` | Use `sendSmartMessage` |
| `supabase/config.toml` | Register `data-retention` cron |
| `src/lib/saas/featureGate.ts` | Add `requireFeature` + apply to actions/pages |
| `src/app/privacy/page.tsx` + `src/app/terms/page.tsx` | Render sectioned content |
| `messages/he.json` + `messages/en.json` | Add GDPR, Arabic locale, legal content keys |
| `.env.local.example` | Add Stripe + PayPal env vars |

---

## Acceptance Criteria

- [ ] Cookie consent banner appears on landing/login for EU-origin requests; hidden for IL users
- [ ] Parent can submit a data deletion request from portal; superadmin can see and process it
- [ ] `data_retention_days` Edge Function runs daily and anonymises old conversation logs
- [ ] Privacy + Terms pages show real sectioned content (not single placeholder paragraph)
- [ ] Portal URL at `/he/portal/[orgId]` and `/en/portal/[orgId]` works correctly; booking WebView same
- [ ] Browser in English auto-lands on EN locale on first visit (no cookie set)
- [ ] Arabic locale renders RTL correctly; all translation keys present in `ar.json`
- [ ] Stripe payment provider can be configured in settings; payment link works end-to-end on Stripe test mode
- [ ] PayPal payment provider configurable and functional in sandbox
- [ ] WhatsApp reminders use `sendTemplateMessage` when outside 24h session window
- [ ] Attempting to enable AI assistant on `free` plan returns a 403 / redirect to plan upgrade
- [ ] Dashboard, root, and admin error boundaries catch and display gracefully
- [ ] `npm test` passes 100%

---

## Out of Scope

- Arabic WhatsApp template submission to Meta (manual process, not code)
- Per-org privacy policy pages (Sprint 27)
- DPA agreements / data processing agreements
- iCount accounting integration (Sprint 27)
- PDF invoices (Sprint 27)
- Portal i18n (parent portal translations beyond locale routing)
- Google / Apple Pay via Stripe (deferred)
