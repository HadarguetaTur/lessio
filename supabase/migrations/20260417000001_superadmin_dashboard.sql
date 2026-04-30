-- Migration: 20260417000001_superadmin_dashboard.sql
-- Sprint 18: superadmin role + nullable organization_id for platform operators.
-- Per /docs/sprint-18-scope.md § Story 0.

-- Step 1: drop the existing role check so we can extend it.
ALTER TABLE profiles
  DROP CONSTRAINT profiles_role_check;

-- Step 2: add the extended role check (includes 'superadmin').
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('owner', 'admin', 'teacher', 'superadmin'));

-- Step 3: make organization_id nullable — superadmin rows have no org.
ALTER TABLE profiles
  ALTER COLUMN organization_id DROP NOT NULL;

-- Step 4: enforce the invariant:
--   superadmin  ↔  organization_id IS NULL
--   all others  ↔  organization_id IS NOT NULL
ALTER TABLE profiles
  ADD CONSTRAINT profiles_superadmin_org_check
  CHECK (
    (role = 'superadmin' AND organization_id IS NULL) OR
    (role <> 'superadmin' AND organization_id IS NOT NULL)
  );
