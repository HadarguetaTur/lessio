-- Pair & Custom lesson types + centralized org pricing defaults
--
-- 1. 'custom' joins the lesson_type CHECK (constraint defined in 20260325000001).
-- 2. Lesson price defaults move from hardcoded engine constants
--    (PAIR_DEFAULT_PRICE / GROUP_DEFAULT_PRICE) onto the organization, so owners
--    edit them in /settings/pricing. Defaults equal the old constants, so every
--    existing org bills identically before and after this migration.

ALTER TABLE lessons DROP CONSTRAINT lessons_lesson_type_check;
ALTER TABLE lessons ADD CONSTRAINT lessons_lesson_type_check
  CHECK (lesson_type IN ('individual', 'pair', 'group', 'custom'));

ALTER TABLE organizations
  -- NULL until the owner sets it; teachers.hourly_rate takes precedence when set.
  ADD COLUMN default_individual_hourly_rate numeric(10,2),
  ADD COLUMN pair_price_per_student         numeric(10,2) NOT NULL DEFAULT 112.5,
  ADD COLUMN group_price_per_student        numeric(10,2) NOT NULL DEFAULT 120;

COMMENT ON COLUMN organizations.default_individual_hourly_rate IS
  'Org-wide fallback hourly rate for individual lessons; teachers.hourly_rate overrides it.';
COMMENT ON COLUMN organizations.pair_price_per_student IS
  'Default per-student price for pair lessons; lessons.price_per_student overrides it.';
COMMENT ON COLUMN organizations.group_price_per_student IS
  'Default per-student price for group lessons; lessons.price_per_student overrides it.';

-- Custom lessons intentionally have no org default: price is required per lesson.
