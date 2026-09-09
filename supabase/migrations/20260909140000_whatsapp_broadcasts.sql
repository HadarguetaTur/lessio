-- WhatsApp broadcasts (Phase 1) and the linked WhatsApp group (Phase 2).
--
-- A broadcast is a campaign object — audience filter, category, state, delivery
-- report — not a loop over sendSmartMessage (decision #42). The audience is
-- stored as a FILTER and materialised into broadcast_recipients only when the
-- campaign starts, so a campaign scheduled for next week never reaches a student
-- who left in the meantime.
--
-- Categories are separate template types, not a checkbox: class_update is
-- UTILITY (a service update about a lesson the parent already has), promo is
-- MARKETING (needs its own opt-in and counts against Meta's per-user marketing
-- cap), group_invite is the UTILITY invite to a linked WhatsApp group.

-- ─── Campaigns ──────────────────────────────────────────────────────────────

CREATE TABLE broadcast_campaigns (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  -- Mirrors MessageTemplateType. The Meta category follows from it, which is
  -- what stops a promotion going out under a utility template.
  template_type         text NOT NULL CHECK (template_type IN ('class_update', 'promo', 'group_invite')),
  -- {{2}} of class_update: what the update is about (lesson or group name).
  topic                 text,
  -- The one paragraph the business typed. Empty for group_invite, whose body
  -- is entirely fixed copy plus the org and group names.
  message               text,
  audience              jsonb NOT NULL,
  status                text NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','scheduled','sending','paused','sent','cancelled','failed')),
  paused_reason         text,
  scheduled_at          timestamptz,
  created_by_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_by_role       text NOT NULL DEFAULT 'owner',
  -- The owner's attestation that these parents agreed to marketing. Evidence,
  -- alongside the per-parent opt-in that actually gates the send.
  consent_attested_at   timestamptz,
  -- Set when the campaign was raised from a student group's screen; also how
  -- the group card lists its own history.
  student_group_id      uuid REFERENCES student_groups(id) ON DELETE SET NULL,
  lesson_id             uuid REFERENCES lessons(id) ON DELETE SET NULL,
  recipients_total      integer NOT NULL DEFAULT 0,
  sent_count            integer NOT NULL DEFAULT 0,
  skipped_count         integer NOT NULL DEFAULT 0,
  failed_count          integer NOT NULL DEFAULT 0,
  -- Three failures of the same kind in a row stops the campaign rather than
  -- burning the number's quality rating on a systemic fault.
  consecutive_failures  integer NOT NULL DEFAULT 0,
  last_error_code       integer,
  created_at            timestamptz NOT NULL DEFAULT now(),
  started_at            timestamptz,
  sent_at               timestamptz
);

CREATE INDEX idx_broadcast_campaigns_org ON broadcast_campaigns (organization_id, created_at DESC);
-- The drain reads exactly this: campaigns that owe work.
CREATE INDEX idx_broadcast_campaigns_runnable ON broadcast_campaigns (status, scheduled_at)
  WHERE status IN ('sending', 'scheduled');
CREATE INDEX idx_broadcast_campaigns_group ON broadcast_campaigns (student_group_id)
  WHERE student_group_id IS NOT NULL;

COMMENT ON COLUMN broadcast_campaigns.audience IS
  'The audience FILTER (kind + params), not a list of numbers. Materialised into broadcast_recipients at send time.';

-- ─── Recipients ─────────────────────────────────────────────────────────────

CREATE TABLE broadcast_recipients (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     uuid NOT NULL REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  parent_id       uuid REFERENCES parents(id) ON DELETE SET NULL,
  student_id      uuid REFERENCES students(id) ON DELETE SET NULL,
  phone           text NOT NULL,
  display_name    text,
  locale          text NOT NULL DEFAULT 'he' CHECK (locale IN ('he','en')),
  -- 'deferred' is the honest state for the part of an audience today's cap
  -- cannot cover. It is NOT a skip: skips are terminal and mean "this person
  -- will not be messaged", whereas a deferred row is queued for the next daily
  -- window. Writing these as skipped lost them permanently.
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','deferred','claimed','sent','skipped','failed')),
  skip_reason     text,
  -- When a deferred row may be reconsidered. The drain re-asks the guard then,
  -- because a new day is a new allowance.
  deferred_until  timestamptz,
  wa_message_id   text,
  error_code      integer,
  error           text,
  claimed_at      timestamptz,
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- Deduplication is a constraint, not logic: a parent of two students in the
  -- same group is one recipient, and a retry can never double-send.
  UNIQUE (campaign_id, phone)
);

CREATE INDEX idx_broadcast_recipients_claim ON broadcast_recipients (status, campaign_id);
-- Per-parent frequency capping reads this.
CREATE INDEX idx_broadcast_recipients_history ON broadcast_recipients (organization_id, phone, sent_at)
  WHERE status = 'sent';
CREATE INDEX idx_broadcast_recipients_wamid ON broadcast_recipients (wa_message_id)
  WHERE wa_message_id IS NOT NULL;
-- The promotion pass reads exactly this: remainders whose day has come.
CREATE INDEX idx_broadcast_recipients_deferred ON broadcast_recipients (deferred_until)
  WHERE status = 'deferred';

COMMENT ON COLUMN broadcast_recipients.skip_reason IS
  'opted_out | updates_opted_out | marketing_opted_out | no_marketing_opt_in | frequency_capped | per_user_limit | already_invited | no_phone. Every one of these is terminal — a capped remainder is status = deferred, not a skip.';

-- ─── Claim: recipients this tick may send ───────────────────────────────────
-- Same shape as claim_next_outbound_prospects: FOR UPDATE SKIP LOCKED plus a
-- lease, so two overlapping cron ticks never send the same message twice and a
-- run that dies mid-send releases its rows on the next tick.

CREATE OR REPLACE FUNCTION public.claim_broadcast_recipients(
  p_now   timestamptz,
  p_lease interval,
  p_limit integer
)
RETURNS SETOF broadcast_recipients AS $$
  UPDATE broadcast_recipients r
     SET status = 'claimed', claimed_at = p_now
   WHERE r.id IN (
     SELECT r2.id
       FROM broadcast_recipients r2
       JOIN broadcast_campaigns c ON c.id = r2.campaign_id AND c.status = 'sending'
      WHERE (r2.status = 'pending'
             OR (r2.status = 'claimed' AND r2.claimed_at < p_now - p_lease))
      ORDER BY r2.created_at
      LIMIT GREATEST(1, LEAST(p_limit, 50))
      FOR UPDATE OF r2 SKIP LOCKED
   )
  RETURNING r.*;
$$ LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.claim_broadcast_recipients(timestamptz, interval, integer)
  FROM PUBLIC, anon, authenticated;

-- ─── Per-category consent on the parent ─────────────────────────────────────
-- opted_out_at stays the hard block on everything. These are the finer grain
-- Meta asks for: leaving marketing must not cost a parent their lesson
-- reminders, so each category is refused on its own.

ALTER TABLE parents
  ADD COLUMN IF NOT EXISTS marketing_opt_in_at     timestamptz,
  ADD COLUMN IF NOT EXISTS marketing_opt_in_source text
    CHECK (marketing_opt_in_source IN ('portal','attested','import','bot')),
  ADD COLUMN IF NOT EXISTS marketing_opted_out_at  timestamptz,
  ADD COLUMN IF NOT EXISTS updates_opted_out_at    timestamptz;

COMMENT ON COLUMN parents.marketing_opt_in_at IS
  'Explicit consent to MARKETING-category messages. Without it a promo broadcast skips this parent.';
COMMENT ON COLUMN parents.updates_opted_out_at IS
  'Tapped "stop updates" on a class_update broadcast. Does not affect reminders, homework or payment requests.';

-- ─── Broadcast sends land in the transcript ─────────────────────────────────

ALTER TABLE whatsapp_messages DROP CONSTRAINT IF EXISTS whatsapp_messages_origin_check;
ALTER TABLE whatsapp_messages ADD CONSTRAINT whatsapp_messages_origin_check
  CHECK (origin IN ('bot', 'ai', 'staff', 'cron', 'broadcast'));

-- ─── Org-level broadcast policy ─────────────────────────────────────────────

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS broadcast_quiet_start smallint NOT NULL DEFAULT 8
    CHECK (broadcast_quiet_start BETWEEN 0 AND 23),
  ADD COLUMN IF NOT EXISTS broadcast_quiet_end smallint NOT NULL DEFAULT 21
    CHECK (broadcast_quiet_end BETWEEN 1 AND 24),
  ADD COLUMN IF NOT EXISTS broadcast_max_promo_per_week smallint NOT NULL DEFAULT 1
    CHECK (broadcast_max_promo_per_week BETWEEN 0 AND 7),
  ADD COLUMN IF NOT EXISTS broadcast_max_updates_per_week smallint NOT NULL DEFAULT 3
    CHECK (broadcast_max_updates_per_week BETWEEN 0 AND 14);

COMMENT ON COLUMN organizations.broadcast_quiet_start IS
  'Org-local hour broadcasts may start. Outside the window a campaign is scheduled for the next opening rather than refused.';

-- ─── Linked WhatsApp group on a student group (Phase 2) ─────────────────────
-- 'linked' is a group the teacher opened on their own phone, whose invite link
-- Lessio sends 1:1 — the default, because Meta's Groups API needs an Official
-- Business Account. 'api' is reserved for the OBA path.

ALTER TABLE student_groups
  ADD COLUMN IF NOT EXISTS wa_group_mode text NOT NULL DEFAULT 'none'
    CHECK (wa_group_mode IN ('none','linked','api')),
  ADD COLUMN IF NOT EXISTS wa_invite_code text,
  ADD COLUMN IF NOT EXISTS wa_group_id text,
  ADD COLUMN IF NOT EXISTS wa_group_status text,
  ADD COLUMN IF NOT EXISTS wa_group_window_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS wa_group_linked_at timestamptz;

COMMENT ON COLUMN student_groups.wa_invite_code IS
  'The code from https://chat.whatsapp.com/<code>. Stored bare: it is the dynamic URL-button suffix of the group_invite template.';

CREATE TABLE student_group_invites (
  group_id        uuid NOT NULL REFERENCES student_groups(id) ON DELETE CASCADE,
  parent_id       uuid NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id     uuid REFERENCES broadcast_campaigns(id) ON DELETE SET NULL,
  sent_at         timestamptz NOT NULL DEFAULT now(),
  wa_message_id   text,
  PRIMARY KEY (group_id, parent_id)
);

CREATE INDEX idx_student_group_invites_org ON student_group_invites (organization_id);

COMMENT ON TABLE student_group_invites IS
  'Who has already been invited to a student group''s WhatsApp group, so adding a student invites only the new parent.';

-- ─── Plan entitlement ───────────────────────────────────────────────────────
-- parseSaasFeatures coerces a missing key to false, so every row is written
-- explicitly — including the retired tiers, which keep their customers working.

ALTER TABLE saas_plans
  ADD COLUMN IF NOT EXISTS broadcast_recipients_monthly integer;

COMMENT ON COLUMN saas_plans.broadcast_recipients_monthly IS
  'Broadcast messages allowed per calendar month. NULL = unlimited.';

UPDATE saas_plans SET features = features || '{"broadcasts": true}'::jsonb
 WHERE name IN ('solo','studio','center','custom','advanced');
UPDATE saas_plans SET features = features || '{"broadcasts": false}'::jsonb
 WHERE name IN ('free','basic');

UPDATE saas_plans SET broadcast_recipients_monthly = 300  WHERE name = 'solo';
UPDATE saas_plans SET broadcast_recipients_monthly = 1500 WHERE name = 'studio';
UPDATE saas_plans SET broadcast_recipients_monthly = 1500 WHERE name = 'advanced';
UPDATE saas_plans SET broadcast_recipients_monthly = 0    WHERE name IN ('free','basic');
-- center and custom stay NULL (unlimited).

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Reads are scoped to the org; a teacher sees only campaigns they raised, which
-- is the lesson-update path. Every write goes through a server action on the
-- service-role client, as everywhere else.

ALTER TABLE broadcast_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_group_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY broadcast_campaigns_read_own_org ON broadcast_campaigns
  FOR SELECT TO authenticated
  USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (
      COALESCE(auth.jwt() ->> 'app_role', '') IN ('owner', 'admin')
      OR created_by_profile_id = auth.uid()
    )
  );

CREATE POLICY broadcast_recipients_read_own_org ON broadcast_recipients
  FOR SELECT TO authenticated
  USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND EXISTS (
      SELECT 1 FROM broadcast_campaigns c
       WHERE c.id = broadcast_recipients.campaign_id
         AND (
           COALESCE(auth.jwt() ->> 'app_role', '') IN ('owner', 'admin')
           OR c.created_by_profile_id = auth.uid()
         )
    )
  );

CREATE POLICY student_group_invites_read_own_org ON student_group_invites
  FOR SELECT TO authenticated
  USING (organization_id = (auth.jwt() ->> 'org_id')::uuid);
