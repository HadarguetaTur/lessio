-- ── Custom message templates ────────────────────────────────────────────────
-- Per /docs/sprint-16-scope.md § Story 0
--
-- Stores per-org custom WhatsApp message bodies.
-- When no row exists for a given (organization_id, type) pair the application
-- falls back to the system-default Hebrew strings defined in
-- src/lib/whatsapp/templates.ts.
CREATE TABLE message_templates (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type            text        NOT NULL,
  body_template   text        NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, type)
);

-- type is a free-text enum; valid values enforced at the application layer:
--   booking_link | booking_confirmation | lesson_reminder | payment_reminder
--   payment_request | cancellation_confirmation | cancellation_admin_alert
--   receipt_notification | homework_assignment | homework_reminder
--   balance_reply | schedule_reply | portal_link_reply | unknown_intent_fallback

ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read own templates"
  ON message_templates FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "owner can manage own templates"
  ON message_templates FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles
      WHERE id = auth.uid() AND role = 'owner'
    )
  );

-- ── iCal token on teachers ──────────────────────────────────────────────────
-- UUID used as an opaque subscription token.
-- Regenerating (UPDATE to gen_random_uuid()) immediately invalidates old URLs.
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS ical_token uuid DEFAULT gen_random_uuid();

-- Index for fast token lookup in the calendar endpoint.
CREATE UNIQUE INDEX IF NOT EXISTS teachers_ical_token_idx ON teachers(ical_token);
