# LESSIO — Migration Guide

**Last updated:** Sprint 25 (2026-04-20)
**Owner:** Platform team

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

Current migration set (as of Sprint 25 — 46 files):

| File | Sprint | Tables/Columns | תיאור |
|---|---|---|---|
| `20260321000001_schema.sql` | 1 | organizations, profiles, teachers, parents, students, relationships, availability, availability_overrides, lessons, slot_locks, charges, cancellation_policies, leads | יסוד המערכת — 13 טבלות ליסודות ניהול שיעורים |
| `20260321000002_rls.sql` | 1 | (RLS policies) | יסודי RLS לכל 13 הטבלות במיגרציה הראשונה |
| `20260321000003_slot_lock_unique.sql` | 1 | idx_slot_locks_active_unique | אינדקס UNIQUE חלקי למניעת duplicate locks בו-זמנים |
| `20260321000004_jwt_hook.sql` | 1 | custom_access_token_hook function | JWT hook להזרקת org_id ו-role בטוקנים |
| `20260322000001_profiles_self_read.sql` | 2 | (RLS fallback policy) | כל משתמש יכול לקרוא את ה-profile שלו ללא תלות ב-JWT |
| `20260322000002_teachers_hourly_rate.sql` | 3 | teachers.hourly_rate | תעריף שעתי למורים לחישוב שכר |
| `20260322000003_charges_lesson_id_unique.sql` | 3 | charges_lesson_id_unique index | אינדקס למניעת duplicate charges per lesson |
| `20260323000001_fix_auth_role_claim.sql` | 4 | (RLS fix: app_role claim) | תיקון JWT — שמירת role ב-app_role |
| `20260323000002_cancellation_sessions.sql` | 4 | cancellation_sessions table | מכונת מצבים ל-WhatsApp cancellation flow |
| `20260323000003_charges_send_metadata.sql` | 4 | charges.sent_at, charges.sent_by_profile_id | metadata לשליחת בקשות תשלום |
| `20260323000004_convert_lead_rpc.sql` | 4 | convert_lead RPC function | פונקציה transactional להמרת lead ל-parent+student |
| `20260324000001_sprint5_stabilization.sql` | 5 | charges_cancellation_lesson_id_unique, guard_teacher_lesson_update trigger | הגנה מפני duplicate cancellation charges + נעילת עריכות מורה |
| `20260325000001_lesson_students.sql` | 7 | lesson_students table, lessons.lesson_type, lessons.max_students, organizations.group_pricing_mode | junction table לתלמידים מרובים + סוג שיעור + מצב תמחור קבוצתי |
| `20260325000002_whatsapp_embedded_signup.sql` | 7 | organizations.whatsapp_phone_number_id, organizations.whatsapp_access_token | WhatsApp credentials per-org ל-Meta Embedded Signup |
| `20260325000003_payments.sql` | 8 | organizations payment provider columns, charges payment columns | abstraction layer לתשלומים (Cardcom, PayPlus) |
| `20260330000001_sprint9_auto_payment.sql` | 9 | organizations.auto_send_payment_request | שליחה אוטומטית של בקשת תשלום ב-WhatsApp |
| `20260330000002_org_holidays.sql` | 10 | organization_holidays table | תאריכי חגים per-org בהם אין הזמנות |
| `20260330000003_fix_holidays_rls.sql` | 10 | (RLS fix: app_role) | תיקון holidays RLS להשתמש ב-app_role |
| `20260330000004_recurring_lessons.sql` | 11 | lesson_series table, lessons.series_id | שיעורים חוזרים (RRULE pattern) |
| `20260330000005_reminders.sql` | 12 | organizations reminder columns, notification_log table | תזכורות WhatsApp אוטומטיות + dedup |
| `20260401000001_portal_otps.sql` | 13 | portal_otps table | OTP לכניסת הורים לפורטל |
| `20260401000002_lesson_students_org_id.sql` | 13 | lesson_students.organization_id | org_id denormalization לשאילתות פורטל |
| `20260407000001_no_teacher_lesson_overlap.sql` | 14 | no_teacher_lesson_overlap EXCLUDE constraint | הגנה ברמת DB מפני חפיפת שיעורים למורה |
| `20260414000001_homework.sql` | 14 | homework_templates, homework_assignments tables | תבניות שיעורי בית + הקצאות לתלמידים |
| `20260414000002_homework_media.sql` | 14 | homework-media storage bucket, media columns | קבצי מדיה לשיעורי בית |
| `20260415000001_receipts_and_payment_providers.sql` | 15 | charges receipt columns, organizations receipt config, payment_provider CHECK widened | קבלות + providers חדשים (Bit, PayBox) |
| `20260415120000_homework_media_storage_org_policies.sql` | 15 | (RLS storage) | storage policies — upload/delete ל-org folder בלבד |
| `20260416000001_message_templates_and_ical.sql` | 16 | message_templates table, teachers.ical_token | תבניות WhatsApp custom + iCal calendar |
| `20260416000002_receipt_provider.sql` | 16 | organizations.receipt_provider | plaintext provider key ל-dispatch |
| `20260417000001_superadmin_dashboard.sql` | 18 | profiles.role='superadmin', profiles.organization_id nullable | תמיכה ב-superadmin ללא ארגון |
| `20260418000001_ai_assistant.sql` | 19 | organizations.ai_assistant_enabled, conversation_log table | עוזר AI ל-WhatsApp + לוג שיחות |
| `20260418000002_ai_assistant_hardening.sql` | 19 | whatsapp_processed_messages table, (RLS tightened) | idempotency WhatsApp + RLS ל-owner בלבד |
| `20260419000001_profiles_locale.sql` | 21 | profiles.preferred_locale | העדפת שפה per profile |
| `20260422000001_student_card_fields.sql` | 22 | students.phone, level, focused_subject, weekly_quota, status | שדות כרטיס תלמיד מורחב |
| `20260422000002_student_groups.sql` | 22 | student_groups, student_group_members tables | קבוצות תלמידים עם RLS |
| `20260423000001_student_teacher.sql` | 22 | students.teacher_id | הקצאת מורה per-תלמיד |
| `20260424000001_subscription_billing.sql` | 22 | subscriptions, student_cancellation_events, student_monthly_billing, lessons.price_per_student | billing חודשי + subscriptions per-תלמיד |
| `20260425000001_onboarding_flag.sql` | 22 | organizations.onboarding_completed | דגל onboarding per-org |
| `20260426000001_fix_lesson_students_rls.sql` | 22 | (RLS fix: app_role on lesson_students) | תיקון RLS של lesson_students ל-app_role |
| `20260427000001_monthly_charge_ledger.sql` | 22 | charges.billing_record_id, charges.billing_month, charge_type='monthly' | ledger חודשי לחיובים |
| `20260428000001_saas_platform_billing.sql` | 22 | saas_plans, organization_subscriptions, saas_invoices, saas_plan_inquiries | SaaS platform billing + תוכניות תמחור |
| `20260429000001_teacher_students_parents_rls.sql` | 22 | (RLS for teacher dashboard) | מורה קורא/מעדכן תלמידים מוקצים והוריהם |
| `20260430000001_sprint23_gdpr_stripe_whatsapp.sql` | 23 | data_deletion_requests table, organizations.data_retention_days, whatsapp session index | GDPR + Stripe + data retention |
| `20260501000001_sprint24_pedagogical_depth.sql` | 24 | homework_attachments, homework_submissions, lesson_notes, student_goals | homework v2 + הערות שיעור + יעדי למידה |
| `20260501000002_sprint24_rls_deny_policies.sql` | 24 | (RLS deny policies) | deny policies לטבלות service-role-only |
| `20260502000001_sprint25_ai_email_notifications.sql` | 25 | ai_usage_log, in_app_notifications tables, organizations AI columns, parents.email | AI multi-provider + usage tracking + email + in-app |

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

Before proceeding to production, run the 7 E2E scenarios on staging (see `/docs/release-checklist.md` + `/docs/qa-e2e-staging.md`).

All 7 must pass before the staging gate is considered cleared.

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

- **Platform owner** runs migrations manually against staging and prod via the Supabase dashboard SQL editor or CLI
- No automated migration runner is in place
- Every production migration must be confirmed by the owner before the code deploy proceeds

---

## Pre-Migration Checklist

Before applying any migration to staging or prod:

- [ ] Migration was applied and verified locally first
- [ ] Test suite is green on the branch being deployed
- [ ] You have a backup or snapshot of the target database (use Supabase dashboard → Backups)
- [ ] The migration has been reviewed for correctness
- [ ] Rollback path is understood
