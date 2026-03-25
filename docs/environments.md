# LESSIO — Environment Separation and Configuration (Sprint 6)

**Ticket:** DEV-106
**Sprint:** 6 — Production Readiness

---

## Environments

LESSIO uses three environments:

| Environment | Purpose | Supabase Project | Vercel |
|---|---|---|---|
| `dev` | Local development | Separate dev project | Not deployed |
| `staging` | Pre-production QA | Separate staging project | Staging deployment |
| `prod` | Live production | Production project | Production deployment |

Each environment uses a **separate Supabase project** to guarantee data isolation.
Do not share Supabase projects between environments.

---

## Required Environment Variables

### Always required (every environment)

| Variable | Where to find it | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL | Public — safe in browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon key | Public — safe in browser |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → service_role key | **Server-only. Never expose.** |
| `BOOKING_JWT_SECRET` | Generate: `openssl rand -base64 32` | **Server-only. Never expose.** |

### Required in production only

| Variable | Where to find it | Notes |
|---|---|---|
| `WHATSAPP_APP_SECRET` | Meta Developer Console → App Settings → App Secret | **Server-only. Never expose.** |
| `WHATSAPP_VERIFY_TOKEN` | Any strong random value you define when registering the webhook | Server-only |

### Optional (have defaults or per-org fallbacks)

| Variable | Default behavior | Notes |
|---|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Falls back to org's `whatsapp_token` column | Required if org-level token not set |
| `WHATSAPP_PHONE_NUMBER_ID` | Falls back to webhook message `phone_number_id` | Required if org-level ID not set |
| `NEXT_PUBLIC_APP_URL` | Inferred from request origin in webhook | Set explicitly in staging and prod |

---

## Startup Validation

Required env vars are validated at server startup in `next.config.ts` via `src/lib/env.ts`.

If any required var is missing, the server refuses to start with a named error:

```
[env] Missing required environment variables:
  - SUPABASE_SERVICE_ROLE_KEY
  - BOOKING_JWT_SECRET

See .env.local.example for setup instructions.
```

This prevents silent runtime failures from missing config.

Validation is skipped in `NODE_ENV=test` environments — test runners provide their own mocks.

---

## Per-Environment Setup

### dev

1. Copy `.env.local.example` to `.env.local`
2. Fill in values from your **dev** Supabase project
3. `WHATSAPP_APP_SECRET` and `WHATSAPP_VERIFY_TOKEN` are optional in dev (webhook signature check is bypassed with a console warning)
4. Run `npx supabase db push` or apply migrations manually against the dev project

### staging

1. Set all **Always required** vars in Vercel → Project → Environment Variables → Preview
2. Set `WHATSAPP_APP_SECRET` and `WHATSAPP_VERIFY_TOKEN` for realistic E2E testing
3. Set `NEXT_PUBLIC_APP_URL` to the staging Vercel URL
4. Apply all migrations against the staging Supabase project before deploying
5. Run seed data (see Seed Strategy below)

### prod

1. Set all **Always required** and **Required in production** vars in Vercel → Project → Environment Variables → Production
2. Never reuse staging secrets in production — generate fresh values
3. Apply migrations in order: dev → staging → prod (see `/docs/release-checklist.md`)
4. Verify with smoke tests before routing live traffic

---

## Seed Strategy

| Environment | Seed approach |
|---|---|
| `dev` | Run `supabase/seed.sql` — includes test org, teachers, parents, students |
| `staging` | Run seed to create one demo org for E2E QA. Remove or isolate before real customer data |
| `prod` | **No seed.** First customer org is created manually via the owner invite flow |

---

## Secret Rotation

If a secret must be rotated:

1. Generate a new value
2. Update the Vercel environment variable for the target environment
3. Redeploy
4. For `BOOKING_JWT_SECRET` rotation: all in-flight booking tokens will be invalidated — parents will need to request a new link

---

## What Must Never Be Committed

The following must never appear in source control:

- `.env.local` (gitignored)
- Any file containing a real `SUPABASE_SERVICE_ROLE_KEY`
- Any file containing a real `BOOKING_JWT_SECRET`
- Any file containing a real `WHATSAPP_APP_SECRET`

Only `.env.local.example` is committed — it contains no real values.
