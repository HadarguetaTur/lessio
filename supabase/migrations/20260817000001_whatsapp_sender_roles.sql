-- ── WhatsApp bot: sender role awareness ─────────────────────────────────────
-- The webhook resolved every inbound phone against `parents` alone, so a
-- teacher, owner or student writing to the business number was indistinguishable
-- from a cold prospect and got filed as a sales lead.
--
-- Two things are needed to resolve a sender's capacity:
--   1. an index for the per-message students.phone lookup (it had none), and
--   2. somewhere to record an explicit choice when one phone holds several
--      capacities in the same org.

-- ─── students.phone lookup ───────────────────────────────────────────────────
-- students.phone had no index at all; resolveSender() queries it on every
-- inbound message. Partial: most students have no phone of their own.
CREATE INDEX IF NOT EXISTS idx_students_org_phone
  ON students (organization_id, phone)
  WHERE phone IS NOT NULL;

-- ─── profiles.phone lookup ───────────────────────────────────────────────────
-- idx_profiles_phone exists but is not org-scoped, and resolveSender() filters
-- on (organization_id, phone) for both the teacher and the staff branch.
CREATE INDEX IF NOT EXISTS idx_profiles_org_phone
  ON profiles (organization_id, phone)
  WHERE phone IS NOT NULL;

-- ─── whatsapp_sender_preference ──────────────────────────────────────────────
-- Nothing prevents one phone from being a parent AND a teacher in the same org:
-- parents.phone is unique per org, profiles.phone has no uniqueness at all, and
-- there is no cross-table constraint. resolveSender() applies a fixed precedence
-- (parent first, to preserve the pre-existing reply for a teacher who is also a
-- parent); this table lets that person override it from the bot menu.
--
-- Written ONLY on an explicit "switch role" tap — never inferred.
CREATE TABLE whatsapp_sender_preference (
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  phone           text        NOT NULL,
  role            text        NOT NULL CHECK (role IN ('parent', 'student', 'teacher', 'staff')),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, phone)
);

ALTER TABLE whatsapp_sender_preference ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all_whatsapp_sender_preference"
  ON whatsapp_sender_preference AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

COMMENT ON TABLE whatsapp_sender_preference IS
  'Explicit bot capacity choice for a phone holding several roles in one org; webhook-only via service role.';
