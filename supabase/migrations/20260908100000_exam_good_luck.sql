-- Exam good-luck message: an automated WhatsApp "good luck" to the student on
-- the morning of an exam (or N hours before it when the exam time is known).
--
--   student_exams.exam_time            optional; NULL = time unknown → morning send
--   exam_report_sessions.draft_exam_time  the bot flow captures "15/9 10:00" in one step
--   organizations.automation_exam_good_luck_enabled  per-org automation toggle
--   organizations.exam_good_luck_hour  org-local hour of the morning send (default 07:00)
--   organizations.exam_good_luck_hours_before  used only when exam_time is set
--
-- Sent by the hourly exam-good-luck Edge Function, deduplicated per exam through
-- notification_log (claim-before-send), so the type CHECK is recreated in full.

ALTER TABLE student_exams ADD COLUMN IF NOT EXISTS exam_time time;
COMMENT ON COLUMN student_exams.exam_time IS
  'Optional org-local start time of the exam. NULL = unknown: the good-luck message goes out at organizations.exam_good_luck_hour.';

ALTER TABLE exam_report_sessions ADD COLUMN IF NOT EXISTS draft_exam_time time;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS automation_exam_good_luck_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS exam_good_luck_hour smallint NOT NULL DEFAULT 7
    CHECK (exam_good_luck_hour BETWEEN 5 AND 12),
  ADD COLUMN IF NOT EXISTS exam_good_luck_hours_before smallint NOT NULL DEFAULT 2
    CHECK (exam_good_luck_hours_before IN (1, 2, 3));

COMMENT ON COLUMN organizations.exam_good_luck_hour IS
  'Org-local hour at which the exam good-luck message is sent on the exam day when the exam has no time.';
COMMENT ON COLUMN organizations.exam_good_luck_hours_before IS
  'When student_exams.exam_time is known: send this many hours before it (never earlier than exam_good_luck_hour).';

ALTER TABLE notification_log DROP CONSTRAINT IF EXISTS notification_log_type_check;
ALTER TABLE notification_log ADD CONSTRAINT notification_log_type_check CHECK (type IN (
  'lesson_reminder',
  'payment_reminder',
  'homework_reminder',
  'saas_renewal_reminder',
  'saas_dunning',
  'org_suspended_notice',
  'saas_trial_reminder',
  'saas_lifecycle_email',
  -- Good-luck message before an exam, keyed by student_exams.id
  'exam_good_luck'
));

CREATE INDEX IF NOT EXISTS idx_student_exams_org_date
  ON student_exams (organization_id, exam_date);
