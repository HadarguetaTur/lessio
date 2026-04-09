ALTER TABLE organizations
  ADD COLUMN onboarding_completed boolean NOT NULL DEFAULT true;
-- Default true so existing orgs are unaffected; new orgs created via signup get false
