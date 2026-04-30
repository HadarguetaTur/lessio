-- ── Homework templates ────────────────────────────────────────────────────────
-- Reusable homework templates created by teachers within an org.
CREATE TABLE homework_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title           text NOT NULL,
  subject         text,
  body            text NOT NULL,  -- plain text, no markdown (Sprint 16 adds markdown)
  created_by      uuid NOT NULL REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE homework_templates IS 'Reusable homework templates. Teachers create these once and reuse across assignments.';

ALTER TABLE homework_templates ENABLE ROW LEVEL SECURITY;

-- Teacher can read/insert/update/delete their org's templates
CREATE POLICY "org members can manage homework templates"
  ON homework_templates
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles
      WHERE id = auth.uid() AND is_active = true
    )
  );

-- ── Homework assignments ──────────────────────────────────────────────────────
-- One assignment per student per homework event.
CREATE TABLE homework_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  teacher_id      uuid NOT NULL REFERENCES teachers(id),
  student_id      uuid NOT NULL REFERENCES students(id),
  template_id     uuid REFERENCES homework_templates(id) ON DELETE SET NULL,
  body            text NOT NULL,  -- copied from template at assignment time (denormalized)
  title           text NOT NULL,  -- copied from template or entered directly
  due_date        date,
  status          text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'done', 'overdue')),
  sent_at         timestamptz,    -- when WhatsApp message was dispatched
  completed_at    timestamptz,    -- when status changed to 'done'
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE homework_assignments IS 'Per-student homework assignments. Body is denormalized from template at creation time.';

ALTER TABLE homework_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can manage homework assignments"
  ON homework_assignments
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles
      WHERE id = auth.uid() AND is_active = true
    )
  );

-- Index for daily reminder cron: pending assignments with due_date tomorrow
CREATE INDEX idx_homework_assignments_pending_due
  ON homework_assignments(organization_id, due_date)
  WHERE status = 'pending';

-- ── Extend notification_log.type constraint ───────────────────────────────────
-- Add 'homework_reminder' to the allowed type values.
-- Note: Postgres does not support ALTER COLUMN ... DROP CONSTRAINT by name on
-- inline CHECK constraints — recreate the constraint instead.
ALTER TABLE notification_log DROP CONSTRAINT IF EXISTS notification_log_type_check;
ALTER TABLE notification_log ADD CONSTRAINT notification_log_type_check
  CHECK (type IN (
    'lesson_reminder',
    'payment_reminder',
    'homework_reminder'
  ));
