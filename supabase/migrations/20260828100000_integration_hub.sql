-- ── Integration Hub (Sprint 33, M1) ──────────────────────────────────────────
-- Per /docs/decisions.md #28 (Integration Hub Shape) and #30 (Tenant-Owned
-- Channel and Integration Credentials).
--
-- Three things ship together because they are one feature:
--   1. organization_api_keys — lets an org authenticate Make / n8n / an MCP
--      client against /api/v1 without a Supabase session.
--   2. api_request_log       — the sliding window the per-key rate limiter counts,
--      and the record an org owner reads when an automation misbehaves.
--   3. the 'make' payment provider slug + the `integrations` plan feature.
--
-- Both tables are service-role only (no RLS policies), matching charge_audit_log:
-- everything that reads them goes through a server action or a route handler that
-- has already resolved organization_id itself.

-- ── API keys ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organization_api_keys (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  -- sha256 hex of the full key. A one-way digest, not encryptWithKey: the key is
  -- 32 random bytes, so there is nothing to brute-force and nothing that needs to
  -- be reversible. Lookup is a direct hit on this unique index.
  key_hash        text NOT NULL UNIQUE,
  -- First 12 characters ("lsk_live_ab1"), for identifying a key in the UI after
  -- the one time the full value is shown.
  key_prefix      text NOT NULL,
  scopes          text[] NOT NULL DEFAULT '{}',
  created_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  last_used_at    timestamptz,
  revoked_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- The settings screen lists live keys for one org; revoked ones stay for audit.
CREATE INDEX IF NOT EXISTS organization_api_keys_org_active_idx
  ON organization_api_keys (organization_id)
  WHERE revoked_at IS NULL;

ALTER TABLE organization_api_keys ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE organization_api_keys IS
  'Per-org API credentials for /api/v1 (Make, n8n, MCP). Service-role access only.';

-- ── Request log ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS api_request_log (
  id              bigserial PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  api_key_id      uuid REFERENCES organization_api_keys(id) ON DELETE SET NULL,
  method          text NOT NULL,
  path            text NOT NULL,
  status_code     int  NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Serves the rate-limit count (WHERE api_key_id = … AND created_at > …).
CREATE INDEX IF NOT EXISTS api_request_log_key_time_idx
  ON api_request_log (api_key_id, created_at DESC);

-- Serves the per-org activity list on the settings screen.
CREATE INDEX IF NOT EXISTS api_request_log_org_time_idx
  ON api_request_log (organization_id, created_at DESC);

ALTER TABLE api_request_log ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE api_request_log IS
  'One row per /api/v1 request. Doubles as the rate limiter window and the org-facing activity log.';

-- ── 'make' payment provider ──────────────────────────────────────────────────
-- The org points Lessio at its own Make/n8n webhook, which talks to the real
-- processor and hands the payment URL back synchronously. Adding the slug to the
-- CHECK is not optional: without it savePaymentProvider fails on write (see the
-- note in 20260826120000_add_grow_payment_provider.sql about Stripe).

ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_payment_provider_check;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_payment_provider_check
  CHECK (payment_provider IN ('cardcom', 'payplus', 'bit', 'paybox', 'stripe', 'grow', 'make'));

-- ── `integrations` plan feature ──────────────────────────────────────────────
-- parseSaasFeatures reads this key by name and coerces a missing one to false,
-- so every existing row needs an explicit value.

UPDATE saas_plans
   SET features = features || '{"integrations": true}'::jsonb
 WHERE name IN ('advanced', 'custom');

UPDATE saas_plans
   SET features = features || '{"integrations": false}'::jsonb
 WHERE name IN ('free', 'basic');
