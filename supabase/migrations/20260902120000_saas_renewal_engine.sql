-- Migration: 20260902120000_saas_renewal_engine.sql
--
-- The SaaS renewal engine. Until now nothing charged a stored card again: the
-- token was written at activation and never read, so every paying customer
-- would have lapsed into past_due at the end of their first period. This adds
-- the state a self-managed renewal needs, and the two rules that keep money
-- and rows in step:
--
--   organization_subscriptions gains the retry state machine (attempt count,
--   next attempt, a claim lease) plus the card expiry Sumit reports, and the
--   timestamp a hosted checkout was started — the binding rule that refuses a
--   payment older than its checkout (see src/lib/saas/checkoutBinding.ts).
--
--   saas_invoices records every Sumit payment id exactly once (unique index —
--   the anti-replay guard) and grows real `failed` rows, so /admin/revenue's
--   failed-charges card stops being structurally zero.
--
-- The claim/success/failure steps are SQL functions rather than client code so
-- that two overlapping cron runs cannot charge the same subscription twice
-- (row lock + lease), and so that a renewal's UPDATE and its invoice INSERT
-- are one statement.

-- ─── organization_subscriptions ──────────────────────────────────────────────

ALTER TABLE organization_subscriptions
  ADD COLUMN IF NOT EXISTS pending_checkout_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS card_expiry_month           smallint,
  ADD COLUMN IF NOT EXISTS card_expiry_year            smallint,
  ADD COLUMN IF NOT EXISTS renewal_attempts            integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_renewal_attempt_at     timestamptz,
  ADD COLUMN IF NOT EXISTS last_renewal_attempt_at     timestamptz,
  ADD COLUMN IF NOT EXISTS last_renewal_error          text;

COMMENT ON COLUMN organization_subscriptions.pending_checkout_started_at IS
  'When the current pending_checkout_reference was issued. A Sumit payment dated before this (minus clock skew) cannot activate it.';
COMMENT ON COLUMN organization_subscriptions.renewal_attempts IS
  'Declined renewal charges for the current period. Reset to 0 on success. SYNC: RENEWAL_MAX_ATTEMPTS in src/lib/saas/renewal.ts';
COMMENT ON COLUMN organization_subscriptions.next_renewal_attempt_at IS
  'When the charger may try again after a decline (period_end + 3d, + 7d). NULL = due at current_period_end.';
COMMENT ON COLUMN organization_subscriptions.last_renewal_attempt_at IS
  'Set atomically when a cron run claims the row; doubles as the lease that stops an overlapping run from charging it too.';

CREATE INDEX IF NOT EXISTS idx_org_subscriptions_renewal_due
  ON organization_subscriptions (COALESCE(next_renewal_attempt_at, current_period_end))
  WHERE status IN ('active', 'past_due')
    AND cancel_at_period_end = false
    AND sumit_payment_token IS NOT NULL;

-- ─── saas_invoices ───────────────────────────────────────────────────────────

ALTER TABLE saas_invoices
  ADD COLUMN IF NOT EXISTS sumit_payment_id text,
  ADD COLUMN IF NOT EXISTS failure_reason   text,
  ADD COLUMN IF NOT EXISTS source           text NOT NULL DEFAULT 'checkout'
    CHECK (source IN ('checkout', 'renewal', 'manual'));

COMMENT ON COLUMN saas_invoices.sumit_payment_id IS
  'Sumit Payment.ID. Unique across paid rows: a payment id can activate or renew exactly one period, which is what makes a replayed callback harmless.';

-- A payment id may appear on one paid row only. Failed rows may repeat it (the
-- same declined payment id is re-attempted), so the index is on paid rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_saas_invoices_sumit_payment
  ON saas_invoices (sumit_payment_id)
  WHERE sumit_payment_id IS NOT NULL AND status = 'paid';

-- One paid invoice per subscription per period. Backstop against a double
-- renewal if the lease ever fails.
CREATE UNIQUE INDEX IF NOT EXISTS idx_saas_invoices_paid_period
  ON saas_invoices (subscription_id, billing_period_start)
  WHERE status = 'paid' AND billing_period_start IS NOT NULL;

-- ─── notification_log: trial reminder type ───────────────────────────────────

ALTER TABLE notification_log
  DROP CONSTRAINT IF EXISTS notification_log_type_check;

ALTER TABLE notification_log
  ADD CONSTRAINT notification_log_type_check CHECK (type IN (
    'lesson_reminder',
    'payment_reminder',
    'homework_reminder',
    'saas_renewal_reminder',
    'saas_dunning',
    'org_suspended_notice',
    -- Email to the owner at T-7 / T-3 / T-1 / T0 of a trial, and the
    -- receipt/cancellation confirmations. Keyed saas_trial:<sub>:<stage>,
    -- saas_receipt:<sub>:<period start>, saas_cancelled:<sub>:<period end>.
    'saas_trial_reminder',
    'saas_lifecycle_email'
  ));

-- Claim-before-send: the owner emails insert a 'pending' row, send, then mark
-- it sent/failed, so two overlapping runs cannot both send the same email.
ALTER TABLE notification_log
  DROP CONSTRAINT IF EXISTS notification_log_status_check;

ALTER TABLE notification_log
  ADD CONSTRAINT notification_log_status_check CHECK (status IN ('pending', 'sent', 'failed'));

-- ─── Claim ───────────────────────────────────────────────────────────────────
--
-- Returns the rows this run may charge, having stamped last_renewal_attempt_at
-- on them in the same statement. FOR UPDATE SKIP LOCKED plus the lease window
-- means a second run started a minute later sees none of them.

CREATE OR REPLACE FUNCTION public.claim_saas_renewals(
  p_now          timestamptz,
  p_lease        interval,
  p_max_attempts integer,
  p_limit        integer
)
RETURNS SETOF organization_subscriptions AS $$
  UPDATE organization_subscriptions s
     SET last_renewal_attempt_at = p_now
   WHERE s.id IN (
     SELECT id
       FROM organization_subscriptions
      WHERE status IN ('active', 'past_due')
        AND cancel_at_period_end = false
        AND sumit_payment_token IS NOT NULL
        AND renewal_attempts < p_max_attempts
        AND COALESCE(next_renewal_attempt_at, current_period_end) <= p_now
        AND (last_renewal_attempt_at IS NULL OR last_renewal_attempt_at < p_now - p_lease)
      ORDER BY COALESCE(next_renewal_attempt_at, current_period_end)
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
   )
  RETURNING s.*;
$$ LANGUAGE sql VOLATILE;

-- ─── Success ─────────────────────────────────────────────────────────────────
--
-- Extends the period FROM the previous period end, not from now: a customer
-- whose card bounced on the 1st and cleared on the 4th still owes from the 1st.
-- Postgres clamps 31 Jan + 1 month to 28 Feb, matching Luxon. Guarded on the
-- period end the caller charged for, so a stale caller is a no-op and returns
-- no row — the caller logs that loudly because the charge already happened.

CREATE OR REPLACE FUNCTION public.record_saas_renewal_success(
  p_subscription_id     uuid,
  p_expected_period_end timestamptz,
  p_amount              numeric,
  p_sumit_payment_id    text,
  p_sumit_document_id   text,
  p_sumit_document_url  text,
  p_card_last_four      text,
  p_card_expiry_month   smallint,
  p_card_expiry_year    smallint
)
RETURNS TABLE (organization_id uuid, new_period_start timestamptz, new_period_end timestamptz) AS $$
  WITH s AS (
    UPDATE organization_subscriptions
       SET status                  = 'active',
           current_period_start    = p_expected_period_end,
           current_period_end      = p_expected_period_end
             + CASE billing_interval WHEN 'yearly' THEN interval '1 year' ELSE interval '1 month' END,
           renewal_attempts        = 0,
           next_renewal_attempt_at = NULL,
           last_renewal_error      = NULL,
           card_last_four          = COALESCE(p_card_last_four, card_last_four),
           card_expiry_month       = COALESCE(p_card_expiry_month, card_expiry_month),
           card_expiry_year        = COALESCE(p_card_expiry_year, card_expiry_year),
           updated_at              = now()
     WHERE id = p_subscription_id
       AND status IN ('active', 'past_due')
       AND current_period_end = p_expected_period_end
    RETURNING id, organization_subscriptions.organization_id, current_period_start, current_period_end
  ), i AS (
    INSERT INTO saas_invoices (
      organization_id, subscription_id, amount, currency, status, source,
      sumit_payment_id, sumit_document_id, sumit_document_url,
      billing_period_start, billing_period_end, issued_at
    )
    SELECT s.organization_id, s.id, p_amount, 'ILS', 'paid', 'renewal',
           p_sumit_payment_id, p_sumit_document_id, p_sumit_document_url,
           s.current_period_start, s.current_period_end, now()
      FROM s
  )
  SELECT s.organization_id, s.current_period_start, s.current_period_end FROM s;
$$ LANGUAGE sql VOLATILE;

-- ─── Failure ─────────────────────────────────────────────────────────────────
--
-- A decline moves the subscription to past_due on the first attempt (the
-- grace window in derive_service_state starts counting from current_period_end
-- regardless), records the attempt, and schedules the next one. NULL
-- p_next_attempt_at means this was the last try.

CREATE OR REPLACE FUNCTION public.record_saas_renewal_failure(
  p_subscription_id  uuid,
  p_amount           numeric,
  p_error            text,
  p_sumit_payment_id text,
  p_next_attempt_at  timestamptz
)
RETURNS TABLE (organization_id uuid, renewal_attempts integer) AS $$
  WITH s AS (
    UPDATE organization_subscriptions
       SET status                  = 'past_due',
           renewal_attempts        = organization_subscriptions.renewal_attempts + 1,
           next_renewal_attempt_at = p_next_attempt_at,
           last_renewal_error      = left(p_error, 500),
           updated_at              = now()
     WHERE id = p_subscription_id
       AND status IN ('active', 'past_due')
    RETURNING id, organization_subscriptions.organization_id, current_period_end, billing_interval,
              organization_subscriptions.renewal_attempts
  ), i AS (
    INSERT INTO saas_invoices (
      organization_id, subscription_id, amount, currency, status, source,
      sumit_payment_id, failure_reason, billing_period_start, billing_period_end, issued_at
    )
    SELECT s.organization_id, s.id, p_amount, 'ILS', 'failed', 'renewal',
           p_sumit_payment_id, left(p_error, 500),
           s.current_period_end,
           s.current_period_end
             + CASE s.billing_interval WHEN 'yearly' THEN interval '1 year' ELSE interval '1 month' END,
           now()
      FROM s
  )
  SELECT s.organization_id, s.renewal_attempts FROM s;
$$ LANGUAGE sql VOLATILE;

REVOKE EXECUTE ON FUNCTION public.claim_saas_renewals(timestamptz, interval, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_saas_renewal_success(uuid, timestamptz, numeric, text, text, text, text, smallint, smallint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_saas_renewal_failure(uuid, numeric, text, text, timestamptz) FROM PUBLIC;
