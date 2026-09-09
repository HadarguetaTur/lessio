-- Cancellation & billing consistency.
--
-- 1. A lesson charge is per STUDENT, not per parent.
--
--    charges_lesson_parent_unique (20260826000002) keys idempotency on
--    (lesson_id, parent_id). Two siblings enrolled in the same group lesson
--    share one primary parent, so the second sibling's charge raises 23505 and
--    createLessonCharge treats it as "already charged" — every shared-parent
--    group lesson has been billed for one child instead of two.
--
--    charges_cancellation_lesson_id_unique (20260324000001) is worse: one
--    cancellation charge per lesson for the whole roster.
--
--    Both become (lesson_id, student_id). Re-marking a lesson completed is
--    still a no-op; each enrolled student gets their own row.
--
-- 2. A cancellation is recorded once per (lesson, student).
--
--    student_cancellation_events had no uniqueness at all, so two concurrent
--    cancels inserted two events and the monthly engine summed both.

-- ─── charges.student_id ──────────────────────────────────────────────────────

ALTER TABLE charges
  ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES students(id);

-- Backfill: for a lesson-linked charge, the student is the one enrolled in that
-- lesson whose primary parent is the charge's parent. Ambiguous rows (a parent
-- with two children in the same lesson — precisely the under-billed case) are
-- left NULL: there is no way to tell which child the single existing row was
-- for, and guessing would corrupt history.
UPDATE charges c
SET student_id = m.student_id
FROM (
  SELECT ls.lesson_id, r.parent_id, min(ls.student_id::text)::uuid AS student_id
  FROM lesson_students ls
  JOIN relationships r
    ON r.student_id = ls.student_id
   AND r.is_primary
  GROUP BY ls.lesson_id, r.parent_id
  HAVING count(*) = 1
) m
WHERE c.student_id IS NULL
  AND c.lesson_id = m.lesson_id
  AND c.parent_id = m.parent_id
  AND c.charge_type IN ('lesson', 'cancellation');

CREATE INDEX IF NOT EXISTS idx_charges_student
  ON charges(student_id)
  WHERE student_id IS NOT NULL;

DROP INDEX IF EXISTS charges_lesson_parent_unique;
DROP INDEX IF EXISTS charges_cancellation_lesson_id_unique;

-- NULLs compare distinct, so legacy rows the backfill could not resolve neither
-- block nor dedupe. Everything written from here on carries student_id.
CREATE UNIQUE INDEX IF NOT EXISTS charges_lesson_student_unique
  ON charges(lesson_id, student_id)
  WHERE charge_type = 'lesson';

CREATE UNIQUE INDEX IF NOT EXISTS charges_cancellation_lesson_student_unique
  ON charges(lesson_id, student_id)
  WHERE charge_type = 'cancellation';

-- ─── student_cancellation_events: the policy's own number ────────────────────

-- The monthly engine charged the FULL lesson price for anything cancelled under
-- a hardcoded 24 hours, ignoring notice_hours_full, notice_hours_partial and
-- partial_charge_percent entirely — the same cancellation cost a monthly org
-- twice what it cost a per-lesson org. The cancellation path now writes what the
-- policy says, so both modes bill the same fee.
--
-- charge_override stays what it has always been: an admin's manual correction,
-- which still wins over the policy figure.
ALTER TABLE student_cancellation_events
  ADD COLUMN IF NOT EXISTS policy_amount numeric(10,2);

COMMENT ON COLUMN student_cancellation_events.policy_amount IS
  'Fee from the org cancellation policy at the moment of cancellation. NULL on rows written before this migration; those fall back to the legacy full-price rule.';

-- ─── student_cancellation_events: one event per (lesson, student) ────────────

-- Collapse existing duplicates onto the earliest row before the index lands.
DELETE FROM student_cancellation_events e
USING student_cancellation_events keep
WHERE e.lesson_id = keep.lesson_id
  AND e.student_id = keep.student_id
  AND (keep.created_at, keep.id) < (e.created_at, e.id);

CREATE UNIQUE INDEX IF NOT EXISTS student_cancellation_events_lesson_student_unique
  ON student_cancellation_events(lesson_id, student_id);
