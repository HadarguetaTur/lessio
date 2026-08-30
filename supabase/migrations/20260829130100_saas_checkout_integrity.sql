-- Migration: 20260829130100_saas_checkout_integrity.sql
--
-- Supports the platform-billing fixes in src/lib/saas/subscriptions.ts.
--
-- 1. previous_status / previous_plan_id
--    upsertPendingPaymentSubscription overwrites status and plan_id with
--    'pending_payment' + the target plan, which is lossy: nothing recorded what
--    the org had before. Both cancel actions therefore DELETEd the row instead
--    of reverting — and an org with no subscription row is treated as
--    grandfathered everywhere (getEffectiveSaasFeatures returns every flag
--    true, requireQuotaCapacity returns early, dashboard access is allowed).
--    "Start checkout, then cancel" handed out the full product for free,
--    permanently. These two columns let revertPendingCheckout put the org back
--    exactly where it was — including an active paying customer who started an
--    upgrade and changed their mind, who must not be dropped to free.
--
-- 2. unique index on sumit_document_id
--    The payment callback is a GET page and had no idempotency, so refreshing
--    it inserted another "paid" invoice row each time. The conditional UPDATE
--    in activateSubscriptionFromPayment is the primary guard; this index is the
--    backstop that makes a duplicate physically impossible. Partial, because
--    sumit_document_id is nullable and several rows may legitimately have none
--    (the dev-mock activation records amount 0 with no document).
--    activateSubscriptionFromPayment swallows 23505 on this index by design.

ALTER TABLE organization_subscriptions
  ADD COLUMN IF NOT EXISTS previous_status  text
    CHECK (previous_status IS NULL OR previous_status IN
      ('trial', 'active', 'pending_payment', 'past_due', 'cancelled', 'read_only')),
  ADD COLUMN IF NOT EXISTS previous_plan_id uuid REFERENCES saas_plans(id);

COMMENT ON COLUMN organization_subscriptions.previous_status IS
  'Status held before the in-flight checkout, so abandoning it restores the org instead of dropping it to free. NULL when no checkout is pending.';
COMMENT ON COLUMN organization_subscriptions.previous_plan_id IS
  'Plan held before the in-flight checkout. See previous_status.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_saas_invoices_sumit_document
  ON saas_invoices (sumit_document_id)
  WHERE sumit_document_id IS NOT NULL;
