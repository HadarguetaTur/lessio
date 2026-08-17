-- Migration: 20260817000003_parent_opt_out.sql
-- WhatsApp opt-out for parents.
--
-- Meta requires that a person can stop business-initiated messages by replying
-- with a stop word, and that the business honours it. Until now nothing in the
-- product recorded or enforced that.
--
-- Nullable timestamp rather than a boolean: it records *when* consent was
-- withdrawn, which is what a data-protection request actually asks for, and
-- resuming is a simple set-to-null.

ALTER TABLE parents
  ADD COLUMN IF NOT EXISTS opted_out_at timestamptz;

COMMENT ON COLUMN parents.opted_out_at IS
  'Set when the parent replied STOP over WhatsApp. Non-null blocks every business-initiated send (reminders, payment requests, notifications). Replies to the parent''s own inbound messages are still allowed.';

-- Partial index: the send path asks "is this one parent opted out?", and the
-- dashboard lists only opted-out parents. Both only ever touch non-null rows.
CREATE INDEX IF NOT EXISTS idx_parents_opted_out
  ON parents (organization_id, phone)
  WHERE opted_out_at IS NOT NULL;
