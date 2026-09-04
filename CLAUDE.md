# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

---

## Tech Stack

Next.js 16 (App Router) · React 19 · TypeScript · Supabase (Postgres + Auth + Edge Functions + Storage) · Tailwind CSS v4 · shadcn/ui (Radix primitives) · Luxon (dates) · next-intl (i18n) · Vitest (tests) · Zod 4 (validation)

---

## Development Commands

```bash
# Local dev server
npm run dev

# Build (also validates env vars at startup)
npm run build

# Lint
npm run lint

# Type-check (no emit)
npx tsc --noEmit

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run a single test file
npx vitest run src/lib/billing/calculateCancellationCharge.test.ts

# Run tests matching a pattern
npx vitest run --reporter=verbose -t "pattern"

# Supabase local stack
npx supabase start
npx supabase stop

# Apply migrations to local DB
npx supabase db reset

# Deploy an Edge Function
npx supabase functions deploy <function-name>
```

## Path Alias

`@/` maps to `src/` (configured in both `tsconfig.json` and `vitest.config.ts`).

## Key Architectural Notes

**Three auth contexts — never mix them:**
- Dashboard (`/app/(dashboard)/`): Supabase Auth session, checked via `src/proxy.ts` (Next.js middleware entry point)
- Booking WebView (`/book/[token]`): signed JWT via `src/lib/jwt/`
- Parent Portal (`/portal/[orgId]/`): phone OTP → httpOnly cookie JWT via `src/lib/portal/`

**Server Action pattern:**
All mutations go through Next.js Server Actions. Actions call `src/lib/auth/session.ts` to resolve the current user + org, then call lib functions with `serviceRole` client. Never pass role from client.

**WhatsApp webhook flow (`/api/whatsapp/webhook`):**
1. Verify `X-Hub-Signature-256` → 401 if invalid
2. Look up org by `phone_number_id`
3. Decrypt `whatsapp_access_token` via `src/lib/crypto/`
4. Dispatch to intent handler (cancellation state machine → `src/lib/cancellation-flow/`)

**Staff copilot action registry (decision #26, amendments 2026-08-30 / 2026-09-03):**
Staff (owner/admin) write actions over WhatsApp go through `src/lib/ai-assistant/copilotActions/` — the AI only classifies `{action, params}`; a proposal is stored in `copilot_sessions` and executed deterministically only after a confirm tap (`cp:c:<sessionId>` buttons). New secretary actions are added as a `CopilotActionDef` in that registry plus a prompt line in `src/lib/ai-assistant/copilot.ts` — never as free-form AI execution.

**Edge Functions (Deno, not Node):**
Live in `supabase/functions/`. Shared utilities in `supabase/functions/_shared/`. Use `SubtleCrypto` for AES-256-GCM (not Node `crypto`). Crons registered in `supabase/config.toml`.

**Migration discipline:**
All schema changes are forward-only SQL files in `supabase/migrations/`. Filename format: `YYYYMMDDHHMMSS_<description>.sql`. Never edit an applied migration.

**`redirect()` rule:**
Never call `redirect()` inside a `try/catch` block. Place `redirect()` after the try/catch, or rethrow `isRedirectError(err)` explicitly. Violating this silently swallows the redirect.

**Zod version:**
This project uses **Zod 4** (`zod@^4.x`). The API differs from Zod 3 — use `z.string().min(1)` not `.nonempty()`, `z.object({}).strict()` not `.strict()` chained after parse, etc.

**Date/time library:**
Use **Luxon** (`DateTime`, `Interval`, etc.) for all date/time logic. Do not introduce `dayjs`, `date-fns`, or raw `Date` arithmetic. Dates are stored UTC in the DB and displayed in org timezone.

**UI components:**
Use existing shadcn/ui components from `src/components/ui/` and Tailwind v4 utility classes. Do not add alternative component libraries.

**Server Actions body size:**
`next.config.ts` sets `serverActions.bodySizeLimit: '11mb'` for homework file uploads. Keep this in mind when adding upload-related actions.

**Test file convention:**
Tests are co-located with source as `*.test.ts` (e.g. `src/lib/billing/calculateCancellationCharge.test.ts`). The vitest config also includes `__tests__/**/*.test.ts` as a fallback pattern.

**Env var validation:**
All required env vars are declared in `src/lib/env.ts` (`ALWAYS_REQUIRED` vs `REQUIRED_IN_PRODUCTION`). Add new env vars there — they are validated at startup and fail fast with a named error if missing.

**Public route bypass:**
`src/proxy.ts` holds the list of path prefixes that bypass Supabase Auth checks. When adding a new unauthenticated route (webhooks, portal, public APIs), add its prefix there or requests will get a 401.

**Multi-tenant isolation:**
`org_id` is always resolved server-side from the authenticated session via `src/lib/auth/session.ts`. It is never accepted from the client. All DB queries are scoped to the resolved org — treat any client-supplied `org_id` as untrusted.

**RBAC roles and mutation guard:**
Four roles: `owner`, `admin`, `teacher`, `superadmin`. Superadmins have no `org_id` and use a separate shell at `/app/(admin)/admin/` with `requireSuperAdminSession()`. Org users (owner/admin/teacher) use `getSession()` (aliased as `requireDashboardSession()`). Every mutating Server Action must call `requireMutation(session)` immediately after `getSession()` — this blocks writes while a superadmin is in support mode (read-only).

**WhatsApp message send pattern:**
All outbound WhatsApp messages go through `resolveTemplate(orgId, templateType, vars, locale)` + `sendTextMessage(...)`, or `sendSmartMessage({...})` when the 24h session window may be closed. Never call old send helpers (all are deleted since Sprint 17). Template types are defined in `src/lib/whatsapp/templates.ts`. The same template resolver is mirrored for Deno Edge Functions in `supabase/functions/_shared/templates.ts` — `DEFAULT_TEMPLATES` must stay byte-identical in both files.

**Bilingual bot (he/en):**
The bot replies in the recipient's language. `resolveRecipientLocale({stored, detected, orgDefault})` in `src/lib/i18n/locale.ts` decides: a language signal in the message being answered wins, then `parents.preferred_locale`, then `organizations.default_locale`. `detectLocaleFromText()` returns `null` for text with no letters (a bare "2" picking a lesson from a numbered list) so those never flip a parent's stored language. The webhook persists the detected language on `parents` fire-and-forget.

`DEFAULT_TEMPLATES` is keyed `Record<AppLocale, Record<MessageTemplateType, string>>`, and `message_templates` is unique on `(organization_id, type, locale)` so orgs customise each language separately. Strings that are NOT org-customisable — fixed replies and the fragments spliced into template variables (`charge_lines`, `lesson_lines`, `due_line`, `charge_line`) — live in `src/lib/whatsapp/strings.ts` (Deno subset: `supabase/functions/_shared/botStrings.ts`). Splicing a raw Hebrew fragment into an English body is the easy mistake here; always go through `botString(key, locale)`.

Meta-approved templates (used outside the 24h window) are registered per language as `lessio_<type>_<lang>_v2` and looked up with `getApprovedTemplate(type, locale)`. When a language has no approved template, fall back to the Hebrew one — never to plain text, which fails with error 131047 outside the window. Editing an approved template resets it to PENDING at Meta, so new copy ships under a new name.

**Superadmin support mode:**
A superadmin can impersonate an org via a short-lived JWT cookie (30-min TTL, `src/lib/support-session/`). While in support mode, `getSession()` returns the org's data with `isSupportMode: true`. Mutations are blocked by `requireMutation()`. The support mode banner is rendered in `/app/(dashboard)/layout.tsx`.

**i18n (next-intl):**
Locale is stored as a cookie named `locale` (read in `src/i18n/request.ts`) and optionally in `profiles.preferred_locale`. Parents have their own `parents.preferred_locale` for the WhatsApp bot, and orgs a `organizations.default_locale` fallback. Translation strings live in `messages/he.json` and `messages/en.json`. Server components use `getTranslations()`, client components use `useTranslations()`. The locale config is in `src/i18n/request.ts`. Dashboard layout sets `dir` (rtl/ltr) dynamically from the locale. Currency formatting is locale-aware via `src/lib/i18n/formatCurrency.ts`.

**Monthly billing engine (`src/lib/billing/monthly/`):**
`buildStudentMonth(studentId, month, orgId)` computes a student's bill from subscriptions + per-lesson charges + cancellation events. `syncMonthlyCharge(...)` is idempotent — call it to upsert the charge record for a billing period. The workflow is: generate → approve → send WhatsApp payment request → mark paid. Approval and send are separate Server Actions in `src/app/(dashboard)/billing/actions.ts`.

**Payment and receipt provider abstraction:**
`src/lib/payments/factory.ts` decrypts `payment_config_encrypted` and returns the correct `PaymentProvider` (Cardcom, PayPlus, Bit, PayBox, Stripe, Grow). `src/lib/receipts/factory.ts` does the same for `receipt_config_encrypted` → `ReceiptProvider` (Green Invoice). Always go through the factory; never instantiate adapters directly.

**Server Action prop rule:**
UI components that invoke server actions must receive the action as a prop — never import server actions directly inside shared UI components. This prevents cross-context contamination between dashboard, admin, and portal shells.

**SaaS platform layer (distinct from org-level billing):**
Organizations themselves are tenants on the Lessio SaaS platform. Platform billing (plan selection, payment for Lessio itself) lives in `src/lib/saas/` and `src/app/(dashboard)/subscriptions/`. This is entirely separate from the org-level billing engine (`src/lib/billing/monthly/`) that bills *students*. The superadmin shell (`/admin/`) manages the platform; org owners manage their own org's student billing.

The SaaS billing provider is **Sumit** (`src/lib/saas/sumit.ts`, parsing in `sumitParse.ts`). Credentials (`SUMIT_COMPANY_ID`, `SUMIT_API_KEY`) are platform-level env vars (always required).

**Sumit's response envelope is `{ Status, UserErrorMessage, TechnicalErrorDetails, Data }`** where Status is `0` Success / `1` BusinessError / `2` TechnicalError — there is no `Succeed` and no `ReturnValue`. Its hosted checkout returns the customer with `OG-PaymentID`, `OG-CustomerID` and `OG-ExternalIdentifier` appended to the URL. Verify any field name against `https://api.sumit.co.il/swagger/v1/swagger.json`, never against older code: the original client was written to a guessed contract and silently treated every decline as a success.

**The money path** (decision #34): checkout → the customer returns → `completeCheckoutReturn` (`src/lib/saas/checkoutReturn.ts`) looks the payment up at Sumit and `evaluateCheckoutBinding` decides whether it may activate — reference match, payment id not already used, not dated before the checkout, customer match, amount covers the plan. Renewals are ours, not a Sumit standing order: `/api/internal/saas/renew` (pg_cron via `scripts/setup-crons.sql`) charges the stored token with a 0/3/7-day retry ladder. `/api/sumit/webhook` is a non-authoritative Sumit UI trigger; the daily reconciliation in the same cron is the real safety net. Internal cron routes authenticate with a bearer token whose SHA-256 is in env (`src/lib/cron/auth.ts`) and are in the `proxy.ts` bypass list.

**A lapsed org is read-only, not locked out.** `requireMutation` refuses writes for a lapsed subscription (the flag is resolved once in `getSession`), so a new server action is covered by default; reading, exporting, support and `/account/billing` stay reachable. Pass `{ allowWhenLapsed: true }` only for actions a locked-out owner must still perform.

`SUMIT_CHECKOUT_MOCK=1` simulates checkout locally — it must never be set in production.

**Teacher sub-shell (`/teacher/`):**
Teachers access a scoped subset of the dashboard: `/teacher/schedule`, `/teacher/new-lesson`, `/teacher/dashboard`, `/teacher/reports`. These share the same Supabase Auth session but data queries are filtered by the authenticated teacher's `teacher_id`. Teachers cannot access billing, students, or parents pages.

**Student groups:**
`student_groups` and `student_group_members` tables allow grouping students for shared pricing. Groups are managed via `GroupFormSheet` in the students page. The billing engine reads group membership when computing `price_per_student` for group lessons.

**Onboarding wizard:**
New orgs are redirected to `/onboarding` after signup if `organizations.onboarding_completed` is false. The wizard steps: Welcome → Teachers → Settings → Import Students → Import Lessons → Complete. The import flow (`src/components/import/`) is reused inside onboarding and standalone. After completing onboarding, `onboarding_completed` is set to `true` and the org is redirected to `/dashboard`.

**PDF Invoice generation (Sprint 27):**
`src/lib/billing/invoices/` generates PDF invoices using `@react-pdf/renderer` (Heebo font for Hebrew RTL). Invoice numbers are sequential per-org per-year via `invoice_counters` table (atomic increment). PDFs are stored in `invoices` Supabase Storage bucket. Invoice generation fires on billing approval (fire-and-forget). Credit notes (חשבוניות זיכוי) follow the same pattern with `CR-YYYY-NNNN` numbering.

**Receipt provider document types (Sprint 27):**
`ReceiptProvider.issueReceipt()` accepts optional `documentType: 'receipt' | 'tax_invoice'`, `vatAmount`, and `customerTaxId`. iCount: doctype 300 (tax invoice) / 400 (receipt) / 330 (credit note). Green Invoice: type 305 / 320 / 330. Sumit: receipts only. Org setting `receipt_document_type` on organizations table controls the default.

**Quota enforcement (Sprint 27):**
`requireQuotaCapacity(orgId, 'students' | 'lessons_monthly')` from `src/lib/saas/quota.ts` — checks current usage against `saas_plans.students_quota` / `lessons_monthly_quota`. Throws `QuotaExceededError` which is caught by `/app/(dashboard)/error.tsx` error boundary → upgrade card. Called in `createStudentAction`, `createLessonAction`, and bulk import.

**Feature gate enforcement (Sprint 27 hardening):**
`requireFeature(orgId, feature)` must be called in every plan-gated server action — not just UI sidebar filtering. Never inside try/catch (uses `redirect()`). All gated actions audited and enforced since Sprint 27.
