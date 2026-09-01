-- Breaks between lessons become a teacher-level setting, and leftover time at
-- the end of a day stops disappearing silently.
--
-- Two scheduling edge cases motivated this:
--
-- 1. organizations.break_duration_minutes has existed since Sprint 1
--    (decisions.md #2) but only as a slot *stride* — the generator advanced the
--    cursor by lesson + break, while the overlap test let an offered slot begin
--    at the exact instant an existing lesson ended. It was also unreachable by
--    the org owner: only the superadmin console could edit it. And a break is a
--    property of the person teaching back-to-back, not of the business, so it
--    needs to live on the teacher.
--
-- 2. The slot loop drops whatever does not fit a whole lesson at the end of an
--    availability window. A 16:00-19:30 window booked with 60-minute lessons
--    discards 19:00-19:30 and tells nobody.
--
-- DEPLOY ORDER: this migration runs BEFORE the application code. Everything
-- here is additive — a nullable column, a defaulted column, a new table — so
-- the currently deployed code keeps working untouched (it selects none of
-- them). The reverse order breaks: selecting a column that does not exist is a
-- PostgREST error, and it would take down slot generation entirely.
--
-- Note this is the opposite of 20260901130000_availability_override_ranges.sql,
-- which required code first. That one changed the *meaning* of existing rows;
-- this one changes nothing that is already there.

-- ── Per-teacher break override ───────────────────────────────────────────────

ALTER TABLE teachers
  ADD COLUMN break_duration_minutes int NULL
    CHECK (break_duration_minutes IS NULL
           OR (break_duration_minutes >= 0 AND break_duration_minutes <= 120));

-- NULL and 0 are deliberately different. NULL follows the organization, so
-- raising the business default reaches the teachers who never expressed a
-- preference. 0 is a teacher saying "I teach back-to-back", and it must survive
-- the business changing its mind.
COMMENT ON COLUMN teachers.break_duration_minutes IS
  'Minutes this teacher needs between lessons. NULL inherits organizations.break_duration_minutes; 0 means no break, explicitly.';

-- ── Leftover-tail prompts ────────────────────────────────────────────────────

ALTER TABLE organizations
  ADD COLUMN tail_prompt_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN organizations.tail_prompt_enabled IS
  'Whether teachers are asked what to do with unbookable leftover time at the end of a day.';

-- A notification alone cannot carry this: the prompt is a state a teacher
-- resolves, not a message they read. The row is what dedupes repeat bookings on
-- one date, what remembers that the teacher already decided, and what the
-- action card reads.
--
-- Times are wall clock in the org timezone, matching availability and
-- availability_overrides. Storing an instant instead would put a DST
-- transition between the prompt and the window it describes.
CREATE TABLE availability_tail_prompts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  teacher_id      uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  tail_date       date NOT NULL,
  tail_start      time NOT NULL,
  tail_end        time NOT NULL,
  tail_minutes    int  NOT NULL CHECK (tail_minutes > 0),
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'dismissed', 'blocked', 'extended')),
  resolved_by     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT availability_tail_prompts_end_after_start CHECK (tail_start < tail_end),
  -- One prompt per teacher per date, ever. Every booking on a date recomputes
  -- the tail; without this each one would be another notification about the
  -- same half hour, and a teacher who already dismissed it would be asked again.
  CONSTRAINT availability_tail_prompts_teacher_date_key UNIQUE (teacher_id, tail_date)
);

CREATE TRIGGER set_updated_at_availability_tail_prompts
  BEFORE UPDATE ON availability_tail_prompts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_tail_prompts_pending
  ON availability_tail_prompts (organization_id, teacher_id, tail_date)
  WHERE status = 'pending';

-- Deny-all, in the shape of in_app_notifications: every read and write goes
-- through the service role from lib code that has already resolved the org from
-- the session.
ALTER TABLE availability_tail_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all_availability_tail_prompts"
  ON availability_tail_prompts AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

COMMENT ON TABLE availability_tail_prompts IS
  'Unbookable leftover time at the end of a teacher day, awaiting the teacher''s decision: block it, extend availability for that date, or dismiss. One row per teacher per date.';
