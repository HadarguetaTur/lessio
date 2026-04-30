-- Sprint 12: Automated Reminders
-- Per /docs/sprint-12-scope.md § Story 1

-- ── Org-level reminder configuration ─────────────────────────────────────────

ALTER TABLE organizations
  ADD COLUMN reminders_enabled      boolean  NOT NULL DEFAULT true,
  ADD COLUMN lesson_reminder_hours  smallint NOT NULL DEFAULT 24
    CHECK (lesson_reminder_hours IN (2, 4, 12, 24, 48)),
  ADD COLUMN payment_reminder_days  smallint NOT NULL DEFAULT 7
    CHECK (payment_reminder_days > 0 AND payment_reminder_days <= 30);

COMMENT ON COLUMN organizations.reminders_enabled IS
  'Master switch: when false, no reminder jobs send for this org.';
COMMENT ON COLUMN organizations.lesson_reminder_hours IS
  'Send lesson reminder X hours before start_at. Allowed values: 2, 4, 12, 24, 48.';
COMMENT ON COLUMN organizations.payment_reminder_days IS
  'Send payment follow-up after charge has been pending for X days without being paid.';

-- ── Notification deduplication log ───────────────────────────────────────────

CREATE TABLE notification_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type            text        NOT NULL CHECK (type IN ('lesson_reminder', 'payment_reminder')),
  entity_id       uuid        NOT NULL,   -- lesson_id or charge_id
  sent_at         timestamptz NOT NULL DEFAULT now(),
  status          text        NOT NULL CHECK (status IN ('sent', 'failed')) DEFAULT 'sent',
  error_message   text,

  -- One send per entity per type — prevents duplicate messages
  UNIQUE (organization_id, type, entity_id)
);

COMMENT ON TABLE notification_log IS
  'Idempotency log for automated WhatsApp reminders. One row per entity per type ensures no duplicate sends.';

-- Index for Edge Function dedup lookups
CREATE INDEX idx_notification_log_lookup
  ON notification_log (organization_id, type, entity_id);

-- ── RLS: service-role only ────────────────────────────────────────────────────
-- Edge Functions use the service role key.
-- No authenticated user policies — dashboard reads go through service role as well.

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;
-- No public policies. Only accessible via service role key.
