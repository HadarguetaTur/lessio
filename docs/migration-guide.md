# LESSIO — Migration Guide (Sprint 6)

**Ticket:** DEV-107
**Sprint:** 6 — Production Readiness

---

## Principles

- Migrations flow in one direction: **dev → staging → prod**
- Never apply an untested migration directly to production
- Every migration step must be followed by a verification step before proceeding
- Keep migrations small and focused — one concern per file
- Migrations are never reversed in production; write forward-only fixes if needed

---

## Migration File Conventions

All migrations live under `supabase/migrations/`.
Files are named `YYYYMMDDNNNNNN_description.sql` and applied in filename order.

Current migration set (as of Sprint 6):

| File | Sprint | Change |
|---|---|---|
| `20260321000001_schema.sql` | 1 | Full schema baseline |
| `20260321000002_rls.sql` | 1 | RLS policies baseline |
| `20260321000003_slot_lock_unique.sql` | 1 | Unique partial index on slot_locks |
| `20260321000004_jwt_hook.sql` | 1 | JWT custom claims hook |
| `20260322000001_profiles_self_read.sql` | 2 | Teacher self-read RLS policy |
| `20260322000002_teachers_hourly_rate.sql` | 3 | Add `hourly_rate` to teachers |
| `20260322000003_charges_lesson_id_unique.sql` | 3 | Idempotency index on charges |
| `20260323000001_fix_auth_role_claim.sql` | 4 | Auth role claim correction |
| `20260323000002_cancellation_sessions.sql` | 4 | Cancellation session state table |
| `20260323000003_charges_send_metadata.sql` | 4 | `sent_at` + `sent_by_profile_id` on charges |
| `20260323000004_convert_lead_rpc.sql` | 4 | Lead conversion RPC |
| `20260324000001_sprint5_stabilization.sql` | 5 | Sprint 5 hardening fixes |

---

## Migration Process

### Step 1 — Apply locally (dev)

```bash
# From the project root
npx supabase db push
```

Or apply manually via the Supabase dashboard SQL editor against your dev project.

**Verify:**
- [ ] `npx supabase db diff` shows no pending changes
- [ ] Run the full test suite: `npx vitest run` — all tests pass
- [ ] Start the dev server: `npx next dev` — no startup errors

---

### Step 2 — Apply to staging

1. Connect to the **staging** Supabase project (use the staging `SUPABASE_URL` and service role)
2. Apply each new migration file in filename order via the Supabase dashboard SQL editor or CLI:

```bash
# If using Supabase CLI linked to staging
npx supabase db push --db-url <STAGING_DB_URL>
```

3. **Verify after each migration file:**
   - [ ] Query the affected table and confirm the schema change is present
   - [ ] No unexpected errors in the Supabase logs
   - [ ] Application on staging starts cleanly after deploy

---

### Step 3 — Run staging smoke tests

Before proceeding to production, run the 6 E2E scenarios on staging (see `/docs/release-checklist.md`).

All 6 must pass before the staging gate is considered cleared.

---

### Step 4 — Apply to production

Only after staging is verified:

1. Connect to the **production** Supabase project
2. Apply each new migration file in filename order — same process as staging
3. **Verify after each file:**
   - [ ] Affected table schema is correct
   - [ ] No migration errors
4. Deploy the application code to Vercel production
5. Run production smoke tests (see release checklist)

---

## Writing New Migrations

When adding a new migration:

1. Create the file under `supabase/migrations/` with the next sequential timestamp:
   ```
   YYYYMMDDNNNNNN_short_description.sql
   ```
2. Write the migration as idempotent where possible (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`)
3. Test locally first: `npx supabase db push` against dev
4. Do not include seed data in migration files — seed data lives in `supabase/seed.sql`
5. Do not include RLS policy changes unless required — keep schema and policy changes in separate files

---

## Rollback

LESSIO uses forward-only migrations. There is no automated rollback.

If a migration causes a problem:

1. **Stop traffic** — revert the Vercel deployment to the previous version
2. **Assess the migration** — determine if the schema change is safe to leave in place while you fix the code
3. **Write a corrective migration** — if the schema must be reverted, write a new migration that undoes the change
4. **Do not delete migration files** — even if you write a reversal, keep the original file to preserve history

**Common scenarios:**

| Problem | Response |
|---|---|
| Column added but app doesn't use it yet | Safe — leave in place, no action needed |
| Column added with wrong type | Write `ALTER TABLE ... ALTER COLUMN` migration |
| Index causing performance issues | Write `DROP INDEX` migration |
| RLS policy too restrictive | Write corrective `CREATE POLICY` or `ALTER POLICY` migration |
| Migration partially applied | Investigate which statements ran; apply remaining statements manually |

---

## Who Runs Migrations

For the initial launch phase (pilot customer):

- **Owner** runs migrations manually against staging and prod via the Supabase dashboard SQL editor or CLI
- No automated migration runner is in place in Sprint 6
- Every production migration must be confirmed by the owner before the code deploy proceeds

---

## Pre-Migration Checklist

Before applying any migration to staging or prod:

- [ ] Migration was applied and verified locally first
- [ ] Test suite is green on the branch being deployed
- [ ] You have a backup or snapshot of the target database (use Supabase dashboard → Backups)
- [ ] The migration has been reviewed for correctness
- [ ] Rollback path is understood
