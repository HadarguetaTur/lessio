-- Repair lesson_series.rule rows written by the schedule importer.
--
-- The importer stored { dayOfWeek, startTime, durationMinutes } — camelCase,
-- with neither `frequency` nor `until` — while every reader and the column
-- comment expect { frequency, day_of_week, start_time, duration_minutes,
-- until }. The code no longer writes that shape; this repairs what already
-- landed.
--
-- `until` is reconstructed from the lessons the series actually produced,
-- read in the organization's timezone, so the horizon describes reality. A
-- series with no lessons left falls back to four weeks from its creation date,
-- which is the horizon the importer used.
--
-- Idempotent: rows already in the canonical shape are not touched, and a
-- re-run finds nothing to do.

UPDATE lesson_series AS ls
SET rule = jsonb_strip_nulls(
  jsonb_build_object(
    'frequency',
    CASE
      WHEN ls.rule ->> 'frequency' IN ('weekly', 'biweekly') THEN ls.rule ->> 'frequency'
      ELSE 'weekly'
    END,
    'day_of_week', COALESCE(ls.rule -> 'day_of_week', ls.rule -> 'dayOfWeek'),
    'start_time',
    -- Pad '9:05' to '09:05'; readers expect a fixed-width clock time.
    lpad(
      split_part(COALESCE(ls.rule ->> 'start_time', ls.rule ->> 'startTime'), ':', 1),
      2,
      '0'
    )
    || ':'
    || split_part(COALESCE(ls.rule ->> 'start_time', ls.rule ->> 'startTime'), ':', 2),
    'duration_minutes',
    COALESCE(ls.rule -> 'duration_minutes', ls.rule -> 'durationMinutes'),
    'until',
    COALESCE(
      ls.rule ->> 'until',
      to_char(
        (
          SELECT max(l.start_at) AT TIME ZONE COALESCE(o.timezone, 'Asia/Jerusalem')
          FROM lessons l
          WHERE l.series_id = ls.id
        ),
        'YYYY-MM-DD'
      ),
      to_char(
        (ls.created_at AT TIME ZONE COALESCE(o.timezone, 'Asia/Jerusalem')) + interval '4 weeks',
        'YYYY-MM-DD'
      )
    )
  )
)
FROM organizations o
WHERE o.id = ls.organization_id
  -- Only rows that are actually mis-shaped, and only rows we can repair:
  -- a day, a time and a duration must be recoverable from one spelling or
  -- the other, otherwise leave the row for a human to look at.
  AND (
    NOT (ls.rule ? 'day_of_week')
    OR NOT (ls.rule ? 'start_time')
    OR NOT (ls.rule ? 'duration_minutes')
    OR NOT (ls.rule ? 'frequency')
    OR NOT (ls.rule ? 'until')
  )
  AND COALESCE(ls.rule -> 'day_of_week', ls.rule -> 'dayOfWeek') IS NOT NULL
  AND COALESCE(ls.rule ->> 'start_time', ls.rule ->> 'startTime') IS NOT NULL
  AND COALESCE(ls.rule -> 'duration_minutes', ls.rule -> 'durationMinutes') IS NOT NULL;

-- Anything still mis-shaped after the pass is unrecoverable from the row
-- alone. It is left in place on purpose: the application reader tolerates it
-- (src/lib/lessons/seriesRule.ts) rather than throwing, and deleting an
-- owner's series to tidy the column would be worse than showing it as
-- incomplete.
DO $$
DECLARE
  leftover integer;
BEGIN
  SELECT count(*) INTO leftover
  FROM lesson_series
  WHERE NOT (rule ? 'day_of_week' AND rule ? 'start_time' AND rule ? 'duration_minutes');

  IF leftover > 0 THEN
    RAISE NOTICE 'lesson_series: % row(s) have an unrecoverable rule and were left as-is', leftover;
  END IF;
END $$;
