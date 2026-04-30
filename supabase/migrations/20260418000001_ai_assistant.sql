-- Sprint 19: AI WhatsApp Assistant
-- Adds opt-in toggle per org and multi-turn conversation log table.

-- Opt-in toggle per org (defaults to false — owner must explicitly enable)
ALTER TABLE organizations
  ADD COLUMN ai_assistant_enabled boolean NOT NULL DEFAULT false;

-- Multi-turn conversation storage for AI context + owner review
CREATE TABLE conversation_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  parent_id       uuid        REFERENCES parents(id),
  phone           text        NOT NULL,   -- E.164, for non-parent callers too
  role            text        NOT NULL CHECK (role IN ('user', 'assistant')),
  content         text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversation_log_org_phone ON conversation_log (organization_id, phone, created_at DESC);
CREATE INDEX idx_conversation_log_org_created ON conversation_log (organization_id, created_at DESC);

-- RLS: org-scoped read for owner + admin; all writes via service role only
ALTER TABLE conversation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversation_log_select_org" ON conversation_log
  FOR SELECT
  USING (
    organization_id = (
      SELECT organization_id FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'admin') AND is_active = true
    )
  );
