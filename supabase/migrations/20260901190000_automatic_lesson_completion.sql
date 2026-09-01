-- Automatic lesson completion audit fields.
ALTER TABLE lessons
  ADD COLUMN completed_at timestamptz,
  ADD COLUMN completion_source text
    CONSTRAINT lessons_completion_source_check
      CHECK (completion_source IN ('manual', 'automatic')),
  ADD COLUMN completion_error text;

CREATE INDEX idx_lessons_auto_completion_due
  ON lessons (end_at)
  WHERE status = 'scheduled';

COMMENT ON COLUMN lessons.completion_source IS
  'How the lesson reached completed: a dashboard action or the automatic completion cron.';
COMMENT ON COLUMN lessons.completion_error IS
  'Last post-completion billing warning. NULL means completion processing succeeded.';
