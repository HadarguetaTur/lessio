-- ── Outbound acquisition engine (V1) ─────────────────────────────────────────
-- Lessio had no cold-lead path: saas_plan_inquiries needs an org that already
-- signed up, and the tenant `leads` table is WhatsApp parents. This adds the
-- minimum for "CSV -> first email -> reply -> Lead -> demo email" with every
-- piece of state and copy inside Lessio. Make.com is only the transport that
-- sends the cold email and posts replies back; it never holds copy or state.
--
-- platform_leads is created here with Sprint 34 M3's exact name and a subset
-- of its columns, so M3 later only adds columns (never renames).
--
-- All tables are read only through the service role behind
-- requirePlatformSession(), so RLS is on with an explicit deny — the same
-- posture as organization_api_keys and admin_audit_log.

-- ── Campaigns: the cold email copy ──────────────────────────────────────────

CREATE TABLE outbound_campaigns (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  subject    text        NOT NULL,
  -- {{first_name}} {{last_name}} {{company}} {{personal_line}} {{subject_area}}
  -- and {{metadata.<key>}} are substituted per prospect at claim time.
  body_text  text        NOT NULL,
  locale     text        NOT NULL DEFAULT 'he' CHECK (locale IN ('he', 'en')),
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_outbound_campaigns_updated_at
  BEFORE UPDATE ON outbound_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE outbound_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_outbound_campaigns"
  ON outbound_campaigns AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

COMMENT ON TABLE outbound_campaigns IS
  'Cold-email copy for the outbound engine. Rendered per prospect at claim time; Make never holds copy. Service role only.';

-- ── Global suppression ──────────────────────────────────────────────────────
-- One list, not per campaign: an address that asked out must never be mailed
-- again by any future import.

CREATE TABLE outbound_suppressions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text        NOT NULL UNIQUE CHECK (email = lower(btrim(email))),
  reason     text        NOT NULL CHECK (reason IN ('unsubscribed', 'bounced', 'manual', 'replied_negative')),
  source     text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE outbound_suppressions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_outbound_suppressions"
  ON outbound_suppressions AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

COMMENT ON TABLE outbound_suppressions IS
  'Global do-not-email list for the outbound engine. Checked at import, at claim time, and on manual add. Service role only.';

-- ── Prospects: the queue ────────────────────────────────────────────────────

CREATE TABLE outbound_prospects (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id        uuid        NOT NULL REFERENCES outbound_campaigns(id) ON DELETE RESTRICT,
  -- One prospect per address, globally: this is what makes matching a reply
  -- by its from-address unambiguous.
  email              text        NOT NULL UNIQUE CHECK (email = lower(btrim(email))),
  first_name         text,
  last_name          text,
  company            text,
  phone              text,
  locale             text        NOT NULL DEFAULT 'he' CHECK (locale IN ('he', 'en')),
  -- Personalisation comes in with the CSV, not from AI.
  personal_line      text,
  subject_area       text,
  source_url         text,
  metadata           jsonb       NOT NULL DEFAULT '{}',
  status             text        NOT NULL DEFAULT 'queued'
                                 CHECK (status IN ('queued', 'claimed', 'sent', 'failed', 'replied',
                                                   'interested', 'not_interested', 'unsubscribed',
                                                   'bounced', 'suppressed', 'converted')),
  send_attempts      integer     NOT NULL DEFAULT 0,
  claimed_at         timestamptz,
  sent_at            timestamptz,
  replied_at         timestamptz,
  last_reply_class   text,
  platform_lead_id   uuid,       -- FK added after platform_leads exists
  demo_email_sent_at timestamptz,
  import_batch_id    uuid,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX outbound_prospects_status_created_idx ON outbound_prospects (status, created_at);
CREATE INDEX outbound_prospects_campaign_status_idx ON outbound_prospects (campaign_id, status);

CREATE TRIGGER set_outbound_prospects_updated_at
  BEFORE UPDATE ON outbound_prospects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE outbound_prospects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_outbound_prospects"
  ON outbound_prospects AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

COMMENT ON TABLE outbound_prospects IS
  'Cold-outreach queue. status is the state machine (src/lib/outbound/transitions.ts). Service role only.';

-- ── Messages: everything sent or received ───────────────────────────────────

CREATE TABLE outbound_messages (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL = an inbound message we could not match; kept, never dropped.
  prospect_id          uuid        REFERENCES outbound_prospects(id) ON DELETE CASCADE,
  direction            text        NOT NULL CHECK (direction IN ('out', 'in')),
  kind                 text        NOT NULL CHECK (kind IN ('cold_email', 'reply', 'demo_email')),
  -- Transport is abstract on purpose: 'make' today sends through whatever
  -- mailbox the scenario holds; swapping that mailbox changes nothing here.
  transport            text        NOT NULL CHECK (transport IN ('make', 'resend')),
  transport_message_id text,
  transport_thread_id  text,
  rfc_message_id       text,
  in_reply_to          text,
  from_email           text,
  subject              text,
  body                 text,
  classification       text        CHECK (classification IN ('interested', 'not_interested', 'unsubscribe',
                                                             'auto_reply', 'bounce', 'unknown', 'unmatched')),
  error                text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- Idempotency: Make retries a failed HTTP step, and a reply posted twice must
-- not be classified twice.
CREATE UNIQUE INDEX outbound_messages_transport_msg_idx
  ON outbound_messages (transport, transport_message_id)
  WHERE transport_message_id IS NOT NULL;
CREATE INDEX outbound_messages_prospect_created_idx ON outbound_messages (prospect_id, created_at DESC);
CREATE INDEX outbound_messages_thread_idx
  ON outbound_messages (transport_thread_id)
  WHERE transport_thread_id IS NOT NULL;
CREATE INDEX outbound_messages_inbound_created_idx
  ON outbound_messages (created_at DESC)
  WHERE direction = 'in';

ALTER TABLE outbound_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_outbound_messages"
  ON outbound_messages AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

COMMENT ON TABLE outbound_messages IS
  'Every cold email, reply and demo email of the outbound engine. Unique on (transport, transport_message_id) for idempotency. Service role only.';

-- ── Platform leads (Sprint 34 M3 subset) ────────────────────────────────────

CREATE TABLE platform_leads (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text,
  email            text        CHECK (email IS NULL OR email = lower(btrim(email))),
  phone            text,
  company          text,
  status           text        NOT NULL DEFAULT 'new'
                               CHECK (status IN ('new', 'contacted', 'qualified', 'trial', 'won', 'lost')),
  lost_reason      text,
  notes            text,
  source           text,
  medium           text,
  campaign         text,
  owner_profile_id uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  prospect_id      uuid        REFERENCES outbound_prospects(id) ON DELETE SET NULL,
  converted_org_id uuid        REFERENCES organizations(id) ON DELETE SET NULL,
  converted_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- A second submission from the same address updates, never duplicates.
CREATE UNIQUE INDEX platform_leads_email_idx ON platform_leads (email) WHERE email IS NOT NULL;
CREATE INDEX platform_leads_status_created_idx ON platform_leads (status, created_at DESC);

CREATE TRIGGER set_platform_leads_updated_at
  BEFORE UPDATE ON platform_leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE platform_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_platform_leads"
  ON platform_leads AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

COMMENT ON TABLE platform_leads IS
  'Lessio''s own sales leads (Sprint 34 M3 subset). Deliberately separate from the tenant `leads` table. Service role only.';

ALTER TABLE outbound_prospects
  ADD CONSTRAINT outbound_prospects_platform_lead_id_fkey
  FOREIGN KEY (platform_lead_id) REFERENCES platform_leads(id) ON DELETE SET NULL;

CREATE TABLE platform_lead_events (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id          uuid        NOT NULL REFERENCES platform_leads(id) ON DELETE CASCADE,
  type             text        NOT NULL CHECK (type IN ('form_submit', 'status_change', 'note', 'email', 'call',
                                                        'page_view', 'signup', 'trial_start', 'paid',
                                                        'whatsapp_in', 'whatsapp_out',
                                                        'outbound_reply', 'demo_email')),
  payload          jsonb       NOT NULL DEFAULT '{}',
  actor_profile_id uuid,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX platform_lead_events_lead_created_idx ON platform_lead_events (lead_id, created_at DESC);

ALTER TABLE platform_lead_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_platform_lead_events"
  ON platform_lead_events AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);

COMMENT ON TABLE platform_lead_events IS
  'Timeline of a platform lead. Service role only.';

-- ── Claim: the queue's one write path from the transport ────────────────────
-- Claims up to p_limit eligible prospects atomically. A claimed row whose
-- lease expired is eligible again, so a Make run that died between fetch and
-- send heals itself without a sweeper. Same shape as claim_saas_renewals.

CREATE OR REPLACE FUNCTION public.claim_next_outbound_prospects(
  p_now         timestamptz,
  p_lease       interval,
  p_limit       integer,
  p_campaign_id uuid DEFAULT NULL
)
RETURNS SETOF outbound_prospects AS $$
  UPDATE outbound_prospects p
     SET status = 'claimed', claimed_at = p_now
   WHERE p.id IN (
     SELECT p2.id
       FROM outbound_prospects p2
       JOIN outbound_campaigns c ON c.id = p2.campaign_id AND c.is_active
      WHERE (p2.status = 'queued'
             OR (p2.status = 'claimed' AND p2.claimed_at < p_now - p_lease))
        AND (p_campaign_id IS NULL OR p2.campaign_id = p_campaign_id)
        AND NOT EXISTS (SELECT 1 FROM outbound_suppressions s WHERE s.email = p2.email)
      ORDER BY p2.created_at
      LIMIT GREATEST(1, LEAST(p_limit, 50))
      FOR UPDATE OF p2 SKIP LOCKED
   )
  RETURNING p.*;
$$ LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.claim_next_outbound_prospects(timestamptz, interval, integer, uuid) FROM PUBLIC, anon, authenticated;
