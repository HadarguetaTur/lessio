-- Migration: 20260828140000_org_enforce_weekly_quota.sql
-- Per-org switch for enforcing students.weekly_quota during booking.
--
-- students.weekly_quota has existed since 20260422000001 but was never enforced.
-- Turning enforcement on by default keeps the quota an org already typed in
-- meaningful; orgs that use the field as a note can switch it off in settings,
-- which also hides the field on the student card.

ALTER TABLE organizations
  ADD COLUMN enforce_weekly_quota boolean NOT NULL DEFAULT true;
