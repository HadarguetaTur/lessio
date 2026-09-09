-- ── Outbound V2: AI openers, reply-only follow-ups, permanent unsubscribe ───
-- Three things the first real run asked for:
--   * the opening line is drafted by the platform AI from the prospect's site
--     and reviewed by the founder before the prospect can be claimed;
--   * a prospect who replied gets up to two follow-ups in the same Gmail
--     thread, from the same mailbox, cancelled by any real reply;
--   * unsubscribe (a reply, or the one-click link every email now carries)
--     keeps ONLY the address in outbound_suppressions and deletes everything
--     else about the person — prospect, messages, lead, events.

-- ── Prospects ───────────────────────────────────────────────────────────────

ALTER TABLE outbound_prospects
  ADD COLUMN gender               text CHECK (gender IN ('f', 'm')),
  ADD COLUMN opener_status        text NOT NULL DEFAULT 'none'
                                  CHECK (opener_status IN ('none', 'pending', 'generated', 'approved', 'failed')),
  ADD COLUMN opener_generated     text,
  ADD COLUMN opener_model         text,
  ADD COLUMN opener_error         text,
  ADD COLUMN opener_claimed_at    timestamptz,
  ADD COLUMN unsubscribe_token    text,
  ADD COLUMN followup_stage       smallint NOT NULL DEFAULT 0,
  ADD COLUMN next_followup_at     timestamptz,
  ADD COLUMN followup_claimed_at  timestamptz,
  ADD COLUMN followup_attempts    smallint NOT NULL DEFAULT 0,
  ADD COLUMN last_inbound_at      timestamptz;

-- Every existing row gets a token so the link works on rows imported before V2.
UPDATE outbound_prospects
   SET unsubscribe_token = md5(gen_random_uuid()::text || clock_timestamp()::text || id::text)
 WHERE unsubscribe_token IS NULL;

ALTER TABLE outbound_prospects
  ALTER COLUMN unsubscribe_token SET NOT NULL,
  ADD CONSTRAINT outbound_prospects_unsubscribe_token_key UNIQUE (unsubscribe_token),
  ADD CONSTRAINT outbound_prospects_unsubscribe_token_hex CHECK (unsubscribe_token ~ '^[0-9a-f]{32}$');

CREATE INDEX outbound_prospects_next_followup_idx
  ON outbound_prospects (next_followup_at)
  WHERE next_followup_at IS NOT NULL;

CREATE INDEX outbound_prospects_opener_review_idx
  ON outbound_prospects (created_at)
  WHERE opener_status IN ('pending', 'generated', 'failed');

COMMENT ON COLUMN outbound_prospects.opener_status IS
  'none = personal_line came with the CSV or there is no source; pending -> generated (AI draft) -> approved by the founder, which writes personal_line. Only none/approved rows are claimable for sending.';
COMMENT ON COLUMN outbound_prospects.unsubscribe_token IS
  'Bearer of /u/<token>. 128-bit random; the row is deleted when it is used.';
COMMENT ON COLUMN outbound_prospects.next_followup_at IS
  'When the next follow-up is due. NULL = nothing pending. Cleared by any real inbound reply.';

-- ── Messages ────────────────────────────────────────────────────────────────

ALTER TABLE outbound_messages DROP CONSTRAINT IF EXISTS outbound_messages_kind_check;
ALTER TABLE outbound_messages
  ADD CONSTRAINT outbound_messages_kind_check
  CHECK (kind IN ('cold_email', 'reply', 'demo_email', 'followup'));

-- Erase must also find inbound rows that never matched a prospect.
CREATE INDEX outbound_messages_from_email_idx
  ON outbound_messages (from_email)
  WHERE from_email IS NOT NULL;

-- ── Claim: a prospect awaiting opener review is never sent ──────────────────

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
        AND p2.opener_status IN ('none', 'approved')
        AND (p_campaign_id IS NULL OR p2.campaign_id = p_campaign_id)
        AND NOT EXISTS (SELECT 1 FROM outbound_suppressions s WHERE s.email = p2.email)
      ORDER BY p2.created_at
      LIMIT GREATEST(1, LEAST(p_limit, 50))
      FOR UPDATE OF p2 SKIP LOCKED
   )
  RETURNING p.*;
$$ LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public;

-- ── Claim: follow-ups that are due ──────────────────────────────────────────
-- Own lease column so a run that dies mid-send retries, and the "give up"
-- signal (attempts) stays separate from the schedule itself.

CREATE OR REPLACE FUNCTION public.claim_due_followups(
  p_now   timestamptz,
  p_lease interval,
  p_limit integer
)
RETURNS SETOF outbound_prospects AS $$
  UPDATE outbound_prospects p
     SET followup_claimed_at = p_now
   WHERE p.id IN (
     SELECT p2.id
       FROM outbound_prospects p2
      WHERE p2.next_followup_at IS NOT NULL
        AND p2.next_followup_at <= p_now
        AND p2.status IN ('interested', 'replied')
        AND p2.mailbox_id IS NOT NULL
        AND (p2.followup_claimed_at IS NULL OR p2.followup_claimed_at < p_now - p_lease)
        AND NOT EXISTS (SELECT 1 FROM outbound_suppressions s WHERE s.email = p2.email)
      ORDER BY p2.next_followup_at
      LIMIT GREATEST(1, LEAST(p_limit, 50))
      FOR UPDATE OF p2 SKIP LOCKED
   )
  RETURNING p.*;
$$ LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.claim_due_followups(timestamptz, interval, integer) FROM PUBLIC, anon, authenticated;

-- ── Claim: openers waiting for the AI ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.claim_pending_openers(
  p_now   timestamptz,
  p_lease interval,
  p_limit integer
)
RETURNS SETOF outbound_prospects AS $$
  UPDATE outbound_prospects p
     SET opener_claimed_at = p_now
   WHERE p.id IN (
     SELECT p2.id
       FROM outbound_prospects p2
      WHERE p2.opener_status = 'pending'
        AND p2.status = 'queued'
        AND (p2.opener_claimed_at IS NULL OR p2.opener_claimed_at < p_now - p_lease)
      ORDER BY p2.created_at
      LIMIT GREATEST(1, LEAST(p_limit, 50))
      FOR UPDATE OF p2 SKIP LOCKED
   )
  RETURNING p.*;
$$ LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.claim_pending_openers(timestamptz, interval, integer) FROM PUBLIC, anon, authenticated;

-- ── Unsubscribe = suppression + hard delete, atomic and idempotent ──────────
-- Deletes by email AND by prospect id so a reply that was stored unmatched
-- (from_email only) goes too. A second call on the same address is a no-op
-- that still answers with zeros.

CREATE OR REPLACE FUNCTION public.erase_outbound_prospect(p_email text, p_source text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email       text := lower(btrim(p_email));
  v_prospect_id uuid;
  v_leads       integer := 0;
  v_messages    integer := 0;
  v_prospects   integer := 0;
BEGIN
  IF v_email IS NULL OR position('@' IN v_email) = 0 THEN
    RAISE EXCEPTION 'erase_outbound_prospect: invalid email' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO outbound_suppressions (email, reason, source)
       VALUES (v_email, 'unsubscribed', p_source)
  ON CONFLICT (email) DO UPDATE SET reason = 'unsubscribed', source = EXCLUDED.source;

  SELECT id INTO v_prospect_id FROM outbound_prospects WHERE email = v_email;

  WITH d AS (
    DELETE FROM platform_leads
     WHERE email = v_email
        OR (v_prospect_id IS NOT NULL AND prospect_id = v_prospect_id)
    RETURNING 1
  ) SELECT count(*) INTO v_leads FROM d;

  WITH d AS (
    DELETE FROM outbound_messages
     WHERE from_email = v_email
        OR (v_prospect_id IS NOT NULL AND prospect_id = v_prospect_id)
    RETURNING 1
  ) SELECT count(*) INTO v_messages FROM d;

  WITH d AS (
    DELETE FROM outbound_prospects WHERE email = v_email RETURNING 1
  ) SELECT count(*) INTO v_prospects FROM d;

  RETURN jsonb_build_object('email', v_email, 'leads', v_leads, 'messages', v_messages, 'prospects', v_prospects);
END $$;

REVOKE EXECUTE ON FUNCTION public.erase_outbound_prospect(text, text) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.erase_outbound_prospect IS
  'Unsubscribe: keep only the address in outbound_suppressions; delete the prospect, its messages (also unmatched ones by from_email), the platform lead and its events. Idempotent.';

-- ── Backfill: V1 rows that already asked out still hold their details ───────

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT email FROM outbound_prospects WHERE status = 'unsubscribed' LOOP
    PERFORM public.erase_outbound_prospect(r.email, 'migration:outbound_v2');
  END LOOP;
END $$;
