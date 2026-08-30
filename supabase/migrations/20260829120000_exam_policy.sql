-- Exam policy: what happens when a parent/student reports an exam.
--   notify  — teacher just gets the notification (default)
--   approve — notification carries a pending quota bump the teacher approves in one click
--   auto    — the weekly lesson quota is raised for the exam week automatically
-- exam_offer_booster additionally sends the billing parent a booking link.

ALTER TABLE organizations
  ADD COLUMN exam_policy_mode text NOT NULL DEFAULT 'notify'
    CHECK (exam_policy_mode IN ('notify', 'approve', 'auto')),
  ADD COLUMN exam_quota_bump smallint NOT NULL DEFAULT 1
    CHECK (exam_quota_bump BETWEEN 1 AND 5),
  ADD COLUMN exam_offer_booster boolean NOT NULL DEFAULT false;

-- Temporary weekly-quota raises. getWeeklyQuotaStatus adds extra_lessons to
-- students.weekly_quota for the matching week, so every booking layer
-- (calendar, slot lock, confirm, portal, bot) honours the bump automatically.
CREATE TABLE student_quota_overrides (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  student_id      uuid        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  week_start      date        NOT NULL, -- org-local Sunday (weekStartLocalDate)
  extra_lessons   smallint    NOT NULL CHECK (extra_lessons > 0),
  exam_id         uuid        REFERENCES student_exams(id) ON DELETE SET NULL,
  created_by      uuid        REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT student_quota_overrides_week_unique UNIQUE (student_id, week_start)
);

ALTER TABLE student_quota_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all_student_quota_overrides"
  ON student_quota_overrides AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

CREATE INDEX idx_student_quota_overrides_student
  ON student_quota_overrides (organization_id, student_id, week_start);

COMMENT ON TABLE student_quota_overrides IS
  'Per-week additions to students.weekly_quota (exam prep); service-role only.';
