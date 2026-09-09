-- Refund markers on charges.
--
-- Lessio has no refund concept at all. charge_payments.amount is
-- CHECK (amount > 0) so a reversal row is physically impossible, charges.status
-- has no 'refunded' member, and charges.amount_paid only ever grows. The result
-- is not "refunds are unsupported" — it is that after a refund the product
-- asserts something false: the revenue KPI, the revenue report and the CSV
-- export keep counting the money, and the parent portal keeps showing a green
-- "paid" badge next to a receipt for money that went back.
--
-- This is NOT a refund product. It is the minimum that stops the lie:
-- a marker saying a refund happened, how much, when, who recorded it and why.
-- The money movement itself happens at the payment provider or the bank; the
-- credit note, if one is owed, comes from the licensed receipt provider
-- (decision #37 — Lessio does not issue tax documents).
--
-- Deliberately NOT done here:
--   - no 'refunded' charge status. Status answers "is this collectable"; a
--     refunded charge is still settled, not open, and adding a sixth status
--     would mean auditing every status guard in the codebase for a marker that
--     is orthogonal to all of them.
--   - no negative charge_payments row. The ledger stays a record of money
--     received; the refund is recorded against the charge.
--   - amount_paid is left alone. It is recomputed from the ledger by the
--     payment webhook, so decrementing it here would be undone on the next
--     callback.

ALTER TABLE charges
  ADD COLUMN IF NOT EXISTS refunded_at            timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_amount        numeric(10,2),
  ADD COLUMN IF NOT EXISTS refund_reason          text,
  ADD COLUMN IF NOT EXISTS refunded_by_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN charges.refunded_at IS
  'When a refund of this charge was recorded in Lessio. The money moved at the provider or the bank; this is the marker, not the movement.';
COMMENT ON COLUMN charges.refunded_amount IS
  'How much went back, in org currency. Net revenue for a period subtracts this from the payments in the same period.';
COMMENT ON COLUMN charges.refunded_by_profile_id IS
  'Who recorded it. NULL when a payment provider webhook reported the refund itself.';

-- A refund is either fully recorded or not recorded. A refunded_at with no
-- amount would silently drop out of every net-revenue calculation.
ALTER TABLE charges DROP CONSTRAINT IF EXISTS charges_refund_consistent;
ALTER TABLE charges ADD CONSTRAINT charges_refund_consistent CHECK (
  (refunded_at IS NULL AND refunded_amount IS NULL)
  OR (refunded_at IS NOT NULL AND refunded_amount IS NOT NULL AND refunded_amount > 0)
);

-- Net revenue reads refunds by period, so the window predicate must be indexed.
CREATE INDEX IF NOT EXISTS idx_charges_org_refunded_at
  ON charges (organization_id, refunded_at)
  WHERE refunded_at IS NOT NULL;

-- 'refunded' joins the audit vocabulary. Recreated in full: the CHECK is a
-- list, not an enum, so it has to be rewritten to extend it.
ALTER TABLE charge_audit_log DROP CONSTRAINT IF EXISTS charge_audit_log_event_type_check;
ALTER TABLE charge_audit_log ADD CONSTRAINT charge_audit_log_event_type_check CHECK (event_type IN (
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
  'sync_conflict',
  -- Money went back to the parent. Recorded by an owner/admin, or by a payment
  -- provider webhook that reported a reversal (PayPlus does).
  'refunded'
));
