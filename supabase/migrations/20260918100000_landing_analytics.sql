-- ── First-party landing analytics + short marketing links ────────────────────
-- Per /docs/decisions.md (first-party anonymous measurement) and
-- /docs/sprint-34-scope.md § מנוע המדידה.
--
-- The attribution cookies (src/lib/attribution) already say where a *signup*
-- came from. They say nothing about the visitors who did not sign up — which
-- post brought them, how far down the page they got, how long they stayed and
-- what they clicked. That is the question a landing page is improved by, and
-- the consent-gated pixels cannot answer it for a few hundred organic visits
-- from a Facebook group, most of whom never touch the banner.
--
-- Anonymous on purpose: no IP, no full referrer URL, no click ids — only the
-- random visitor id the proxy already sets.

-- ── short links ─────────────────────────────────────────────────────────────
-- getlessio.com/go/<slug> → target_path + the stored utm_* values. One row per
-- post, so "which post worked" is a row in a table rather than a spreadsheet.

CREATE TABLE IF NOT EXISTS marketing_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL UNIQUE
                    CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  -- Relative only. The redirect is unauthenticated, so an absolute or
  -- protocol-relative target would make it an open redirect.
  target_path     text NOT NULL
                    CHECK (target_path ~ '^/' AND target_path !~ '^//'),
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  utm_content     text,
  utm_term        text,
  -- Where it was posted (the group), and which post.
  label           text NOT NULL,
  note            text,
  created_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  click_count     int NOT NULL DEFAULT 0,
  last_clicked_at timestamptz,
  archived_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE marketing_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_marketing_links"
  ON marketing_links AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

COMMENT ON TABLE marketing_links IS
  'Short /go/<slug> links with their UTM values. Platform-level, service-role only.';

-- Lookup and count in one statement: the redirect must cost one round trip.
CREATE OR REPLACE FUNCTION bump_marketing_link(p_slug text)
RETURNS TABLE (
  target_path  text,
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  utm_content  text,
  utm_term     text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE marketing_links m
     SET click_count = m.click_count + 1,
         last_clicked_at = now()
   -- Archived links still redirect: archiving tidies the admin list, but the
   -- post that carries the link is still out there.
   WHERE m.slug = p_slug
  RETURNING m.target_path, m.utm_source, m.utm_medium, m.utm_campaign,
            m.utm_content, m.utm_term;
$$;

REVOKE ALL ON FUNCTION bump_marketing_link(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION bump_marketing_link(text) TO service_role;

-- ── pageviews ───────────────────────────────────────────────────────────────
-- One row per landing pageview, updated in place by a handful of beacons —
-- not a raw event stream. Rows are bounded by visits, a retried beacon is
-- idempotent, and the report is a read of one narrow table.

CREATE TABLE IF NOT EXISTS landing_pageviews (
  -- Minted by the browser so every beacon of one pageview lands on one row.
  id               uuid PRIMARY KEY,
  visitor_id       text,
  path             text NOT NULL,
  -- Text, not a foreign key: the beacon must never do a lookup.
  link_slug        text,
  source           text,
  medium           text,
  campaign         text,
  content          text,
  term             text,
  -- Host only. A full referrer URL can carry a group or profile id.
  referrer_host    text,
  -- Flags, not values: a click id is a quasi-identifier we have no use for.
  has_fbclid       boolean NOT NULL DEFAULT false,
  has_gclid        boolean NOT NULL DEFAULT false,
  -- The source came from the last-touch cookie rather than this URL.
  touch_from_cookie boolean NOT NULL DEFAULT false,
  device           text CHECK (device IN ('mobile', 'tablet', 'desktop')),
  in_app           text,
  locale           text,
  started_at       timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  -- Bitmask over LANDING_SECTIONS (src/lib/landing-analytics/sections.ts).
  -- A mask rather than "furthest section": an anchor jump to #pricing must not
  -- mark everything above it as read.
  sections_seen    int NOT NULL DEFAULT 0,
  max_scroll_pct   smallint NOT NULL DEFAULT 0,
  engaged_ms       int NOT NULL DEFAULT 0,
  cta_clicks       text[] NOT NULL DEFAULT '{}',
  first_cta        text,
  first_cta_ms     int,
  -- Stamped once, at conversion, so the report never joins.
  signup_org_id    uuid REFERENCES organizations(id) ON DELETE SET NULL,
  lead_id          uuid REFERENCES platform_leads(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS landing_pageviews_time_idx
  ON landing_pageviews (started_at DESC);

CREATE INDEX IF NOT EXISTS landing_pageviews_visitor_idx
  ON landing_pageviews (visitor_id, started_at DESC)
  WHERE visitor_id IS NOT NULL;

ALTER TABLE landing_pageviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_landing_pageviews"
  ON landing_pageviews AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

COMMENT ON TABLE landing_pageviews IS
  'Anonymous first-party landing measurement: one row per pageview. No IP, no full referrer, no click ids. Service-role only; 180-day retention via scripts/setup-crons.sql.';

-- One statement per beacon. Progress only ever grows: beacons can arrive out of
-- order (a heartbeat racing the pagehide flush), and a late smaller one must
-- not roll the row back. Source columns are written on insert only.
CREATE OR REPLACE FUNCTION record_landing_pageview(p jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO landing_pageviews AS t (
    id, visitor_id, path, link_slug,
    source, medium, campaign, content, term,
    referrer_host, has_fbclid, has_gclid, touch_from_cookie,
    device, in_app, locale,
    sections_seen, max_scroll_pct, engaged_ms,
    cta_clicks, first_cta, first_cta_ms
  )
  VALUES (
    (p->>'id')::uuid, p->>'visitor_id', p->>'path', p->>'link_slug',
    p->>'source', p->>'medium', p->>'campaign', p->>'content', p->>'term',
    p->>'referrer_host',
    COALESCE((p->>'has_fbclid')::boolean, false),
    COALESCE((p->>'has_gclid')::boolean, false),
    COALESCE((p->>'touch_from_cookie')::boolean, false),
    p->>'device', p->>'in_app', p->>'locale',
    COALESCE((p->>'sections_seen')::int, 0),
    COALESCE((p->>'max_scroll_pct')::smallint, 0),
    COALESCE((p->>'engaged_ms')::int, 0),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p->'cta_clicks')), '{}'),
    p->>'first_cta',
    (p->>'first_cta_ms')::int
  )
  ON CONFLICT (id) DO UPDATE SET
    sections_seen  = t.sections_seen | EXCLUDED.sections_seen,
    max_scroll_pct = GREATEST(t.max_scroll_pct, EXCLUDED.max_scroll_pct),
    engaged_ms     = GREATEST(t.engaged_ms, EXCLUDED.engaged_ms),
    cta_clicks     = CASE
                       WHEN cardinality(EXCLUDED.cta_clicks) > cardinality(t.cta_clicks)
                       THEN EXCLUDED.cta_clicks ELSE t.cta_clicks
                     END,
    first_cta      = COALESCE(t.first_cta, EXCLUDED.first_cta),
    first_cta_ms   = COALESCE(t.first_cta_ms, EXCLUDED.first_cta_ms),
    last_seen_at   = now()
  -- A pageview id is only a credential for its own visitor, and only for the
  -- length of a visit: a replayed id cannot rewrite someone else's row.
  WHERE t.visitor_id IS NOT DISTINCT FROM EXCLUDED.visitor_id
    AND t.started_at > now() - interval '2 hours';
$$;

REVOKE ALL ON FUNCTION record_landing_pageview(jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_landing_pageview(jsonb) TO service_role;

-- Marks the visit that converted. The most recent pageview with a known source
-- wins over a later direct one: "came from the group post, returned by typing
-- the address, signed up" belongs to the post.
CREATE OR REPLACE FUNCTION stamp_landing_conversion(
  p_visitor_id text,
  p_org_id     uuid,
  p_lead_id    uuid
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE landing_pageviews
     SET signup_org_id = COALESCE(p_org_id, signup_org_id),
         lead_id       = COALESCE(p_lead_id, lead_id)
   WHERE id = (
     SELECT id
       FROM landing_pageviews
      WHERE visitor_id = p_visitor_id
        AND started_at > now() - interval '30 days'
      ORDER BY (link_slug IS NOT NULL OR source IS NOT NULL) DESC,
               started_at DESC
      LIMIT 1
   );
$$;

REVOKE ALL ON FUNCTION stamp_landing_conversion(text, uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION stamp_landing_conversion(text, uuid, uuid) TO service_role;

-- ── leads carry their source too ────────────────────────────────────────────
ALTER TABLE platform_leads
  ADD COLUMN IF NOT EXISTS content    text,
  ADD COLUMN IF NOT EXISTS visitor_id text;

-- ── Microsoft Clarity as a destination ──────────────────────────────────────
ALTER TABLE tracking_destinations
  DROP CONSTRAINT IF EXISTS tracking_destinations_provider_check;
ALTER TABLE tracking_destinations
  ADD CONSTRAINT tracking_destinations_provider_check
  CHECK (provider IN ('meta_pixel', 'ga4', 'gtm', 'google_ads', 'tiktok', 'linkedin', 'clarity'));
