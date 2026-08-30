-- Replace the blocking onboarding wizard with progressive setup in the dashboard.
-- Existing unfinished organizations receive the same safe defaults as new signups.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS setup_welcome_seen_at timestamptz;

INSERT INTO organization_subscriptions (
  organization_id,
  plan_id,
  status,
  billing_interval,
  trial_ends_at,
  current_period_start,
  current_period_end
)
SELECT
  o.id,
  p.id,
  'trial',
  'monthly',
  now() + interval '30 days',
  now(),
  now() + interval '30 days'
FROM organizations o
CROSS JOIN LATERAL (
  SELECT id FROM saas_plans WHERE name = 'free' AND is_active = true LIMIT 1
) p
WHERE o.onboarding_completed = false
  AND NOT EXISTS (
    SELECT 1 FROM organization_subscriptions s WHERE s.organization_id = o.id
  );

INSERT INTO teachers (organization_id, profile_id, is_active)
SELECT o.id, owner_profile.id, true
FROM organizations o
CROSS JOIN LATERAL (
  SELECT p.id
  FROM profiles p
  WHERE p.organization_id = o.id AND p.role = 'owner' AND p.is_active = true
  ORDER BY p.created_at
  LIMIT 1
) owner_profile
WHERE o.onboarding_completed = false
  AND NOT EXISTS (
    SELECT 1 FROM teachers t WHERE t.organization_id = o.id AND t.is_active = true
  );

UPDATE organizations
SET onboarding_completed = true
WHERE onboarding_completed = false;
