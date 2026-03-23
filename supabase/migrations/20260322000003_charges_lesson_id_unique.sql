-- Sprint 3: Idempotency — prevent duplicate lesson charges
-- Only one charge per lesson is allowed when charge_type = 'lesson'
CREATE UNIQUE INDEX IF NOT EXISTS charges_lesson_id_unique
  ON charges(lesson_id)
  WHERE charge_type = 'lesson';
