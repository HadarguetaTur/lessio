-- Retire the pre-seat-pricing tiers `basic` (99) and `advanced` (199).
--
-- This is the follow-up migration promised by the header of
-- 20260901200000_teacher_seat_pricing_catalog.sql ("retiring them is a
-- separate migration that must land AFTER the code deploy") that was never
-- written. Until now only the code-side PURCHASABLE_PLAN_NAMES filter kept
-- these rows off the landing page, the Terms pricing table and the upgrade
-- panel — any future caller of listActiveSaasPlans() without that filter
-- would have re-exposed a 99 tier that checkout no longer sells.
--
-- Grandfathering: existing holders (4 active subscriptions on `advanced` as
-- of 2026-09-06, none on `basic`) are unaffected. getSaasPlanById resolves a
-- subscription's plan by id regardless of is_active, the admin console lists
-- plans via listAllSaasPlans, and the billing page shows legacy holders their
-- own card with legacyPlanNote. Nothing new can be sold on these rows —
-- which is the point.
--
-- `free` and `custom` stay active: `free` backs the trial path and the admin
-- action refuses to deactivate the trial-entitlement chain; `custom` is the
-- contact-us tier.

UPDATE saas_plans
SET is_active = false
WHERE name IN ('basic', 'advanced');
