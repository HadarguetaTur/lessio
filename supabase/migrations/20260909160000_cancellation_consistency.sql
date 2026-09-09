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

-- Second pass: a charge on a lesson with exactly ONE enrolled student is
-- unambiguously for that student, whoever the charge's parent happens to be.
-- The first pass joins relationships.is_primary, so it leaves NULL every
-- cancellation charge written by the pre-fix parent-initiated paths, which
-- "used to bill whoever tapped cancel" — a secondary parent, not the primary.
-- Those are not the sibling-ambiguity case and there are more of them.
UPDATE charges c
SET student_id = m.student_id
FROM (
  SELECT ls.lesson_id, min(ls.student_id::text)::uuid AS student_id
  FROM lesson_students ls
  GROUP BY ls.lesson_id
  HAVING count(*) = 1
) m
WHERE c.student_id IS NULL
  AND c.lesson_id = m.lesson_id
  AND c.charge_type IN ('lesson', 'cancellation');

-- What is left NULL after both passes is genuinely unresolvable: a GROUP lesson
-- whose charge cannot be tied to one enrolled student — either two of the
-- parent's children are on it (the under-billed case this migration exists to
-- fix) or the charge's parent is nobody's primary parent on that lesson. There
-- is no signal in the data that says which child the single row was for, so
-- guessing would corrupt history. They stay NULL, and the application-side
-- guard in createLessonCharge/createCancellationCharge treats such a row as
-- "this parent is already billed for this lesson" so re-completion cannot mint
-- a second charge beside it.
--
-- Measure the residue before deploying:
--   SELECT count(*), charge_type FROM charges
--   WHERE student_id IS NULL AND charge_type IN ('lesson','cancellation')
--   GROUP BY charge_type;

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

-- The two indexes above cannot dedupe a NULL student_id: in Postgres NULLs
-- compare distinct, so N legacy rows for one lesson all coexist and a freshly
-- minted per-student row collides with none of them. Two backstops:
--
-- 1. New rows MUST carry student_id. NOT VALID so the unresolvable legacy rows
--    above survive; it is enforced on every INSERT and UPDATE from here on,
--    which is what makes the "everything written from here on carries
--    student_id" claim true rather than aspirational.
ALTER TABLE charges
  DROP CONSTRAINT IF EXISTS charges_lesson_charge_has_student;
ALTER TABLE charges
  ADD CONSTRAINT charges_lesson_charge_has_student
  CHECK (charge_type NOT IN ('lesson', 'cancellation') OR student_id IS NOT NULL)
  NOT VALID;

-- 2. Legacy NULL rows dedupe among THEMSELVES on (lesson, parent, type), so a
--    replayed legacy write cannot stack a second one.
CREATE UNIQUE INDEX IF NOT EXISTS charges_legacy_null_student_unique
  ON charges(lesson_id, parent_id, charge_type)
  WHERE student_id IS NULL AND charge_type IN ('lesson', 'cancellation');

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
