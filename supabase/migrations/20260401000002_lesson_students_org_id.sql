-- Migration: 20260401000002_lesson_students_org_id.sql
-- Sprint 13: add organization_id to lesson_students for direct org-scoped queries.
--
-- createLesson.ts and createSeries.ts both insert organization_id on lesson_students.
-- portal/home filters lesson_students by organization_id directly.
-- Without this column those inserts fail at runtime.
--
-- Steps:
--   1. Add column (nullable initially so backfill can run)
--   2. Backfill from the parent lessons row
--   3. Set NOT NULL + FK constraint
--   4. Add index for org-scoped portal queries

-- ─── 1. Add nullable column ───────────────────────────────────────────────────

ALTER TABLE lesson_students
  ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

-- ─── 2. Backfill from lessons ─────────────────────────────────────────────────

UPDATE lesson_students ls
SET    organization_id = l.organization_id
FROM   lessons l
WHERE  l.id = ls.lesson_id;

-- ─── 3. Enforce NOT NULL ──────────────────────────────────────────────────────

ALTER TABLE lesson_students
  ALTER COLUMN organization_id SET NOT NULL;

-- ─── 4. Index for portal home and org-scoped queries ─────────────────────────

CREATE INDEX idx_lesson_students_org ON lesson_students (organization_id);
