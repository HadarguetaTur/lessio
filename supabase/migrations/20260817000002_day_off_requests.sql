-- ── Teacher day-off requests ────────────────────────────────────────────────
-- A teacher asks for a day (or a short run of days) off from the WhatsApp bot;
-- an owner or admin approves or rejects it from their own bot menu. On approval
-- the teacher's lessons in the range are cancelled with no parent charge, the
-- days are blocked in availability_overrides, and every affected parent is told.
--
-- This is the first write path a teacher has over WhatsApp. The owner-approval
-- gate is what makes that safe: nothing moves until a human with authority taps
-- approve, and the decision is recorded here with who made it and when.

CREATE TABLE day_off_requests (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  teacher_id        uuid        NOT NULL REFERENCES teachers(id)      ON DELETE CASCADE,
  start_date        date        NOT NULL,
  end_date          date        NOT NULL,
  status            text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at      timestamptz NOT NULL DEFAULT now(),
  decided_by        uuid        REFERENCES profiles(id),
  decided_at        timestamptz,
  -- Written on approval so the decision stays auditable after the fact: the
  -- lessons themselves only carry a free-text cancel_reason.
  lessons_cancelled integer,
  parents_notified  integer,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT day_off_requests_range_order CHECK (end_date >= start_date),
  -- 14 calendar days inclusive. A longer absence is a schedule change, not a
  -- day off, and belongs in the dashboard where the lessons can be moved rather
  -- than cancelled wholesale.
  CONSTRAINT day_off_requests_range_length CHECK (end_date - start_date <= 13)
);

ALTER TABLE day_off_requests ENABLE ROW LEVEL SECURITY;

-- Webhook-only, via service role — same posture as whatsapp_sender_preference.
CREATE POLICY "deny_all_day_off_requests"
  ON day_off_requests AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

-- The staff "pending requests" menu row reads exactly this.
CREATE INDEX idx_day_off_requests_org_status
  ON day_off_requests (organization_id, status);

-- One open request per teacher at a time. This is the constraint, not a UI
-- check: two taps of "send request" arrive as two webhook deliveries, and the
-- second must fail loudly (23505) rather than queue a duplicate for the owner.
CREATE UNIQUE INDEX idx_day_off_requests_one_pending
  ON day_off_requests (teacher_id)
  WHERE status = 'pending';

COMMENT ON TABLE day_off_requests IS
  'Teacher time-off requests raised and decided over WhatsApp; webhook-only via service role.';
