-- Migration: 20260825000003_payment_requests.sql
-- Debt management, phase 3b: one payment request per parent, covering every
-- open charge at once, instead of a separate link and message per child.
--
-- The provider link is minted for the total, and its reference is stamped on
-- every included charge. The webhook already looks charges up by
-- payment_reference and marks ALL matches paid, so reconciliation needs no
-- change: paying one link settles the whole group.
--
-- charge_ids is a snapshot taken when the link was created. A charge added
-- afterwards is deliberately not covered — it stays open and is picked up by
-- the next request.

CREATE TABLE payment_requests (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  parent_id             uuid          NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  charge_ids            uuid[]        NOT NULL,
  total_amount          numeric(10,2) NOT NULL,
  payment_link          text,
  payment_reference     text,
  payment_provider      text,
  status                text          NOT NULL DEFAULT 'sent'
                          CHECK (status IN ('sent', 'paid', 'superseded', 'failed')),
  created_by_profile_id uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  created_at            timestamptz   NOT NULL DEFAULT now(),
  paid_at               timestamptz
);

CREATE INDEX idx_payment_requests_org_parent ON payment_requests (organization_id, parent_id, created_at DESC);
CREATE INDEX idx_payment_requests_reference  ON payment_requests (payment_reference);

-- No policies: reads and writes both go through the service-role client.
ALTER TABLE payment_requests ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE payment_requests IS
  'A consolidated payment link covering several charges for one parent. Service-role access only.';
