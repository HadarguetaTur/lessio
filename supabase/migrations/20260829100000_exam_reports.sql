-- Exam reports: parents (portal) and students (WhatsApp bot) can report an
-- upcoming exam — subject, description, date, optional attached file.
-- Reports merge into student_exams: score becomes nullable, a scored exam
-- keeps status='scored'; a report arrives as status='reported' and the teacher
-- fills the score in later.

ALTER TABLE student_exams
  ALTER COLUMN score DROP NOT NULL,
  ADD COLUMN source text NOT NULL DEFAULT 'staff' CHECK (source IN ('staff', 'parent', 'student')),
  ADD COLUMN status text NOT NULL DEFAULT 'scored' CHECK (status IN ('reported', 'scored')),
  ADD COLUMN description text,
  ADD COLUMN storage_path text,
  ADD COLUMN file_name text,
  ADD COLUMN mime_type text,
  ADD COLUMN reported_by_parent_id uuid REFERENCES parents(id) ON DELETE SET NULL,
  ADD CONSTRAINT student_exams_scored_has_score CHECK (status <> 'scored' OR score IS NOT NULL);

COMMENT ON COLUMN student_exams.source IS 'Who created the record: staff (dashboard), parent (portal), student (WhatsApp bot)';
COMMENT ON COLUMN student_exams.status IS 'reported = awaiting a score from the teacher; scored = has a score';

-- Private bucket for exam attachments (same posture as progress-reports)
INSERT INTO storage.buckets (id, name, public)
VALUES ('exam-files', 'exam-files', false)
ON CONFLICT (id) DO NOTHING;
