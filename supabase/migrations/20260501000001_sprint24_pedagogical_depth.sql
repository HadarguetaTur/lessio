-- Sprint 24: Pedagogical Depth
-- Per /docs/sprint-24-scope.md

-- ── Story 1: Homework v2 ──────────────────────────────────────────────────────

-- Scheduled sending support
ALTER TABLE homework_assignments
  ADD COLUMN send_at   timestamptz,
  ADD COLUMN sent      boolean NOT NULL DEFAULT false;

-- Index for homework-sender cron (picks up unsent scheduled assignments)
CREATE INDEX idx_homework_assignments_unsent
  ON homework_assignments (send_at)
  WHERE sent = false AND send_at IS NOT NULL;

-- File attachments on assignments (teacher uploads)
-- Storage bucket: homework-attachments (create via Supabase dashboard)
CREATE TABLE homework_attachments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assignment_id   uuid NOT NULL REFERENCES homework_assignments(id) ON DELETE CASCADE,
  file_name       text NOT NULL,
  storage_path    text NOT NULL,
  mime_type       text,
  size_bytes      bigint,
  uploaded_by     uuid REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE homework_attachments ENABLE ROW LEVEL SECURITY;
-- All access via service role client.

CREATE INDEX idx_homework_attachments_assignment
  ON homework_attachments (assignment_id);

-- Student submissions (one per assignment+student)
-- Storage bucket: homework-submissions (create via Supabase dashboard)
CREATE TABLE homework_submissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assignment_id   uuid NOT NULL REFERENCES homework_assignments(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  storage_path    text,          -- null = text-only submission
  file_name       text,
  mime_type       text,
  note            text,
  score           smallint CHECK (score >= 0 AND score <= 100),
  feedback        text,
  graded_at       timestamptz,
  graded_by       uuid REFERENCES profiles(id),
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, student_id)
);

ALTER TABLE homework_submissions ENABLE ROW LEVEL SECURITY;
-- All access via service role client.

CREATE INDEX idx_homework_submissions_assignment
  ON homework_submissions (assignment_id);
CREATE INDEX idx_homework_submissions_student
  ON homework_submissions (student_id);

-- ── Story 2: Lesson notes ─────────────────────────────────────────────────────

CREATE TABLE lesson_notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lesson_id       uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  teacher_id      uuid NOT NULL REFERENCES teachers(id),
  body            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE lesson_notes ENABLE ROW LEVEL SECURITY;
-- All access via service role client.

CREATE INDEX idx_lesson_notes_lesson   ON lesson_notes (lesson_id);
CREATE INDEX idx_lesson_notes_teacher  ON lesson_notes (teacher_id);

-- ── Story 4: Student learning goals ──────────────────────────────────────────

CREATE TABLE student_goals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject         text NOT NULL,
  description     text NOT NULL,
  target_date     date,
  status          text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'achieved', 'abandoned')),
  created_by      uuid REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE student_goals ENABLE ROW LEVEL SECURITY;
-- All access via service role client.

CREATE INDEX idx_student_goals_student ON student_goals (student_id);
CREATE INDEX idx_student_goals_org_status
  ON student_goals (organization_id, status);
