-- Parent-portal feature toggles, per organization.
--
-- One jsonb column rather than a boolean per feature (decision #31 shape): a new
-- portal section must not need a schema migration. A key that is absent means
-- "on", so every existing org keeps the portal exactly as it is today.
--
-- Keys: enabled (master switch), payments, homework, exams, progress, messages,
-- booking (self-service booking), cancellation (parent self-cancel).
-- The normaliser in src/lib/organizations/portalSettings.ts is the reader.
--
-- DEPLOY ORDER: migration before app code. Additive only.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS portal_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN organizations.portal_settings IS
  'Parent-portal toggles: {enabled, payments, homework, exams, progress, messages, booking, cancellation}. A missing key means on. Normalised by src/lib/organizations/portalSettings.ts.';
