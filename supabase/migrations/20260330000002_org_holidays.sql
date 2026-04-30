-- Sprint 10: organization_holidays table
-- Org-wide dates on which no bookings are accepted (חגים, ימי עיון, etc.)

CREATE TABLE organization_holidays (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date            date        NOT NULL,
  name            text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, date)
);

COMMENT ON TABLE organization_holidays IS
  'Org-wide dates on which no bookings are accepted (חגים, ימי עיון, etc.).';

-- RLS
ALTER TABLE organization_holidays ENABLE ROW LEVEL SECURITY;

-- Owner/admin: full access
CREATE POLICY "org_holidays_owner_admin_all"
  ON organization_holidays
  FOR ALL
  TO authenticated
  USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') IN ('owner', 'admin')
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') IN ('owner', 'admin')
  );

-- Teachers: read own org (for display in schedule)
CREATE POLICY "org_holidays_teacher_read"
  ON organization_holidays
  FOR SELECT
  TO authenticated
  USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
  );
