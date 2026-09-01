-- ── Measurement: tracking destinations and the delivery outbox (Sprint 34 § C)
-- Per /docs/sprint-34-scope.md.
--
-- src/ currently contains no tracking code at all — no gtag, no fbq, no
-- dataLayer, not one <script> tag — while src/app/privacy/PrivacyHe.tsx already
-- names Meta Pixel, GA4, PostHog and Hotjar as third parties we share data
-- with, and there is no consent banner anywhere. That is a compliance gap in
-- the unusual direction: the policy promises more than the code does. This
-- closes it the correct way round.

-- ── destinations ────────────────────────────────────────────────────────────
-- One row per place events are sent. Ids live here rather than in
-- NEXT_PUBLIC_* env vars because Next 16 inlines those at build time: a pixel
-- configured that way cannot be swapped without a redeploy, and silently
-- differs between environments.

CREATE TABLE IF NOT EXISTS tracking_destinations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        text NOT NULL
                    CHECK (provider IN ('meta_pixel', 'ga4', 'gtm', 'google_ads', 'tiktok', 'linkedin')),
  label           text NOT NULL,
  -- The public identifier: pixel id, measurement id, container id, tag id.
  external_id     text NOT NULL,
  -- Server-side credential (Meta CAPI access token, GA4 api_secret), encrypted
  -- with TRACKING_CONFIG_ENCRYPTION_KEY. Reversible on purpose — unlike an API
  -- key we mint, this is a third-party secret we have to replay.
  config_encrypted text,
  -- Meta's test_event_code / GA4 debug mode: routes events to the provider's
  -- debugging view instead of production reporting.
  test_event_code text,
  consent_category text NOT NULL DEFAULT 'marketing'
                    CHECK (consent_category IN ('necessary', 'analytics', 'marketing')),
  is_enabled      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- One live destination per provider. A second enabled Meta pixel would
-- double-count every conversion, which is worse than having none.
CREATE UNIQUE INDEX IF NOT EXISTS tracking_destinations_one_live_per_provider
  ON tracking_destinations (provider)
  WHERE is_enabled;

ALTER TABLE tracking_destinations ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE tracking_destinations IS
  'Where conversion events are sent. Platform-level, service-role only. Ids here, not in NEXT_PUBLIC_* — those are inlined at build time.';

-- ── delivery outbox ─────────────────────────────────────────────────────────
-- Every server-side send, so "did Meta actually receive it" is a query rather
-- than a guess. Also the retry queue: a failed row is picked up by a cron.

CREATE TABLE IF NOT EXISTS tracking_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name      text NOT NULL,
  -- Shared with the browser pixel's event so Meta deduplicates the pair.
  -- Without it a conversion fired both client- and server-side counts twice.
  event_id        text NOT NULL,
  destination_id  uuid REFERENCES tracking_destinations(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  visitor_id      text,
  value           numeric(12, 2),
  currency        text,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sent', 'failed')),
  attempts        int  NOT NULL DEFAULT 0,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz
);

-- Serves the 24-hour delivery log on /admin/tracking.
CREATE INDEX IF NOT EXISTS tracking_events_time_idx
  ON tracking_events (created_at DESC);

-- Serves the retry cron.
CREATE INDEX IF NOT EXISTS tracking_events_retry_idx
  ON tracking_events (status, created_at)
  WHERE status = 'failed';

-- One send per (event, destination): the retry must not create a duplicate,
-- and neither must a double-submitted form.
CREATE UNIQUE INDEX IF NOT EXISTS tracking_events_dedupe_idx
  ON tracking_events (event_id, destination_id);

ALTER TABLE tracking_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE tracking_events IS
  'Server-side conversion sends, with delivery status. Doubles as the retry queue and the operator-facing log.';
