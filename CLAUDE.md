# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

---

## Development Commands

```bash
# Local dev server
npm run dev

# Build (also validates env vars at startup)
npm run build

# Lint
npm run lint

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

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
- Dashboard (`/app/(dashboard)/`): Supabase Auth session, checked via `src/middleware.ts` + `src/proxy.ts`
- Booking WebView (`/book/[token]`): signed JWT via `src/lib/jwt/`
- Parent Portal (`/portal/[orgId]/`): phone OTP → httpOnly cookie JWT via `src/lib/portal/`

**Server Action pattern:**
All mutations go through Next.js Server Actions. Actions call `src/lib/auth/session.ts` to resolve the current user + org, then call lib functions with `serviceRole` client. Never pass role from client.

**WhatsApp webhook flow (`/api/whatsapp/webhook`):**
1. Verify `X-Hub-Signature-256` → 401 if invalid
2. Look up org by `phone_number_id`
3. Decrypt `whatsapp_access_token` via `src/lib/crypto/`
4. Dispatch to intent handler (cancellation state machine → `src/lib/cancellation-flow/`)

**Edge Functions (Deno, not Node):**
Live in `supabase/functions/`. Shared utilities in `supabase/functions/_shared/`. Use `SubtleCrypto` for AES-256-GCM (not Node `crypto`). Crons registered in `supabase/config.toml`.

**Migration discipline:**
All schema changes are forward-only SQL files in `supabase/migrations/`. Filename format: `YYYYMMDDHHMMSS_<description>.sql`. Never edit an applied migration.

**`redirect()` rule:**
Never call `redirect()` inside a `try/catch` block. Place `redirect()` after the try/catch, or rethrow `isRedirectError(err)` explicitly. Violating this silently swallows the redirect.

**Zod version:**
This project uses **Zod 4** (`zod@^4.x`). The API differs from Zod 3 — use `z.string().min(1)` not `.nonempty()`, `z.object({}).strict()` not `.strict()` chained after parse, etc.
