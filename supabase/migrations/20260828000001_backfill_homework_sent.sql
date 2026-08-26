-- Backfill homework_assignments.sent from sent_at.
--
-- `sent` (added in 20260501000001) and `sent_at` (added in 20260414000001) both
-- record that an assignment reached the parent, but until now each writer set
-- only one of them: the dashboard send path wrote `sent_at`, the scheduled
-- homework-sender cron wrote `sent`. The parent portal filters on `sent`, so
-- every assignment sent from the dashboard was invisible to parents — the
-- homework tab was permanently empty and the assignment detail page
-- unreachable.
--
-- Both writers now set both columns. This backfill repairs the rows written
-- before that fix. It is safe to re-run.

UPDATE homework_assignments
SET sent = true
WHERE sent_at IS NOT NULL
  AND sent = false;
