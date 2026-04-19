-- Sprint 23: GDPR compliance + WhatsApp session index
-- Per /docs/sprint-23-scope.md

-- ── Story 1a: Deletion requests ─────────────────────────────────────────────

CREATE TABLE data_deletion_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requester_phone text NOT NULL,
  status          text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'processed', 'dismissed')),
  processed_at    timestamptz,
  processed_by    uuid REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE data_deletion_requests ENABLE ROW LEVEL SECURITY;
-- Inserted via service role (portal action); read/updated via service role (superadmin).
-- No RLS policies — all access goes through service role client.

CREATE INDEX idx_data_deletion_requests_org_status
  ON data_deletion_requests (organization_id, status);

-- ── Story 1c: Data retention policy ─────────────────────────────────────────

ALTER TABLE organizations
  ADD COLUMN data_retention_days int DEFAULT 365;
-- NULL = never auto-anonymise (owner opt-out on Advanced/Custom plan)

-- ── Story 4b: Session-window index for sendSmartMessage ──────────────────────

CREATE INDEX IF NOT EXISTS idx_whatsapp_processed_messages_phone
  ON whatsapp_processed_messages (organization_id, from_phone, created_at DESC);
