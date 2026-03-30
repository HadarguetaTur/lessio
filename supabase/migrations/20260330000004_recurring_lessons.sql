-- Sprint 11: Recurring Lessons
-- Adds lesson_series table and series_id column on lessons.

-- Represents a recurrence series (one row per series)
CREATE TABLE lesson_series (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  teacher_id      uuid NOT NULL REFERENCES teachers(id),
  student_id      uuid NOT NULL,   -- first / primary student (for display; actual per lesson_students)
  rule            jsonb NOT NULL,  -- { frequency: 'weekly'|'biweekly', day_of_week: 0-6, start_time: 'HH:MM', duration_minutes: number, until: 'YYYY-MM-DD' }
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES profiles(id)
);

COMMENT ON TABLE lesson_series IS 'Metadata for a recurring lesson series. Individual lessons reference this via series_id.';

-- Add series_id to lessons
ALTER TABLE lessons
  ADD COLUMN series_id uuid REFERENCES lesson_series(id) ON DELETE SET NULL;

COMMENT ON COLUMN lessons.series_id IS 'If set, this lesson belongs to a recurring series.';

-- Index for "cancel all future in series" queries
CREATE INDEX idx_lessons_series_id ON lessons(series_id) WHERE series_id IS NOT NULL;

-- RLS for lesson_series
ALTER TABLE lesson_series ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lesson_series_owner_admin_all"
  ON lesson_series FOR ALL TO authenticated
  USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') IN ('owner', 'admin')
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'app_role') IN ('owner', 'admin')
  );

CREATE POLICY "lesson_series_teacher_read"
  ON lesson_series FOR SELECT TO authenticated
  USING (
    teacher_id IN (
      SELECT id FROM teachers
      WHERE profile_id = auth.uid()
        AND organization_id = (auth.jwt() ->> 'org_id')::uuid
    )
  );
