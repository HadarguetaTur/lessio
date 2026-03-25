# LESSIO — Sprint 6 Secrets and Access Audit

**Ticket:** DEV-84
**Date:** 2026-03-25
**Sprint:** 6 — Production Readiness

---

## Purpose

Verify that high-risk secrets and privileged access paths are server-only and cannot reach client bundles.
This is a pre-staging gate. No new features were added. Only one gap was found and fixed.

---

## Audit Checklist

### 1. SUPABASE_SERVICE_ROLE_KEY

| Check | Result |
|---|---|
| Defined only in `src/lib/supabase/service-role.ts` | ✅ PASS |
| Not referenced raw in any other file | ✅ PASS |
| All consumer files are server-side (`'use server'` or route handlers) | ✅ PASS |
| Not reachable from any client component at runtime | ✅ PASS |

**Method:** `grep -r SUPABASE_SERVICE_ROLE_KEY src/` — single occurrence in `service-role.ts`.
All files importing `createServiceRoleClient` are verified server-side by `'use server'` directive or route handler context.

---

### 2. BOOKING_JWT_SECRET

| Check | Result |
|---|---|
| Defined only inside `src/lib/jwt/index.ts` (via `process.env`) | ✅ PASS |
| Not referenced raw in any other file | ✅ PASS |
| `src/app/book/[token]/page.tsx` — Server Component, no `'use client'` | ✅ PASS |
| `src/app/book/[token]/actions.ts` — `'use server'` directive | ✅ PASS |
| `src/app/api/whatsapp/webhook/route.ts` — route handler (server-only) | ✅ PASS |
| `src/components/booking/BookingFlow.tsx` — `'use client'` but uses `import type` only | ✅ PASS |

**Note on BookingFlow.tsx:** This `'use client'` component imports `type BookingTokenPayload from '@/lib/jwt'`.
`import type` is erased entirely by the TypeScript compiler — no runtime code from `@/lib/jwt` is
bundled into the client. The `BOOKING_JWT_SECRET` is not exposed.

---

### 3. Service Role Isolation

| Check | Result |
|---|---|
| `createServiceRoleClient` defined only in `src/lib/supabase/service-role.ts` | ✅ PASS |
| No other file defines a Supabase client using the service role key | ✅ PASS |
| All import sites are server-only modules or route handlers | ✅ PASS |

**Approved import sites (all server-only):**
- `src/lib/booking/*`
- `src/lib/billing/*`
- `src/lib/cancellation-flow/*`
- `src/lib/leads/`
- `src/lib/payment-request/`
- `src/lib/charges/`
- `src/lib/lessons/`
- `src/app/**/actions.ts` (all have `'use server'`)
- `src/app/api/whatsapp/webhook/route.ts`

---

### 4. WhatsApp Webhook Signature Enforcement

| Check | Result |
|---|---|
| Requests without `X-Hub-Signature-256` return `401` | ✅ PASS (fixed) |
| Requests with invalid signature return `401` | ✅ PASS (fixed) |
| Signature validation uses constant-time comparison | ✅ PASS |
| Signature validation runs before any trusted processing | ✅ PASS |
| Production with missing `WHATSAPP_APP_SECRET` returns `500` | ✅ PASS (misconfiguration, not auth failure) |
| Dev without `WHATSAPP_APP_SECRET` logs a warning and continues | ✅ PASS (intentional dev-only path) |

**Gap found and fixed:** Prior to this audit the webhook returned `403` for invalid/missing signatures.
The spec (Decision #22, `security.md`) requires `401`. Fixed in `src/app/api/whatsapp/webhook/route.ts`.

---

## Findings Summary

| Severity | Item | Status |
|---|---|---|
| HIGH | Webhook returned 403 instead of 401 for invalid/missing `X-Hub-Signature-256` | ✅ Fixed |
| LOW | `service-role.ts` comment listed only `src/lib/booking/*` as approved import scope, understating actual approved usage | ✅ Fixed (comment updated) |

No client-side exposure of `SUPABASE_SERVICE_ROLE_KEY` or `BOOKING_JWT_SECRET` was found.

---

## Manual Verification Steps (to run on staging)

1. Send a POST to `/api/whatsapp/webhook` with no `X-Hub-Signature-256` header → expect `401`.
2. Send a POST with a malformed or wrong `X-Hub-Signature-256` → expect `401`.
3. Run Next.js build (`next build`) and inspect the browser bundle — neither secret name should appear.
4. Confirm `NEXT_PUBLIC_*` variables are the only env vars visible client-side in the bundle.

---

## Sprint 6 Secret Audit Gate

- [x] `SUPABASE_SERVICE_ROLE_KEY` not in any client bundle
- [x] `BOOKING_JWT_SECRET` not in any client bundle
- [x] Service role import isolated to `src/lib/supabase/service-role.ts`
- [x] Webhook returns `401` for invalid/missing signature
- [x] Audit findings documented
- [ ] Manual staging verification (pending staging deploy — DEV-106/DEV-109)
