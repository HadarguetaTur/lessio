# Sprint 7 — WhatsApp Embedded Signup per Org

**Status:** Complete  
**Goal:** Every org connects its own WhatsApp number via Meta Embedded Signup. No shared number.

---

## Pre-Sprint Migration (Story 0 — landed before any Sprint 7 code)

**`supabase/migrations/20260325000001_lesson_students.sql`**

- `lessons`: added `lesson_type text CHECK ('individual','pair','group') DEFAULT 'individual'`, `max_students int NOT NULL DEFAULT 1`. Dropped `student_id`.
- `lesson_students`: new junction table `(id, lesson_id, student_id, status, created_at)` with RLS.
- `organizations`: added `group_pricing_mode text CHECK ('fixed','per_student') DEFAULT 'per_student'`.
- Existing `lessons.student_id` rows migrated → `lesson_students` before column drop.
- Updated RLS policies `students_teacher_read_linked` and `relationships_teacher_read_linked` to use `lesson_students` subquery.
- Updated `guard_teacher_lesson_update` trigger (removed `student_id` check).

**Application code updated:**

- `src/lib/booking/confirmBooking.ts` — inserts into `lesson_students` after lesson creation.
- `src/lib/lessons/index.ts` — `LESSON_SELECT` and `mapLesson` use `lesson_students` join.
- `src/lib/cancellation-flow/index.ts` — `getEligibleLessons` uses 2-step query via `lesson_students`.
- `src/lib/cancellation-flow/executeCancellation.ts` — student resolved from `lesson_students`.
- `src/lib/billing/createCharge.ts` — billing parent resolved from `lesson_students`.
- `src/app/(dashboard)/lessons/[id]/actions.ts` — `cancelLesson` resolves student from `lesson_students`.

---

## Sprint 7 Scope

### Story 1 — Schema

**`supabase/migrations/20260325000002_whatsapp_embedded_signup.sql`**

Added to `organizations`:
- `whatsapp_phone_number_id text UNIQUE` — Meta internal phone number ID, used for webhook routing.
- `whatsapp_access_token text` — AES-256-GCM encrypted Meta access token (plaintext never stored).

Legacy `whatsapp_number` + `whatsapp_token` columns kept for rollback safety; ignored after routing cutover.

---

### Story 2 — Token Encryption

**`src/lib/crypto/index.ts`** (new, server-only)

- `encryptToken(plaintext: string): string` — AES-256-GCM, 12-byte random IV, returns `iv:ciphertext:authTag` (base64).
- `decryptToken(encrypted: string): string` — decrypts and verifies GCM auth tag.
- Key: `WHATSAPP_TOKEN_ENCRYPTION_KEY` env var (32-byte hex / 64 hex chars).

---

### Story 3 — Owner WhatsApp Settings page

**`src/app/(dashboard)/settings/whatsapp/page.tsx`** (new)
- Owner-only (forbidden() for non-owner roles).
- Connected state: shows `phone_number_id`, Disconnect button.
- Disconnected state: Meta Embedded Signup button.

**`src/app/(dashboard)/settings/whatsapp/actions.ts`** (new)
- `saveWhatsAppConnection(formData)` — Zod-validated, owner-only. Exchanges Meta OAuth code → access token via Graph API, encrypts, persists to `organizations`.
- `disconnectWhatsApp(formData)` — owner-only. Nulls both `whatsapp_phone_number_id` and `whatsapp_access_token`.

**`src/app/(dashboard)/settings/whatsapp/EmbeddedSignupButton.tsx`** (new client component)
- Loads Meta JS SDK, triggers FB.login popup.
- Listens for `WA_EMBEDDED_SIGNUP / FINISH` message event, submits hidden form.

**`src/app/(dashboard)/settings/whatsapp/DisconnectButton.tsx`** (new client component)
- Form wrapper around `disconnectWhatsApp`.

New env vars: `META_APP_ID`, `META_APP_SECRET` (production-required).

---

### Story 4 — Webhook routing cutover

**`src/app/api/whatsapp/webhook/route.ts`**

- Org lookup changed: `eq('whatsapp_phone_number_id', msg.phoneNumberId)` instead of `eq('whatsapp_number', orgPhone)`.
- Access token: `decryptToken(org.whatsapp_access_token)` — no env var fallback; webhook silently drops messages from unconnected orgs (logs warning, returns 200 to Meta).

**`src/app/book/[token]/actions.ts`**

- `sendWhatsAppConfirmation` updated to use `org.whatsapp_phone_number_id` + `decryptToken(org.whatsapp_access_token)`.

---

### Story 5 — Settings navigation

**`src/components/dashboard/Sidebar.tsx`**

Added `{ href: '/settings/whatsapp', label: 'WhatsApp', icon: MessageCircle, roles: ['owner'] }`.

---

### Story 6 — New env vars

**`src/lib/env.ts`** — Added to `REQUIRED_IN_PRODUCTION`:
- `WHATSAPP_TOKEN_ENCRYPTION_KEY`
- `META_APP_ID`
- `META_APP_SECRET`

**`.env.local.example`** — Documented all three new variables with generation instructions.

---

## Architecture After Sprint 7

```
Meta Cloud API
  → POST /api/whatsapp/webhook
    → lookup org by whatsapp_phone_number_id
    → decryptToken(org.whatsapp_access_token)
    → route to booking / cancellation flow

Owner Dashboard /settings/whatsapp
  → Meta Embedded Signup popup
    → JS SDK message event (phone_number_id + code)
      → saveWhatsAppConnection server action
        → Meta Graph API code → access_token
        → encryptToken → organizations.whatsapp_access_token
```

---

## What is NOT in Sprint 7

- WhatsApp bot platform / flow router / conversation threads
- Outbound webhooks for Make/Zapier
- Tenant feature flags
- Read-only WhatsApp flows (upcoming lessons, open charges)
- Google Calendar sync
- Homework module
- Real payments (Sprint 8)
