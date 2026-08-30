-- Migration: 20260830110000_auto_holidays.sql
-- Auto-populated Jewish holidays.
--
-- 1. organization_holidays.source distinguishes auto-seeded rows ('auto')
--    from manually-added ones ('manual').
-- 2. organization_holiday_dismissals remembers dates whose auto holiday the
--    org deleted, so the holiday sync never resurrects them. Kept as a
--    separate table (not a soft-delete flag) so UNIQUE(organization_id, date)
--    on organization_holidays stays available for manual re-adds and all
--    existing readers keep querying live rows only.

ALTER TABLE organization_holidays
  ADD COLUMN source text NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'auto'));

CREATE TABLE organization_holiday_dismissals (
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date            date        NOT NULL,
  dismissed_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, date)
);

ALTER TABLE organization_holiday_dismissals ENABLE ROW LEVEL SECURITY;

-- Owner/admin manage dismissals for their own org (deleteHoliday runs on the
-- user-session client). Sync jobs use the service role and bypass RLS.
-- NOTE: business role lives in the app_role JWT claim — always use
-- public.app_role(), never auth.jwt()->>'role' (see 20260829130000).
CREATE POLICY "org_holiday_dismissals_owner_admin_all"
  ON organization_holiday_dismissals FOR ALL TO authenticated
  USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND app_role() IN ('owner', 'admin')
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND app_role() IN ('owner', 'admin')
  );

-- Superadmins can read (support mode), matching 20260824130000 pattern.
CREATE POLICY "org_holiday_dismissals_superadmin_read"
  ON organization_holiday_dismissals FOR SELECT TO authenticated
  USING (app_role() = 'superadmin');
