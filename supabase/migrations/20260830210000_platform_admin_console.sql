-- ── Platform Admin & Growth Console (Sprint 34, M1) ─────────────────────────
-- Per /docs/sprint-34-scope.md.
--
-- Three things ship here:
--   1. organization_activity  — replaces buildLastActivityMap(), which pulled
--      every row of lessons + charges + leads platform-wide into Node on every
--      admin page load and folded them in JS.
--   2. admin_audit_log        — support-mode entry, org edits, data exports and
--      subscription changes were only ever console.info().
--   3. attribution columns    — the first half of the measurement engine (M2).
--      Shipped now, deliberately: attribution that starts late leaves a hole
--      that cannot be backfilled, and the cookie writer has no dependencies.

-- ── organization_activity ───────────────────────────────────────────────────
-- One row per org with its most recent touch across the three tables that
-- signal real use. Aggregation happens in Postgres against existing indexes
-- instead of transferring the tables to the app.
--
-- A plain view, not materialized: a matview would need a refresh cron to stay
-- honest, and "last activity" going stale is exactly the failure the admin
-- panel must not have. The GROUP BY is cheap next to what it replaces.
--
-- security_invoker so the caller's own RLS applies. Everything that reads this
-- goes through requireSuperAdminSession() and the service-role client, which
-- bypasses RLS anyway — but a view that silently ran as its owner would be a
-- privilege escalation waiting for the first non-service-role caller.

CREATE OR REPLACE VIEW organization_activity
WITH (security_invoker = true) AS
SELECT organization_id,
       max(updated_at) AS last_activity_at
  FROM (
        SELECT organization_id, updated_at FROM lessons
        UNION ALL
        SELECT organization_id, updated_at FROM charges
        UNION ALL
        SELECT organization_id, updated_at FROM leads
       ) AS touches
 WHERE updated_at IS NOT NULL
 GROUP BY organization_id;

COMMENT ON VIEW organization_activity IS
  'Last activity per org across lessons/charges/leads. Replaces the JS fold in superadmin/organizations.ts.';

-- The view scans by organization_id; these make the per-table halves cheap.
CREATE INDEX IF NOT EXISTS lessons_org_updated_idx ON lessons (organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS charges_org_updated_idx ON charges (organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS leads_org_updated_idx   ON leads   (organization_id, updated_at DESC);

-- ── admin_audit_log ─────────────────────────────────────────────────────────
-- Every superadmin action that touches a tenant. Service-role only, like
-- charge_audit_log: the only readers are admin pages that already resolved the
-- superadmin session themselves.
--
-- organization_id is nullable because platform-level actions (editing a plan,
-- changing a tracking destination) belong to no tenant.

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id                bigserial PRIMARY KEY,
  actor_profile_id  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action            text NOT NULL,
  target_type       text,
  target_id         text,
  organization_id   uuid REFERENCES organizations(id) ON DELETE SET NULL,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_time_idx
  ON admin_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS admin_audit_log_org_time_idx
  ON admin_audit_log (organization_id, created_at DESC)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS admin_audit_log_actor_time_idx
  ON admin_audit_log (actor_profile_id, created_at DESC);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE admin_audit_log IS
  'Superadmin actions: support-mode entry/exit, org edits, subscription changes, exports. Service-role access only.';

-- ── attribution ─────────────────────────────────────────────────────────────
-- Where a visitor came from, captured on first touch by the proxy and frozen
-- onto the org at signup. Later touches accumulate in attribution_touches so
-- first-touch and last-touch can be compared — in a channel with a long sales
-- cycle the gap between them is the whole story.

CREATE TABLE IF NOT EXISTS attribution_touches (
  id            bigserial PRIMARY KEY,
  visitor_id    text NOT NULL,
  touch_index   int  NOT NULL DEFAULT 0,
  source        text,
  medium        text,
  campaign      text,
  content       text,
  term          text,
  referrer      text,
  landing_path  text,
  gclid         text,
  fbclid        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attribution_touches_visitor_idx
  ON attribution_touches (visitor_id, created_at);

CREATE INDEX IF NOT EXISTS attribution_touches_campaign_idx
  ON attribution_touches (campaign, created_at DESC)
  WHERE campaign IS NOT NULL;

ALTER TABLE attribution_touches ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE attribution_touches IS
  'Every marketing touch per anonymous visitor id. First touch is never overwritten.';

-- Frozen first-touch attribution for the org, copied from the cookie at signup.
-- jsonb rather than columns: the shape follows whatever the ad platforms emit,
-- and this is read for reporting, never joined on.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS attribution jsonb,
  ADD COLUMN IF NOT EXISTS attribution_visitor_id text;

COMMENT ON COLUMN organizations.attribution IS
  'First-touch attribution captured at signup: utm params, referrer, landing path, click ids.';

CREATE INDEX IF NOT EXISTS organizations_attribution_visitor_idx
  ON organizations (attribution_visitor_id)
  WHERE attribution_visitor_id IS NOT NULL;

-- ── organization_usage ──────────────────────────────────────────────────────
-- Active students and current-month lessons per org — the two numbers
-- saas_plans caps via students_quota and lessons_monthly_quota.
--
-- getOrgQuotaUsage() answers this for one org and is what the org's own screens
-- call. The admin panel needs it for every org at once to build the "near the
-- ceiling" queue, and running that per-org would be one round trip per tenant.

CREATE OR REPLACE VIEW organization_usage
WITH (security_invoker = true) AS
SELECT o.id AS organization_id,
       COALESCE(s.active_students, 0)      AS active_students,
       COALESCE(l.lessons_this_month, 0)   AS lessons_this_month
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
       ) l ON l.organization_id = o.id;

COMMENT ON VIEW organization_usage IS
  'Per-org active students and current-month lessons, for quota pressure across all tenants at once.';
