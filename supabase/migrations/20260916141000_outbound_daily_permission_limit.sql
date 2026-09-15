-- The launch pace is intentionally a product guardrail, not a mailbox
-- setting: only first permission-request emails count here. Demo emails and
-- reply follow-ups are outside this limit.

CREATE OR REPLACE FUNCTION public.claim_next_outbound_prospects(
  p_now         timestamptz,
  p_lease       interval,
  p_limit       integer,
  p_campaign_id uuid DEFAULT NULL,
  p_day_start   timestamptz DEFAULT date_trunc('day', now()),
  p_daily_limit integer DEFAULT 50
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
      LIMIT GREATEST(0, LEAST(
        p_limit,
        50,
        p_daily_limit - (SELECT count(*)::integer FROM outbound_messages m
                         WHERE m.direction = 'out' AND m.kind = 'cold_email'
                           AND m.error IS NULL AND m.created_at >= p_day_start)
      ))
      FOR UPDATE OF p2 SKIP LOCKED
   )
  RETURNING p.*;
$$ LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.claim_next_outbound_prospects(timestamptz, interval, integer, uuid, timestamptz, integer) FROM PUBLIC, anon, authenticated;
