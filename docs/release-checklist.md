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
  - [ ] `WHATSAPP_ACCESS_TOKEN`
  - [ ] `WHATSAPP_PHONE_NUMBER_ID`
  - [ ] `NEXT_PUBLIC_APP_URL` (set to staging URL)
- [ ] App starts cleanly on staging (no startup errors from env validation)

### 1.2 Migrations

- [ ] All migration files applied to staging in filename order
- [ ] Schema verified against `/docs/schema.md` after migration
- [ ] No unexpected errors in Supabase staging logs

### 1.3 Test suite

- [ ] `npx vitest run` — all 205+ tests pass on the branch being deployed
- [ ] No skipped or failing tests

---

## Phase 2 — Staging E2E Smoke Tests

All 6 scenarios must pass on staging. Mark each as Pass / Fail / Blocked.

| # | Scenario | Steps | Result |
|---|---|---|---|
| 1 | **Booking E2E** | Send booking intent via WhatsApp → receive link → complete booking WebView → lesson created in DB | |
| 2 | **Lesson update** | Owner/admin marks lesson as `completed` from dashboard → charge created → appears in charges list | |
| 3 | **Dashboard cancellation** | Owner/admin cancels a lesson → cancellation charge calculated → charge appears | |
| 4 | **Charges** | Completed lesson → charge pending → mark as paid → status updated | |
| 5 | **WhatsApp cancellation** | Parent sends "ביטול" via WhatsApp → lesson list sent → parent selects lesson → cancellation confirmed → charge applied | |
| 6 | **Payment request** | Owner/admin sends payment request via dashboard → WhatsApp message sent → `sent_at` logged on charges | |

**Staging gate:** All 6 must pass. If any fail, fix the regression before proceeding.

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
  - [ ] `WHATSAPP_ACCESS_TOKEN` — production token
  - [ ] `WHATSAPP_PHONE_NUMBER_ID` — production phone number ID
  - [ ] `NEXT_PUBLIC_APP_URL` — production URL

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
