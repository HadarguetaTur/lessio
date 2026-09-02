-- Migration: 20260902200000_lesson_group_link.sql
-- Group lessons remember the student group they were created from.
--
-- Until now the group picked in the new-lesson form was expanded into
-- lesson_students rows in the browser and the group id was dropped, so the
-- calendar could only show one arbitrary member's name for a group lesson.
-- Per /docs/groups-spec.md.

-- ─── 1. lessons.group_id ──────────────────────────────────────────────────────

ALTER TABLE lessons
  ADD COLUMN group_id uuid REFERENCES student_groups(id) ON DELETE SET NULL,
  ADD CONSTRAINT lessons_group_id_only_for_group_type
    CHECK (group_id IS NULL OR lesson_type = 'group');

COMMENT ON COLUMN lessons.group_id IS
  'Student group a group lesson was created from. NULL for other lesson types, for legacy group lessons, and after the group is deleted.';

CREATE INDEX idx_lessons_group_id ON lessons(group_id) WHERE group_id IS NOT NULL;

-- ─── 2. lesson_series.group_id ────────────────────────────────────────────────

ALTER TABLE lesson_series
  ADD COLUMN group_id uuid REFERENCES student_groups(id) ON DELETE SET NULL;

COMMENT ON COLUMN lesson_series.group_id IS
  'Student group a recurring group series was created from (copied onto every generated lesson).';

-- ─── 3. Backfill existing group lessons ───────────────────────────────────────
-- A legacy group lesson is linked to the one group in its org whose membership
-- is exactly its enrolled roster. Ambiguous matches (two identical groups) and
-- rosters that match no group are left NULL.

WITH lesson_rosters AS (
  SELECT l.id AS lesson_id,
         l.organization_id,
         array_agg(ls.student_id ORDER BY ls.student_id) AS roster
  FROM lessons l
  JOIN lesson_students ls ON ls.lesson_id = l.id
  WHERE l.lesson_type = 'group'
    AND l.group_id IS NULL
  GROUP BY l.id, l.organization_id
),
group_rosters AS (
  SELECT g.id AS group_id,
         g.organization_id,
         array_agg(m.student_id ORDER BY m.student_id) AS roster
  FROM student_groups g
  JOIN student_group_members m ON m.group_id = g.id
  GROUP BY g.id, g.organization_id
),
matches AS (
  SELECT lr.lesson_id,
         gr.group_id,
         count(*) OVER (PARTITION BY lr.lesson_id) AS candidates
  FROM lesson_rosters lr
  JOIN group_rosters gr
    ON gr.organization_id = lr.organization_id
   AND gr.roster = lr.roster
)
UPDATE lessons
SET group_id = m.group_id
FROM matches m
WHERE lessons.id = m.lesson_id
  AND m.candidates = 1;

-- A series inherits the group when every linked lesson of it agrees.
UPDATE lesson_series s
SET group_id = agg.group_id
FROM (
  SELECT series_id,
         min(group_id::text)::uuid AS group_id
  FROM lessons
  WHERE series_id IS NOT NULL
    AND group_id IS NOT NULL
  GROUP BY series_id
  HAVING count(DISTINCT group_id) = 1
) agg
WHERE s.id = agg.series_id
  AND s.group_id IS NULL;
