# LESSIO — Release Checklist (Sprint 6)

**Ticket:** DEV-107
**Sprint:** 6 — Production Readiness

This checklist must be completed in full before any production deployment.
Nothing ships to production without passing staging first (Decision #24).

---

## Phase 1 — Pre-Deploy: Staging Readiness

### 1.1 Environment

- [ ] Staging Supabase project is separate from dev and prod
- [ ] All required env vars are set in Vercel staging environment:
  - [ ] `NEXT_PUBLIC_SUPABASE_URL`
  - [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - [ ] `SUPABASE_SERVICE_ROLE_KEY`
  - [ ] `BOOKING_JWT_SECRET`
  - [ ] `WHATSAPP_APP_SECRET`
  - [ ] `WHATSAPP_VERIFY_TOKEN`
  - [ ] `NEXT_PUBLIC_APP_URL` (set to staging URL)
  - [ ] `WHATSAPP_TOKEN_ENCRYPTION_KEY` (Sprint 7)
  - [ ] `META_APP_ID` (Sprint 7)
  - [ ] `META_APP_SECRET` (Sprint 7)
  - [ ] `PAYMENT_CONFIG_ENCRYPTION_KEY` (Sprint 8)
  - [ ] `PORTAL_JWT_SECRET` (Sprint 13 — parent portal session cookies)
  - [ ] `SUPPORT_SESSION_SECRET` (Sprint 18 — superadmin support mode cookie)
  - [ ] `OPENAI_API_KEY` (Sprint 19 — AI assistant fallback)
  - [ ] `SUMIT_WEBHOOK_SECRET` (Sprint 22 — SaaS billing webhook HMAC)
  - [ ] `SUMIT_COMPANY_ID` (Sprint 23 — SaaS billing provider)
  - [ ] `SUMIT_API_KEY` (Sprint 23 — SaaS billing provider)
  - [ ] `AI_CONFIG_ENCRYPTION_KEY` (Sprint 25 — per-org AI provider credential encryption)
  - [ ] `RESEND_API_KEY` (Sprint 25 — email delivery)
  - [ ] `RESEND_FROM_EMAIL` (Sprint 25 — verified sender email)
  - [ ] `NEXT_PUBLIC_ONBOARDING_PAID_CHECKOUT` (Sprint 22 — SaaS checkout mode)
  - [ ] `NEXT_PUBLIC_SENTRY_DSN` (Sprint 28 — error monitoring)
- [ ] App starts cleanly on staging (no startup errors from env validation)

### 1.2 Migrations

- [ ] All migration files applied to staging in filename order
- [ ] Schema verified against `/docs/schema.md` after migration
- [ ] No unexpected errors in Supabase staging logs

### 1.3 Test suite

- [ ] `npx vitest run` — all 287+ tests pass on the branch being deployed
- [ ] No skipped or failing tests

---

## Phase 2 — Staging E2E Smoke Tests

All 12 scenarios must pass on staging. Mark each as Pass / Fail / Blocked.
Also verify that all crons are registered in Supabase Dashboard: `lesson-reminders`, `payment-reminders`, `homework-reminders`, `saas-subscription-checker`, `saas-renewal-reminder`, `data-retention`, `homework-sender`, `notification-cleanup`.

| # | Scenario | Steps | Result |
|---|---|---|---|
| 1 | **Booking E2E** | Send booking intent via WhatsApp → receive link → complete booking WebView → lesson created in DB | |
| 2 | **Lesson update** | Owner/admin marks lesson as `completed` from dashboard → charge created → appears in charges list | |
| 3 | **Dashboard cancellation** | Owner/admin cancels a lesson → cancellation charge calculated → charge appears | |
| 4 | **Charges** | Completed lesson → charge pending → mark as paid → status updated | |
| 5 | **WhatsApp cancellation** | Parent sends "ביטול" via WhatsApp → lesson list sent → parent selects lesson → cancellation confirmed → charge applied | |
| 6 | **Payment request** | Owner configures Cardcom in `/settings/payment` → sends payment request → WhatsApp with Cardcom link sent → `payment_link` + `payment_reference` saved on charge | |
| 7 | **WhatsApp Embedded Signup** | Owner navigates `/settings/whatsapp` → clicks connect → completes Meta Embedded Signup → `phone_number_id` + encrypted token saved to DB | requires HTTPS staging URL |
| 8 | **Parent portal cancel** | Parent logs into portal → cancels a lesson → cancellation charge calculated → confirmation shown | |
| 9 | **PDF invoice download** | Approve monthly billing → PDF generated → download button active in billing list | |
| 10 | **Quota exceeded** | Import 150+ students on basic plan (100 limit) → quota error boundary with upgrade CTA | |
| 11 | **Accounting CSV** | Export from revenue report → CSV with all expected columns downloads | |
| 12 | **WhatsApp homework grading** | Teacher grades homework → student receives WhatsApp notification | |

**Staging gate:** All 12 must pass. If any fail, fix the regression before proceeding.

---

## Phase 3 — Security Verification (on staging)

- [ ] POST to `/api/whatsapp/webhook` with no `X-Hub-Signature-256` → returns `401`
- [ ] POST to `/api/whatsapp/webhook` with invalid signature → returns `401`
- [ ] Unauthenticated GET to `/dashboard` → redirects to `/login`
- [ ] Teacher cannot access billing or other teachers' lessons (verify in browser as teacher user)

---

## Phase 4 — Production Deploy

### 4.1 Environment

- [ ] All required env vars set in Vercel production environment (separate values from staging)
  - [ ] `NEXT_PUBLIC_SUPABASE_URL` — production Supabase project
  - [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` — production Supabase project
  - [ ] `SUPABASE_SERVICE_ROLE_KEY` — production Supabase project
  - [ ] `BOOKING_JWT_SECRET` — fresh value, not reused from staging
  - [ ] `WHATSAPP_APP_SECRET` — production Meta app secret
  - [ ] `WHATSAPP_VERIFY_TOKEN` — matches what is registered in Meta webhook settings
  - [ ] `NEXT_PUBLIC_APP_URL` — production URL
  - [ ] `WHATSAPP_TOKEN_ENCRYPTION_KEY` — 32-byte hex, production value (Sprint 7)
  - [ ] `META_APP_ID` — production Meta app (Sprint 7)
  - [ ] `META_APP_SECRET` — production Meta app secret (Sprint 7)
  - [ ] `PAYMENT_CONFIG_ENCRYPTION_KEY` — 32-byte hex, production value (Sprint 8)
  - [ ] `PORTAL_JWT_SECRET` — fresh value, not reused from staging (Sprint 13)
  - [ ] `SUPPORT_SESSION_SECRET` — fresh value, not reused from staging (Sprint 18)
  - [ ] `OPENAI_API_KEY` — production OpenAI key (Sprint 19)
  - [ ] `SUMIT_WEBHOOK_SECRET` — matches what is registered in Sumit webhook settings (Sprint 22)
  - [ ] `SUMIT_COMPANY_ID` — production Sumit company ID (Sprint 23)
  - [ ] `SUMIT_API_KEY` — production Sumit API key (Sprint 23)
  - [ ] `AI_CONFIG_ENCRYPTION_KEY` — 32-byte hex, production value (Sprint 25)
  - [ ] `RESEND_API_KEY` — production Resend API key (Sprint 25)
  - [ ] `RESEND_FROM_EMAIL` — verified sender email on production domain (Sprint 25)
  - [ ] `NEXT_PUBLIC_ONBOARDING_PAID_CHECKOUT` — `sumit` for live billing (Sprint 22)
  - [ ] `NEXT_PUBLIC_SENTRY_DSN` — production Sentry DSN (Sprint 28)

### 4.2 Migrations

- [ ] All migration files applied to production Supabase project in filename order
- [ ] Schema verified after migration (spot-check key tables)
- [ ] Supabase production logs show no errors

### 4.3 Deploy

- [ ] Vercel production deployment triggered from the release branch/commit
- [ ] Vercel build completes without errors
- [ ] Production URL loads without startup errors

---

## Phase 5 — Post-Deploy Production Smoke Tests

| Check | Result |
|---|---|
| App loads at production URL | |
| Login page accessible at `/login` | |
| Unauthenticated `/dashboard` redirects to `/login` | |
| Owner can log in and see the dashboard | |
| Teacher can log in and see only their own schedule | |
| WhatsApp webhook verification challenge passes (GET `/api/whatsapp/webhook`) | |
| Booking link received via WhatsApp opens the WebView correctly | |
| Parent portal: OTP login works on mobile | |
| Monthly billing generate → approve → download invoice PDF | |
| SaaS upgrade E2E: `/account/billing` → Sumit `beginredirect` page → pay → redirect-return confirms (server-to-server) → subscription `active` + invoice recorded | |
| Sumit webhook safety net: closing the tab before redirect still activates via `/api/sumit/webhook` (no duplicate invoice) | |
| Sentry receives test error (check Sentry dashboard) | |

---

## Phase 6 — Rollback Plan

If any critical issue is found after production deploy:

1. **Revert Vercel deployment** — use Vercel dashboard → Deployments → redeploy the previous successful build
2. **Assess migration impact** — if the schema change is safe to leave (additive column), leave it; code rollback is sufficient
3. **If migration must be reversed** — write a corrective migration and apply it as described in `/docs/migration-guide.md`
4. **Notify** — document what failed, what was rolled back, and what the fix plan is

---

## Release Sign-Off

Before go-live, confirm:

- [ ] All Phase 1–5 checklist items completed
- [ ] Data Recovery Playbook reviewed (`/docs/sprint-6-scope.md` § Data Recovery Playbook Baseline)
- [ ] First customer onboarding checklist exists (`/docs/first-customer.md`)
- [ ] Owner has been briefed on support expectations for the pilot

**Release approved by:** _______________  **Date:** _______________
