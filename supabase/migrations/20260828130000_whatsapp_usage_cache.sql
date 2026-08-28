-- ── WhatsApp usage cache ─────────────────────────────────────────────────────
-- Backing store for the "Usage" tab on /settings/whatsapp. The tab is served
-- from Meta's WABA pricing analytics; this table holds the last fetched summary
-- per (org, period) so the page does not hit the Graph API on every load, and
-- so a stale copy survives a Meta outage.
--
-- Service-role only (no RLS policies), matching api_request_log: the only
-- reader is a server component that has already resolved organization_id.

CREATE TABLE IF NOT EXISTS whatsapp_usage_cache (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  days            smallint NOT NULL CHECK (days IN (30, 60, 90)),
  payload         jsonb NOT NULL,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, days)
);

ALTER TABLE whatsapp_usage_cache ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE whatsapp_usage_cache IS
  'Cached Meta pricing-analytics summaries for the WhatsApp usage tab. Service-role access only.';
