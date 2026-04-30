-- Student exams (manual test grades) + private storage for progress report PDFs

-- ─── student_exams ───────────────────────────────────────────────────────────
CREATE TABLE student_exams (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject         text NOT NULL,
  title           text NOT NULL,
  exam_date       date NOT NULL,
  score           smallint NOT NULL CHECK (score >= 0),
  max_score       smallint NOT NULL DEFAULT 100 CHECK (max_score > 0),
  notes           text,
  created_by      uuid REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_exams_score_lte_max CHECK (score <= max_score)
);

ALTER TABLE student_exams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all_student_exams"
  ON student_exams AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

CREATE INDEX idx_student_exams_student ON student_exams (organization_id, student_id);
CREATE INDEX idx_student_exams_date ON student_exams (organization_id, student_id, exam_date);

COMMENT ON TABLE student_exams IS 'Per-student exam/test scores; dashboard CRUD via service role.';

-- ─── Storage: progress-reports (private PDFs) ────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('progress-reports', 'progress-reports', false)
ON CONFLICT (id) DO NOTHING;
