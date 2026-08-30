-- Acceptance check for the shutdown ladder (public.derive_service_state,
-- migration 20260829140100).
--
-- The ladder decides whether a studio's WhatsApp bot and parent portal are
-- switched off, so it needs a test — but it lives in SQL precisely because
-- vitest cannot reach the Deno Edge Function that used to hold it. Run this
-- read-only against any environment:
--
--   npx supabase db query --linked -f supabase/tests/service_state_ladder.sql
--
-- Every row must report pass = true.

with now_ as (select '2026-08-29 12:00:00+00'::timestamptz n)
select c.label,
       public.derive_service_state(c.status, c.trial_end, c.period_end, c.cur, c.changed, (select n from now_)) as got,
       c.want,
       (public.derive_service_state(c.status, c.trial_end, c.period_end, c.cur, c.changed, (select n from now_)) = c.want) as pass
from (values
 -- A paying org, and an existing customer part-way through an upgrade. The
 -- second one matters: upsertPendingPaymentSubscription parks a live customer
 -- in pending_payment, and suspending them there would silence the bot of
 -- someone whose only action was clicking "upgrade".
 ('active sub',              'active',          null::timestamptz,        '2026-09-20'::timestamptz, 'active',    null::timestamptz,        'active'),
 ('upgrade in flight',       'pending_payment', null,                     '2026-09-20'::timestamptz, 'active',    null,                     'active'),

 ('trial running',           'trial',           '2026-09-10'::timestamptz, null,                     'active',    null,                     'active'),
 ('trial expired',           'trial',           '2026-08-01'::timestamptz, null,                     'active',    null,                     'suspended'),

 -- Grace is 7 days from current_period_end. Day 6.5 is inside, day 7.5 is out.
 ('past_due day 1 of grace', 'past_due',        null,                     '2026-08-28'::timestamptz, 'active',    null,                     'grace'),
 ('past_due last day grace', 'past_due',        null,                     '2026-08-23'::timestamptz, 'grace',     null,                     'grace'),
 ('past_due grace just over','past_due',        null,                     '2026-08-22'::timestamptz, 'grace',     null,                     'suspended'),
 -- Missing data must not switch a studio off.
 ('past_due, no period end', 'past_due',        null,                     null,                      'active',    null,                     'grace'),

 ('cancelled',               'cancelled',       null,                     '2026-08-01'::timestamptz, 'active',    null,                     'suspended'),
 ('suspended 29 days',       'cancelled',       null,                     '2026-06-01'::timestamptz, 'suspended', '2026-07-31'::timestamptz,'suspended'),
 ('suspended 30 days',       'cancelled',       null,                     '2026-06-01'::timestamptz, 'suspended', '2026-07-30'::timestamptz,'dormant'),
 ('already dormant stays',   'cancelled',       null,                     '2026-06-01'::timestamptz, 'dormant',   '2026-07-01'::timestamptz,'dormant')
) as c(label, status, trial_end, period_end, cur, changed, want)
order by pass, label;
