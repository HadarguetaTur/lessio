-- Marks a series an admin deliberately stopped, so the series list can show it
-- as stopped rather than as a live series that happens to have no lessons left.
-- Cleared again when the series is extended, which revives it.

ALTER TABLE lesson_series ADD COLUMN stopped_at timestamptz;

COMMENT ON COLUMN lesson_series.stopped_at IS
  'Set when an admin stopped the series; cleared when it is extended again. NULL = active or naturally ended.';
