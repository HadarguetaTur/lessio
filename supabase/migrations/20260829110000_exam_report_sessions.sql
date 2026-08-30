-- ── WhatsApp exam-report sessions ────────────────────────────────────────────
-- A student taps "report an exam" in their bot menu, then answers three
-- questions (subject → topic → date) and optionally sends a file. Same shape
-- as support_sessions: an explicit step column, one open session per
-- (org, phone), expiry checked at read time, deleted by any higher-priority
-- event (a menu tap, a completed report).

CREATE TABLE exam_report_sessions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  phone           text        NOT NULL,
  student_id      uuid        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  step            text        NOT NULL DEFAULT 'awaiting_subject'
                              CHECK (step IN ('awaiting_subject', 'awaiting_title', 'awaiting_date', 'awaiting_file')),
  draft_subject   text,
  draft_title     text,
  draft_exam_date date,
  expires_at      timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT exam_report_sessions_org_phone_unique UNIQUE (organization_id, phone)
);

ALTER TABLE exam_report_sessions ENABLE ROW LEVEL SECURITY;

-- Webhook-only, via service role — same posture as support_sessions.
CREATE POLICY "deny_all_exam_report_sessions"
  ON exam_report_sessions AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

COMMENT ON TABLE exam_report_sessions IS
  'In-flight WhatsApp exam reports from students; webhook-only via service role. Expiry is read-time, no cleanup cron.';
