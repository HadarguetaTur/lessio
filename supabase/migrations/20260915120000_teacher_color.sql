-- Teacher colour for the multi-teacher calendar.
--
-- A centre owner looking at the whole schedule could not tell whose lesson a
-- card was: card colour encoded status, and no view but "day" named the
-- teacher. Each teacher now has a stable colour: NULL derives it from the
-- teacher id (see src/lib/teachers/color.ts), a value overrides it.
--
-- Values are validated in the application against the palette keys, not by a
-- CHECK constraint, so extending the palette does not need another migration.

ALTER TABLE teachers ADD COLUMN IF NOT EXISTS color text NULL;

COMMENT ON COLUMN teachers.color IS
  'Calendar colour key from the app palette (src/lib/teachers/color.ts). NULL = derived from the teacher id.';
