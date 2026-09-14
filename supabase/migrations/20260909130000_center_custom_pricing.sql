-- Center moves from a public self-serve tier to a bespoke sales motion.
-- Do not edit its price in place: existing subscribers resolve this retired row
-- and must retain the price and entitlement they bought.
UPDATE saas_plans
SET is_active = false
WHERE name = 'center' AND is_active = true;

-- A platform lead can be a cold prospect or an upgrade request from an
-- existing organization. Keeping this optional preserves the former case.
ALTER TABLE platform_leads
  ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL;

CREATE INDEX platform_leads_organization_created_idx
  ON platform_leads (organization_id, created_at DESC)
  WHERE organization_id IS NOT NULL;

COMMENT ON COLUMN platform_leads.organization_id IS
  'Existing Lessio organization requesting a bespoke Center plan; null for cold leads.';
