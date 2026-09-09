-- Why a WhatsApp connection is not working, and who the number belongs to.
--
-- The 09.09 UX audit's first finding: every surface derived "connected" from
-- whatsapp_phone_number_id alone, so an expired token, a Meta restriction and a
-- healthy number all rendered as one green check. Meta tells us the difference
-- (a Graph 190 on any read means the token is gone; account_update carries
-- restriction events) but nothing persisted it, so only a live Graph call could
-- know — which the connections hub and the dashboard cannot afford on a page
-- load. These columns are that memory.
--
-- Read by src/lib/whatsapp/connectionState.ts, which is the single resolver
-- every WhatsApp surface now asks. Written by src/lib/whatsapp/health.ts (on
-- connect, daily cron, manual refresh), by getPhoneIdentity's live check, and
-- by the account_update webhook.

alter table organizations
  -- Why the last read of this number failed. NULL = the last read succeeded.
  -- 'token_invalid' is terminal until the owner reconnects; 'unreachable' is
  -- transient and must never be shown as a broken connection.
  add column if not exists wa_health_error text
    check (wa_health_error in ('token_invalid', 'unreachable')),
  add column if not exists wa_health_error_at timestamptz,
  -- Meta has restricted, disabled or flagged the account for a violation.
  -- Cleared by a successful health refresh or a VERIFIED_ACCOUNT event.
  add column if not exists wa_account_restricted boolean not null default false,
  -- The human identity of the number, cached from the same Graph read that
  -- fetches health. The connections hub shows it next to the badge, and the
  -- settings page can name the number even when Meta is unreachable.
  add column if not exists wa_display_phone_number text,
  add column if not exists wa_verified_name text;

comment on column organizations.wa_health_error is
  'Why the last Meta read of this number failed: token_invalid (reconnect needed) | unreachable (transient). NULL when the last read succeeded.';
comment on column organizations.wa_health_error_at is
  'When wa_health_error was recorded. Lets the UI say how long a connection has been broken.';
comment on column organizations.wa_account_restricted is
  'Meta restricted/disabled the WhatsApp account (ACCOUNT_RESTRICTION / ACCOUNT_VIOLATION / DISABLED_UPDATE). Blocks sending.';
comment on column organizations.wa_display_phone_number is
  'display_phone_number from Meta, cached. The number a human recognises, as opposed to whatsapp_phone_number_id.';
comment on column organizations.wa_verified_name is
  'verified_name from Meta, cached. The business name parents see as the sender.';
