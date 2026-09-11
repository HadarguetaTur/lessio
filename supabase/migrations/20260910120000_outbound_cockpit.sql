-- ── Outbound cockpit: a lead has a next step, an unread reply can be cleared ──
-- The first real import showed that the admin screens told the founder what
-- existed but never what to do. Two facts were missing from the data model:
--
--   1. A reminder on the lead ("call back Sunday"). Without it the inbox has no
--      way to float the right person to the top on the right day.
--   2. Whether a person has read an inbound reply the classifier could not
--      place. Without it "replies that need a look" lights up for seven days
--      and never clears, whatever the founder does.
--
-- Both are plain columns; the partial indexes are the two queries the
-- cockpit runs on every page load.

ALTER TABLE platform_leads
  ADD COLUMN next_action_at   timestamptz,
  ADD COLUMN next_action_note text CHECK (next_action_note IS NULL OR length(next_action_note) <= 500);

CREATE INDEX platform_leads_next_action_idx
  ON platform_leads (next_action_at)
  WHERE next_action_at IS NOT NULL AND status NOT IN ('won', 'lost');

COMMENT ON COLUMN platform_leads.next_action_at IS
  'Founder-set reminder. A due reminder floats the lead to the top of /admin/leads; cleared when the lead is won or lost.';

ALTER TABLE outbound_messages ADD COLUMN reviewed_at timestamptz;

CREATE INDEX outbound_messages_needs_review_idx
  ON outbound_messages (created_at DESC)
  WHERE direction = 'in' AND reviewed_at IS NULL
    AND classification IN ('unknown', 'unmatched');

COMMENT ON COLUMN outbound_messages.reviewed_at IS
  'Set once a person has read an inbound message the classifier could not place. Also set for every inbound message of a lead when its status or notes change by hand.';
