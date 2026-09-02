-- Migration: 20260901200000_teacher_seat_pricing_catalog.sql
--
-- Moves the SaaS value metric from student quotas to TEACHER SEATS, and lands
-- the new catalog alongside the old one.
--
-- Why: `advanced` charged ₪199 whether an org had one teacher or eight, while
-- that org's WhatsApp and AI costs scaled with it. And `basic` (₪99) shipped
-- with `whatsapp_automation: false` — it sold the product without the reason
-- anyone buys it. Neither supports paid acquisition.
--
--   solo   ₪149 / ₪1,490   1 teacher
--   studio ₪349 / ₪3,490   5 teachers     ← the tier most customers land on
--   center ₪699 / ₪6,990   unlimited
--
-- All three include whatsapp_automation. Students and lessons become unlimited
-- on every paid tier: teachers are the only binding constraint, which also
-- means no student cliff between trial and paid.
--
-- THIS MIGRATION IS DELIBERATELY INERT. The new rows go in `is_active = true`,
-- and `basic`/`advanced` STAY ACTIVE. Today's code filters plans by name, so it
-- ignores the new rows entirely — the only visible effect is three new cards on
-- /admin/plans. Retiring the old rows is a separate migration that must land
-- AFTER the code deploy, because `db push` and Vercel are not atomic and the
-- trial-entitlement lookup fails OPEN (see the note on that migration).

-- ─── teachers_quota ─────────────────────────────────────────────────────────
-- Set explicitly on every existing row. NULL means unlimited, so leaving a row
-- silent would be an accidental decision to enforce nothing.

ALTER TABLE saas_plans ADD COLUMN IF NOT EXISTS teachers_quota int;

COMMENT ON COLUMN saas_plans.teachers_quota IS
  'null = unlimited. Read by requireQuotaCapacity(kind = ''teachers'') in src/lib/saas/quota.ts.';

-- Legacy rows get NULL on purpose: they were sold with no seat limit, and
-- retro-enforcing one would lock a paying customer out of their own data.
UPDATE saas_plans SET teachers_quota = NULL WHERE name IN ('basic', 'advanced', 'custom');

-- `free` is the trial vehicle. An active trial resolves the studio row for both
-- features and quotas (TRIAL_ENTITLEMENT_PLAN), so this value is near-inert —
-- it is set to match studio so that if that resolution ever fails, the failure
-- is benign rather than a trialling studio owner blocked on their 2nd teacher.
UPDATE saas_plans SET teachers_quota = 5 WHERE name = 'free';

-- ─── data_retention feature flag ────────────────────────────────────────────
-- settings/privacy was the one entitlement expressed as a plan-name comparison
-- (`planName === 'advanced' || 'custom'`), which is false for every customer on
-- the new catalog. It becomes a real flag. parseSaasFeatures coerces a missing
-- key to false, so every row must be written explicitly.

UPDATE saas_plans
   SET features = features || '{"data_retention": true}'::jsonb
 WHERE name IN ('advanced', 'custom');

UPDATE saas_plans
   SET features = features || '{"data_retention": false}'::jsonb
 WHERE name IN ('free', 'basic');

-- ─── the new catalog ────────────────────────────────────────────────────────
-- All eight flags listed explicitly for the same reason as above.

INSERT INTO saas_plans
  (name, display_name_he, display_name_en, price_monthly, price_yearly,
   features, is_active, sort_order,
   students_quota, lessons_monthly_quota, teachers_quota)
VALUES
  (
    'solo', 'יחיד', 'Solo', 149, 1490,
    '{"whatsapp_automation":true,"ai_assistant":true,"full_reports":true,"leads":true,"homework":true,"parent_portal":true,"integrations":true,"data_retention":true}'::jsonb,
    true, 10, NULL, NULL, 1
  ),
  (
    'studio', 'סטודיו', 'Studio', 349, 3490,
    '{"whatsapp_automation":true,"ai_assistant":true,"full_reports":true,"leads":true,"homework":true,"parent_portal":true,"integrations":true,"data_retention":true}'::jsonb,
    true, 20, NULL, NULL, 5
  ),
  (
    'center', 'מרכז', 'Center', 699, 6990,
    '{"whatsapp_automation":true,"ai_assistant":true,"full_reports":true,"leads":true,"homework":true,"parent_portal":true,"integrations":true,"data_retention":true}'::jsonb,
    true, 30, NULL, NULL, NULL
  )
ON CONFLICT (name) DO NOTHING;

-- ─── sort_order becomes a VALUE ladder ──────────────────────────────────────
-- assertUpgradeAllowed rejects when target.sort_order <= current.sort_order.
-- Interleaving the retired rows BY PRICE is what makes that existing check
-- correct with no legacy special-casing:
--
--   free 0 · basic 5 (₪99) · solo 10 (₪149) · advanced 15 (₪199)
--          · studio 20 (₪349) · center 30 (₪699) · custom 100
--
-- So a legacy `advanced` org cannot "upgrade" down to solo, while a legacy
-- `basic` org can move to solo. The retired rows are inactive, so their
-- position never affects display order in any tenant-facing catalog.

UPDATE saas_plans SET sort_order =   5 WHERE name = 'basic';
UPDATE saas_plans SET sort_order =  15 WHERE name = 'advanced';
UPDATE saas_plans SET sort_order = 100 WHERE name = 'custom';

-- ─── teachers.is_active hygiene ─────────────────────────────────────────────
-- The column was created nullable with a DEFAULT but no NOT NULL, so
-- `.eq('is_active', true)` would miss any NULL row. Nothing writes NULL
-- deliberately (createOrgWithOwner passes true; teachers/actions.ts and
-- executeImport.ts omit it and take the default), so this closes the question
-- rather than making every future count query answer it.

UPDATE teachers SET is_active = true WHERE is_active IS NULL;

ALTER TABLE teachers ALTER COLUMN is_active SET DEFAULT true;
ALTER TABLE teachers ALTER COLUMN is_active SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_teachers_org_active
  ON teachers (organization_id) WHERE is_active;

-- ─── organization_usage gains active_teachers ───────────────────────────────
-- The admin "near the ceiling" queue and the org list read this view rather
-- than getOrgQuotaUsage(). Without the new column, teacher pressure — now the
-- upgrade signal that matters most — would be invisible platform-wide.
--
-- CREATE OR REPLACE VIEW can only APPEND columns, so active_teachers goes last.
-- security_invoker must be restated or it silently reverts to definer.

CREATE OR REPLACE VIEW organization_usage
WITH (security_invoker = true) AS
SELECT o.id AS organization_id,
       COALESCE(s.active_students, 0)      AS active_students,
       COALESCE(l.lessons_this_month, 0)   AS lessons_this_month,
       COALESCE(t.active_teachers, 0)      AS active_teachers
  FROM organizations o
  LEFT JOIN (
        SELECT organization_id, count(*) AS active_students
          FROM students
         WHERE is_active = true
         GROUP BY organization_id
       ) s ON s.organization_id = o.id
  LEFT JOIN (
        SELECT organization_id, count(*) AS lessons_this_month
          FROM lessons
         WHERE status <> 'cancelled'
           AND start_at >= date_trunc('month', now() AT TIME ZONE 'utc')
         GROUP BY organization_id
       ) l ON l.organization_id = o.id
  LEFT JOIN (
        SELECT organization_id, count(*) AS active_teachers
          FROM teachers
         WHERE is_active
         GROUP BY organization_id
       ) t ON t.organization_id = o.id;

COMMENT ON VIEW organization_usage IS
  'Per-org active students, current-month lessons, and active teachers, for quota pressure across all tenants at once.';
