-- Migration: 20260829140000_fix_plan_feature_inversion.sql
--
-- `basic` (₪99/mo) shipped with every feature flag false — byte-identical to
-- `free`. The only thing ₪99 bought was quota (100 students vs 50). Meanwhile
-- getEffectiveSaasFeatures handed the FULL advanced feature set to any org in
-- `read_only`. Measured in production 2026-08-29:
--
--   free     0     portal ✗  whatsapp ✗  homework ✗  reports ✗
--   basic    99    portal ✗  whatsapp ✗  homework ✗  reports ✗   ← paying
--   advanced 199   portal ✓  whatsapp ✓  homework ✓  reports ✓
--
-- So a customer paying ₪99 got strictly less than an org that had stopped
-- paying altogether. No coherent shutdown ladder can be built on top of that:
-- "suspended" would be an upgrade for a Basic customer.
--
-- Basic now carries the features a paying customer reasonably expects, and
-- WhatsApp automation stays the Advanced differentiator — it is the expensive
-- capability (Meta conversation fees, template approval, connection support)
-- and the clearest reason to move up a tier.
--
-- This is a PRICING decision as much as a technical one. If Basic should keep
-- or lose a specific capability, this file is the single place to change it —
-- nothing in the code hardcodes the matrix.

UPDATE saas_plans
   SET features = features || '{"parent_portal": true, "homework": true, "full_reports": true}'::jsonb
 WHERE name = 'basic';

-- Free stays fully gated: it is a trial surface, not a tier. An active trial
-- already gets the advanced feature set from getEffectiveSaasFeatures, so a
-- trialling org is unaffected by this.
