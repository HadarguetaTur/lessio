-- Migration: 20260825000001_charge_waive_void_audit.sql
-- Debt management, phase 1: a charge can be waived (forgiven — the money is not
-- owed any more) or voided (entered by mistake — it should never have existed).
--
-- Both are modelled as terminal `charges.status` values rather than boolean
-- columns, because every debt and revenue query in the app already filters on
-- status via OPEN_CHARGE_STATUSES = ('pending','invoiced') or status='paid'.
-- New statuses therefore drop out of the dashboard KPI, the debt report, the
-- parent portal and the reminder cron without touching those queries.
--
-- charge_audit_log records every state transition a charge goes through. It is
-- append-only and service-role only (no policies), the same access model as
-- notification_log.

-- ── Waive / void statuses ────────────────────────────────────────────────────

ALTER TABLE charges DROP CONSTRAINT IF EXISTS charges_status_check;
ALTER TABLE charges ADD CONSTRAINT charges_status_check
  CHECK (status IN ('pending', 'invoiced', 'paid', 'waived', 'voided'));

ALTER TABLE charges
  ADD COLUMN IF NOT EXISTS resolved_at             timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by_profile_id  uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS resolution_reason       text;

COMMENT ON COLUMN charges.resolved_at IS
  'When the charge was waived or voided. NULL for every other status.';
COMMENT ON COLUMN charges.resolution_reason IS
  'Mandatory free-text reason captured when waiving or voiding. Full history lives in charge_audit_log.';

-- ── Audit log ────────────────────────────────────────────────────────────────

CREATE TABLE charge_audit_log (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  charge_id         uuid        NOT NULL REFERENCES charges(id) ON DELETE CASCADE,
  parent_id         uuid        REFERENCES parents(id) ON DELETE SET NULL,
  event_type        text        NOT NULL CHECK (event_type IN (
                                  'created',
                                  'amount_adjusted',
                                  'waived',
                                  'voided',
                                  'unwaived',
                                  'payment_recorded',
                                  'marked_paid',
                                  'webhook_paid',
                                  'reminder_sent',
                                  'payment_request_sent',
                                  'sync_conflict'
                                )),
  -- NULL actor = system: webhook, cron, or the billing engine.
  actor_profile_id  uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  before_status     text,
  after_status      text,
  before_amount     numeric(10,2),
  after_amount      numeric(10,2),
  reason            text,
  metadata          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_charge_audit_org_charge
  ON charge_audit_log (organization_id, charge_id, created_at DESC);
CREATE INDEX idx_charge_audit_org_parent
  ON charge_audit_log (organization_id, parent_id, created_at DESC);

-- No policies: reads and writes both go through the service-role client.
ALTER TABLE charge_audit_log ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE charge_audit_log IS
  'Append-only history of charge state transitions. Service-role access only.';
