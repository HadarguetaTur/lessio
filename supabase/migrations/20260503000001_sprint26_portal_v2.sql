-- Sprint 26: Parent Portal 2.0
-- Story 3c: Teacher notes visibility for parents
-- Story 4: Portal messaging (teacher ↔ parent)

-- ============================================================
-- Story 3c: visible_to_parent on lesson_notes
-- ============================================================

ALTER TABLE lesson_notes
  ADD COLUMN visible_to_parent boolean NOT NULL DEFAULT false;

-- ============================================================
-- Story 4: portal_messages
-- ============================================================

CREATE TABLE portal_messages (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  student_id        uuid        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  sender_parent_id  uuid        REFERENCES parents(id) ON DELETE SET NULL,
  sender_profile_id uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  body              text        NOT NULL,
  read_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portal_messages_one_sender
    CHECK (
      (sender_parent_id IS NOT NULL AND sender_profile_id IS NULL) OR
      (sender_parent_id IS NULL AND sender_profile_id IS NOT NULL)
    )
);

ALTER TABLE portal_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all_portal_messages"
  ON portal_messages AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

-- Thread lookup: org + student + chronological
CREATE INDEX idx_portal_messages_thread
  ON portal_messages (organization_id, student_id, created_at);

-- Unread count for parent: teacher-sent messages not yet read
CREATE INDEX idx_portal_messages_parent_unread
  ON portal_messages (organization_id, sender_profile_id)
  WHERE read_at IS NULL AND sender_profile_id IS NOT NULL;
