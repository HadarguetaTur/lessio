-- Multi-student lessons need one real-time charge per billing parent.
--
-- The old index (20260322000003) allowed a single 'lesson' charge per lesson,
-- which silently dropped every participant but the first in a pair/group/custom
-- lesson. Idempotency now keys on (lesson_id, parent_id): re-marking a lesson
-- completed is still a no-op, but each parent gets their own charge row.

DROP INDEX IF EXISTS charges_lesson_id_unique;

CREATE UNIQUE INDEX IF NOT EXISTS charges_lesson_parent_unique
  ON charges(lesson_id, parent_id)
  WHERE charge_type = 'lesson';
