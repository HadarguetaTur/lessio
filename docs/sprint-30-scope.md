# Sprint 30 — Revenue Integrity & Reliability

**Status:** 📝 Planned
**Depends on:** Sprint 29 complete (Google Login + Calendar)
**Source:** Full product review, 2026-06-11 (6-domain codebase audit)

**Goal:** Close every gap between "the product looks like it collects money" and "the product actually collects money, securely." Three revenue blockers (payment webhook spoofing, SaaS renewals never charging, past_due never locking), plus shipping the WhatsApp automations WIP and the highest-impact reliability fixes.

---

## Closed Decisions

- **Webhook verification strategy:** providers without HMAC support (Cardcom, PayPlus) are verified by a **server-to-server confirmation call** back to the provider API before any DB mutation — never by trusting the webhook body. Stripe is verified with the per-org `webhookSecret` from the decrypted payment config; verification moves from the sync registry interface into the route handler, after the org is resolved from the payment reference.
- **SaaS renewal is self-managed**, not Sumit-managed. A new daily Edge Function charges stored tokens via the existing `chargeSumitToken()` (`src/lib/saas/sumit.ts:229` — currently dead code). The `saas-subscription-checker` past_due marking stays as a safety net.
- **Decline policy:** 3 retry attempts over 7 days (day 0, 3, 7), WhatsApp + email notice to owner on each failure. After final failure → `status = 'past_due'`; after 7 more days in past_due → `read_only`. `isOrgSaasReadOnly()` is extended to cover stale `past_due`.
- **Receipt idempotency:** the atomic claim (`receipt_issued_at` guard) moves **before** the provider call — claim row first, call provider, roll back the claim on provider failure. A webhook retry that loses the claim race exits silently.
- **Rate limiting is DB-based** (sliding-window count on existing tables), no new infra (no Redis/Upstash) this sprint.
- **Out of scope (deferred, see bottom):** refunds, partial payments, full dunning, audit log, portal i18n.

---

## Story 1 — Payment Webhook Security 🔴

### 1a: Stripe signature verification (replaces the `return true` stub)
- `src/lib/payments/registry.ts:271-278` — remove stub; add optional async `verifyWebhookRequestAsync(headers, rawBody, paymentConfig)` to the registry entry interface
- `src/app/api/payments/[provider]/route.ts` — resolve org + decrypt `payment_config_encrypted` (existing `src/lib/payments/factory.ts` path) **before** mutation; call async verification with the per-org `webhookSecret`; on failure log + return 200 without mutating
- Stripe: implement `stripe.webhooks.constructEvent`-equivalent HMAC check (no new SDK needed — manual `t=`/`v1=` HMAC-SHA256 per Stripe spec)

### 1b: Cardcom + PayPlus server-side confirmation
- `src/lib/payments/cardcom.ts` / `payplus.ts` — add `confirmTransaction(reference, config)` that queries the provider API (Cardcom LowProfile indicator lookup / PayPlus transaction status) and returns the authoritative status
- Webhook route: for providers with no signature support, require `confirmTransaction` success before marking a charge paid

### 1c: Receipt issuance race fix
- `src/lib/receipts/issueReceiptForCharge.ts` — move the `.is('receipt_issued_at', null)` atomic claim to the **top** (claim with a sentinel timestamp, then call provider, then update with the real receipt data; clear the claim on provider error)

### 1d: Tests (currently zero in this domain)
- `src/lib/payments/*.test.ts` — parse/verify per provider: valid signature, invalid signature, replayed body, malformed body
- `src/app/api/payments/route.test.ts` — webhook E2E: spoofed payload must not mutate; duplicate webhook must not double-issue a receipt

### Files touched
`src/lib/payments/registry.ts`, `stripe.ts`, `cardcom.ts`, `payplus.ts`, `webhook-verify.ts`, `src/app/api/payments/[provider]/route.ts`, `src/lib/receipts/issueReceiptForCharge.ts`, new test files

---

## Story 2 — SaaS Renewal Engine ✅ (built 2026-09-02)

> **Shipped, with one deviation.** The charger runs as a Next.js internal
> route (`/api/internal/saas/renew`) driven by pg_cron, not as a Deno Edge
> Function: that runtime already owns the Sumit adapter, the email templates
> and the activation path, and mirroring all three into Deno would have
> doubled the money-handling code with no test coverage on the copy. The
> precedent is `automatic-lesson-completion` (commit `2eefa32`). Retry state
> lives in columns on `organization_subscriptions` rather than a
> `saas_renewal_attempts` table — history is already in `saas_invoices` once
> failed rows carry `failure_reason`.
>
> Also found and fixed here: the Sumit client had never run against the real
> API and every call used a guessed contract (`Succeed`/`ReturnValue` instead
> of `Status`/`Data`, `Identifier` instead of `ExternalIdentifier`, and a
> callback that read `Valid`/`ID` where Sumit sends `OG-PaymentID`). See
> decision #34.

### 2a: `saas-renewal-charger` Edge Function (new, daily cron)
- Finds `organization_subscriptions` with `status = 'active'`, `cancel_at_period_end = false`, `current_period_end < now`
- Charges the stored token via the Deno mirror of `chargeSumitToken` (add to `supabase/functions/_shared/`)
- Success → extend `current_period_end` by billing interval, insert `saas_invoice`, create Sumit document
- Decline → record attempt (new `saas_renewal_attempts` table or columns), notify owner (WhatsApp via `sendSmartMessage` + email), retry per the day-0/3/7 policy
- Register in `supabase/config.toml`
- Migration: `YYYYMMDDHHMMSS_saas_renewal_attempts.sql`

### 2b: `past_due` enforcement
- `src/lib/saas/subscriptions.ts:95-100` — `isOrgSaasReadOnly()` also returns true when `status = 'past_due'` and `current_period_end` is more than 7 days past
- Dashboard banner for `past_due` state ("התשלום נכשל — עדכן אמצעי תשלום") linking to `/account/billing`

### 2c: Cancel subscription flow
- `src/app/(dashboard)/account/billing/` — "בטל מנוי" action setting `cancel_at_period_end = true` (+ undo), confirmation dialog, status line showing the effective end date
- The existing checker (`saas-subscription-checker` step 2) already handles the downgrade — no cron change needed

### 2d: Production cutover (the item carried since Sprint 23)
- Execute the Sumit E2E staging checklist with real credentials: checkout → webhook → activation → invoice → token charge → renewal
- Set `NEXT_PUBLIC_ONBOARDING_PAID_CHECKOUT=sumit` in production; document in `docs/release-checklist.md`
- Resolve the dead-end: `/onboarding/pending-custom` — add superadmin queue view + notification so custom-plan inquiries get handled

### Files touched
`supabase/functions/saas-renewal-charger/` (new), `supabase/functions/_shared/sumit.ts` (new), `supabase/config.toml`, `src/lib/saas/subscriptions.ts`, `src/app/(dashboard)/account/billing/*`, new migration, `docs/release-checklist.md`

---

## Story 3 — Ship WhatsApp Automations (close the WIP) 🟠

- `supabase/functions/_shared/whatsapp.ts:88-92` — add `homework_assignment` (3 params) + `homework_graded` to `APPROVED_TEMPLATES`, matching `src/lib/whatsapp/registerTemplates.ts`
- `supabase/functions/_shared/templates.ts` — sync `MessageTemplateType` with the Node side (`homework_graded`, `ai_satisfaction_prompt`)
- Verify webhook respects all 5 automation toggles end-to-end (booking link, cancellation, balance, schedule, AI fallback) — add to webhook tests
- Apply migrations `20260513120000_add_whatsapp_waba_id.sql` + `20260514000001_automation_toggles.sql` to staging; verify Embedded Signup captures `waba_id` and `registerTemplatesForWABA` fires
- Commit the currently-uncommitted WIP as the story's deliverable

---

## Story 4 — Reliability Hardening 🟠

### 4a: Edge Function error visibility
- `supabase/functions/_shared/sentry.ts` (new) — minimal `captureException(err, context)` posting to the Sentry store API (Deno-compatible, no SDK)
- Wire into all 8 functions' catch blocks; env: `SENTRY_DSN` as a function secret

### 4b: Send/mark atomicity in crons
- `supabase/functions/homework-sender/index.ts:94-134` — only `markSent` after a successful send (failed sends retry on the next hourly run); add a `send_attempts` counter to stop after 3
- `lesson-reminders` / `payment-reminders` / `homework-reminders` — claim pattern: insert `notification_log` row with `status='pending'` **before** sending, update to `sent`/`failed` after; pending rows older than 1h are retryable. Prevents both duplicates and silent drops.

### 4c: Public endpoint rate limiting (DB sliding window)
- WhatsApp webhook: max 30 messages per phone per 5 min (count on `whatsapp_processed_messages`)
- Payment + Sumit webhooks: max 60 calls per provider per 5 min (lightweight `webhook_hits` table or in-route count)
- Over-limit → log warn + return 200 without processing (never 429 to Meta)

### 4d: Unknown `phone_number_id` observability
- `src/app/api/whatsapp/webhook/route.ts:157-180` — escalate to `console.error` + Sentry capture; superadmin in-app notification so a disconnected org gets noticed

---

## Story 5 — Dashboard CRUD Completions 🟡 (stretch)

Pattern is identical for each: add update server action (with `requireMutation`) + edit affordance in the existing component.

- **Edit teacher details** — `/teachers` has create/archive only; add edit sheet (mirror `GroupFormSheet` pattern)
- **Edit learning goal text** — `GoalsSection.tsx` allows status toggle only; add inline edit
- **Edit lesson note** — `/lessons/[id]` has add/delete only
- **Teacher cancels lesson from dashboard** — expose existing `executeCancellation()` (`src/lib/cancellation-flow/executeCancellation.ts`) via a teacher-shell action on the lesson, with charge-policy confirmation dialog (same UX as portal cancel)
- **`/subscriptions` page actions** — link each row to the student's detail sheet subscriptions tab (cheap fix for the dead-end; full standalone CRUD deferred)

---

## New env vars

```
SENTRY_DSN=            # Supabase function secret (Edge Functions error capture)
```

(Production must also set `NEXT_PUBLIC_ONBOARDING_PAID_CHECKOUT=sumit` — existing var, Story 2d.)

---

## Out of scope (Sprint 31 candidates)

- Refund / reversal flow at the payment-provider level
- Partial payments and balance tracking
- Full dunning ladder for *student* billing (org-level unpaid charges)
- Audit log table (who-did-what in multi-user orgs)
- Portal i18n (currently hardcoded Hebrew) + hardcoded strings in newer dashboard pages
- Lesson series editing (only full-series cancel exists)
- Teacher earnings / payroll report
- AI per-org cost cap
- Automated E2E suite (Playwright) replacing the manual staging checklist
