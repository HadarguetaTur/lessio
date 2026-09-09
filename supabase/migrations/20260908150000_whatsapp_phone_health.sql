-- WhatsApp number health on the organization (broadcasts Phase 0).
--
-- Meta rates every business number (quality_rating), caps how many
-- business-initiated conversations it may open per 24h (messaging_limit_tier),
-- and gates the Groups API behind Official Business Account status. Nothing in
-- Lessio recorded any of it, so a number sliding to RED was invisible until
-- sends started failing. These columns are the single place the send guard
-- (src/lib/whatsapp/broadcast/guard.ts, Phase 1) and the settings page read.
--
-- Written by src/lib/whatsapp/health.ts (on connect, daily cron, before a
-- campaign) and by the phone_number_quality_update / account_update webhooks.

alter table organizations
  add column if not exists wa_quality_rating text
    check (wa_quality_rating in ('GREEN', 'YELLOW', 'RED', 'UNKNOWN')),
  add column if not exists wa_messaging_limit_tier text,
  add column if not exists wa_is_oba boolean not null default false,
  add column if not exists wa_oba_status text,
  add column if not exists wa_business_verification_status text,
  add column if not exists wa_name_status text,
  add column if not exists wa_health_checked_at timestamptz,
  add column if not exists wa_connected_at timestamptz,
  add column if not exists wa_verification_checklist jsonb not null default '{}'::jsonb,
  -- Superadmin kill switch for every broadcast-shaped send on this org.
  add column if not exists broadcasts_enabled boolean not null default true;

-- Orgs already connected: the best available anchor for the warm-up window is
-- when the row was last touched. Anything older than 14 days is out of warm-up
-- either way, so an imprecise backfill errs on the permissive side only for
-- orgs that connected in the last two weeks.
update organizations
   set wa_connected_at = coalesce(wa_connected_at, updated_at, created_at)
 where whatsapp_phone_number_id is not null
   and wa_connected_at is null;

comment on column organizations.wa_quality_rating is
  'Meta quality_rating of the business number: GREEN | YELLOW | RED | UNKNOWN. RED blocks broadcasts.';
comment on column organizations.wa_messaging_limit_tier is
  'Meta messaging_limit_tier, e.g. TIER_250, TIER_2K, TIER_10K, TIER_100K, TIER_UNLIMITED.';
comment on column organizations.wa_is_oba is
  'Official Business Account (green tick). The only gate on the Groups API.';
comment on column organizations.wa_business_verification_status is
  'WABA business_verification_status from Meta: verified | pending | not_verified | failed | ...';
comment on column organizations.wa_connected_at is
  'When the number was connected through Embedded Signup. Numbers younger than 14 days are in warm-up.';
comment on column organizations.wa_verification_checklist is
  'Owner-ticked preparation steps for Business Verification, keyed by step id -> ISO timestamp.';
