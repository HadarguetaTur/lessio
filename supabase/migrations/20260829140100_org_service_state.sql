-- Migration: 20260829140100_org_service_state.sql
--
-- One denormalised column that every runtime can read to answer "is this org's
-- service on?" — maintained daily by saas-subscription-checker.
--
-- Why a column on `organizations` rather than a function computed live:
-- every hot path already selects from `organizations` — the WhatsApp webhook's
-- org lookup (src/app/api/whatsapp/webhook/route.ts), all four sending crons,
-- the portal. A column costs those paths nothing and lets a cron express the
-- gate as one `.eq('service_state','active')` inside a query it already runs.
-- Computing it live would mean re-implementing the grace-window arithmetic in
-- Node AND in Deno — the same duplication that produced the app_role RLS bug
-- fixed earlier today, where one copy silently drifted from the other.
--
-- The column can lag reality by up to a day. That is deliberate: nobody's
-- studio should go dark in the middle of a teaching afternoon because a cron
-- happened to fire. Reactivation on payment is immediate and does not wait for
-- the cron — the payment path writes 'active' directly.
--
--   active     paid, or trialling, or grandfathered
--   grace      period lapsed, inside PAST_DUE_GRACE_DAYS — everything still works
--   suspended  automations off, dashboard read-only, export available
--   dormant    30 days suspended — login reaches billing and export only
--
-- Deletion is a separate monthly job and is NOT driven by this column alone.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS service_state text NOT NULL DEFAULT 'active'
    CHECK (service_state IN ('active', 'grace', 'suspended', 'dormant')),
  ADD COLUMN IF NOT EXISTS service_state_changed_at timestamptz;

COMMENT ON COLUMN organizations.service_state IS
  'Denormalised service level, maintained daily by the saas-subscription-checker cron and written directly on payment. Read by the WhatsApp webhook, the sending crons and the parent portal. Never set this by hand outside those paths.';

-- Crons filter on it on every run, and it is low-cardinality.
CREATE INDEX IF NOT EXISTS idx_organizations_service_state
  ON organizations (service_state)
  WHERE service_state <> 'active';


-- ─── The ladder, defined once ────────────────────────────────────────────────
--
-- This lives in SQL rather than in the Edge Function because the Edge Function
-- is Deno and nothing in this repo can unit-test it: vitest only collects
-- src/**. A pure SQL function is both the single definition AND directly
-- checkable with a SELECT, against production, read-only. The cron becomes a
-- one-line RPC call.

/** Suspended orgs fall to dormant once they have been suspended long enough. */
CREATE OR REPLACE FUNCTION public.escalate_suspended_state(
  p_current_state    text,
  p_state_changed_at timestamptz,
  p_now              timestamptz,
  p_dormant_days     integer
)
RETURNS text AS $$
  SELECT CASE
    WHEN p_current_state = 'dormant' THEN 'dormant'
    WHEN p_current_state <> 'suspended' OR p_state_changed_at IS NULL THEN 'suspended'
    WHEN p_now >= p_state_changed_at + make_interval(days => p_dormant_days) THEN 'dormant'
    ELSE 'suspended'
  END
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.derive_service_state(
  p_status              text,
  p_trial_ends_at       timestamptz,
  p_current_period_end  timestamptz,
  p_current_state       text,
  p_state_changed_at    timestamptz,
  p_now                 timestamptz DEFAULT now(),
  p_grace_days          integer DEFAULT 7,   -- SYNC: PAST_DUE_GRACE_DAYS in src/lib/saas/subscriptions.ts
  p_dormant_days        integer DEFAULT 30
)
RETURNS text AS $$
  SELECT CASE
    -- 'pending_payment' is deliberately 'active'. An existing paying customer
    -- who starts an upgrade is moved into pending_payment by
    -- upsertPendingPaymentSubscription; treating that as a lapse would silence
    -- the bot of a customer whose only sin was clicking "upgrade".
    WHEN p_status IN ('active', 'pending_payment') THEN 'active'

    WHEN p_status = 'trial' THEN
      CASE WHEN p_trial_ends_at IS NOT NULL AND p_trial_ends_at <= p_now
           THEN public.escalate_suspended_state(p_current_state, p_state_changed_at, p_now, p_dormant_days)
           ELSE 'active' END

    WHEN p_status = 'past_due' THEN
      CASE
        -- No recorded period end: keep the service on. Cutting an org off over
        -- missing data is the worse failure.
        WHEN p_current_period_end IS NULL THEN 'grace'
        WHEN p_now <= p_current_period_end + make_interval(days => p_grace_days) THEN 'grace'
        ELSE public.escalate_suspended_state(p_current_state, p_state_changed_at, p_now, p_dormant_days)
      END

    WHEN p_status IN ('read_only', 'cancelled') THEN
      public.escalate_suspended_state(p_current_state, p_state_changed_at, p_now, p_dormant_days)

    ELSE 'active'
  END
$$ LANGUAGE sql IMMUTABLE;

-- ─── One pass over every org that has a subscription ─────────────────────────
-- Orgs with no subscription row are grandfathered and keep the column default.

CREATE OR REPLACE FUNCTION public.sync_org_service_states()
RETURNS TABLE (organization_id uuid, from_state text, to_state text) AS $$
  WITH desired AS (
    SELECT o.id,
           o.service_state AS current_state,
           public.derive_service_state(
             s.status, s.trial_ends_at, s.current_period_end,
             o.service_state, o.service_state_changed_at
           ) AS next_state
      FROM organizations o
      JOIN organization_subscriptions s ON s.organization_id = o.id
  ), changed AS (
    UPDATE organizations o
       SET service_state = d.next_state,
           service_state_changed_at = now()
      FROM desired d
     WHERE o.id = d.id
       AND d.next_state IS DISTINCT FROM d.current_state
    RETURNING o.id, d.current_state, d.next_state
  )
  SELECT id, current_state, next_state FROM changed
$$ LANGUAGE sql VOLATILE;

REVOKE EXECUTE ON FUNCTION public.sync_org_service_states() FROM PUBLIC;
