-- Setup pg_cron schedules for Lessio Edge Functions
-- Run once against the cloud DB after deploying functions.
--
-- TWO DIFFERENT AUTH SCHEMES — they are not interchangeable:
--
--   Edge Functions (first block) authenticate with the `apikey` HEADER, compared
--   against the Supabase secret key named `lessio_edge_cron`
--   (supabase/functions/_shared/supabaseSecret.ts -> authorizeCronRequest).
--   This block previously sent only `Authorization: Bearer <service key>`,
--   which authorizeCronRequest never reads — every Edge cron would have 401'd.
--   Reminders demonstrably fire in production, so production's live cron.job
--   commands do NOT match what this file used to say: the file had drifted, and
--   rebuilding an environment from it (disaster recovery, a staging stand-up)
--   would have produced ten silently dead jobs.
--
--   ACTION FOR AN OPERATOR: diff the live rows against this script before
--   trusting either — `select jobname, command from cron.job order by jobname;`
--   This script cannot be verified against production from a checkout.
--
--   Next.js internal routes (second block) authenticate with
--   `Authorization: Bearer <token>` where the app stores only the token's
--   SHA-256 (src/lib/cron/auth.ts). That block was and remains correct.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Helper: idempotent cron registration. Unschedules first if exists.
do $$
declare
  jobs jsonb := '[
    {"name": "lesson-reminders",         "cron": "0 * * * *", "fn": "lesson-reminders"},
    {"name": "payment-reminders",        "cron": "0 9 * * *", "fn": "payment-reminders"},
    {"name": "homework-reminders",       "cron": "0 8 * * *", "fn": "homework-reminders"},
    {"name": "homework-sender",          "cron": "0 * * * *", "fn": "homework-sender"},
    {"name": "saas-subscription-checker","cron": "0 0 * * *", "fn": "saas-subscription-checker"},
    {"name": "saas-renewal-reminder",    "cron": "0 8 * * *", "fn": "saas-renewal-reminder"},
    {"name": "data-retention",           "cron": "0 3 * * *", "fn": "data-retention"},
    {"name": "notification-cleanup",     "cron": "0 4 * * *", "fn": "notification-cleanup"},
    {"name": "holiday-sync",             "cron": "0 2 1 * *", "fn": "holiday-sync"},
    {"name": "exam-good-luck",           "cron": "0 * * * *", "fn": "exam-good-luck"}
  ]'::jsonb;
  job jsonb;
  job_name text;
  cron_expr text;
  fn_name text;
  cmd text;
begin
  for job in select * from jsonb_array_elements(jobs)
  loop
    job_name := job->>'name';
    cron_expr := job->>'cron';
    fn_name := job->>'fn';

    -- Unschedule if it already exists (idempotent re-run safe)
    if exists (select 1 from cron.job where jobname = job_name) then
      perform cron.unschedule(job_name);
    end if;

    -- `apikey` is what authorizeCronRequest reads; the value must be the
    -- Supabase secret key named `lessio_edge_cron`. `Authorization` is kept
    -- alongside it because the functions gateway still expects a bearer token
    -- on the request, but it is not what authorises the cron.
    cmd := format(
      $cmd$
      select net.http_post(
        url := 'https://%s.supabase.co/functions/v1/%s',
        headers := jsonb_build_object(
          'apikey', %L,
          'Authorization', 'Bearer ' || %L,
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      );
      $cmd$,
      'PROJECT_REF_PLACEHOLDER',
      fn_name,
      'EDGE_CRON_SECRET_PLACEHOLDER',
      'SERVICE_KEY_PLACEHOLDER'
    );

    perform cron.schedule(job_name, cron_expr, cmd);
  end loop;
end $$;

-- These run in Next.js because that runtime owns the billing and
-- payment-provider adapters. Replace both placeholders before use.
--
--   automatic-lesson-completion — marks finished lessons complete
--   saas-renew                  — reconciles paid checkouts, then charges
--                                 renewals due. Every 15 minutes between 02:00
--                                 and 03:45 UTC: a batch is capped at 50, and a
--                                 charge that fails technically is retried by
--                                 the next run inside the same window rather
--                                 than waiting a day.
--   saas-lifecycle-emails      — trial warnings (T-7/T-3/T-1/T0), renewal
--                                 notice, cancellation confirmation. Daily 08:00 UTC.
--   outbound-send              — cold emails from the Workspace outreach
--                                 mailboxes. Every 10 minutes, Sun–Thu,
--                                 05:00–15:50 UTC (≈ 08:00–18:50 Israel; the
--                                 route re-checks the local window itself).
--   outbound-replies           — reads the outreach inboxes for replies.
--                                 Every 5 minutes, all day.
--   outbound-followups         — the second and third touch for prospects who
--                                 already answered, inside the same Gmail
--                                 thread. Four times an hour, same window.
--   outbound-openers           — drafts the AI opening line for freshly
--                                 imported prospects. Every 5 minutes; the
--                                 draft still waits for a person to approve it.
--   whatsapp-health            — refreshes every connected number's quality
--                                 rating, messaging tier and verification
--                                 status from Meta. Daily 03:30 UTC.
--   whatsapp-broadcast         — drains broadcast campaigns: claims a small
--                                 batch and sends it with a pause between
--                                 messages. Every 2 minutes; the route itself
--                                 honours the org's quiet hours.
--
-- Placeholders to substitute before running this file:
--   PROJECT_REF_PLACEHOLDER      — the Supabase project ref
--   APP_URL_PLACEHOLDER          — https://www.getlessio.com (no trailing slash)
--   EDGE_CRON_SECRET_PLACEHOLDER — the value of the Supabase secret key named
--                                  `lessio_edge_cron`. Edge Functions read it
--                                  from the `apikey` header; a wrong or absent
--                                  value is a 401 on every Edge cron.
--   SERVICE_KEY_PLACEHOLDER      — the bearer token for the Next.js routes
--                                  (below) and for the functions gateway.
--
-- All Next.js jobs send the same SERVICE_KEY_PLACEHOLDER bearer token. The app never sees
-- the token itself, only its SHA-256, so set ALL of these env vars to the hex
-- sha256 of whatever you substitute here:
--   LESSIO_AUTO_COMPLETION_CRON_SECRET_SHA256
--   LESSIO_SAAS_CRON_SECRET_SHA256
--   LESSIO_OUTBOUND_CRON_SECRET_SHA256
--   LESSIO_WHATSAPP_CRON_SECRET_SHA256
do $$
declare
  http_jobs jsonb := '[
    {"name": "automatic-lesson-completion", "cron": "*/5 * * * *",   "path": "/api/internal/lessons/auto-complete"},
    {"name": "saas-renew",                  "cron": "*/15 2-3 * * *","path": "/api/internal/saas/renew"},
    {"name": "saas-lifecycle-emails",       "cron": "0 8 * * *",     "path": "/api/internal/saas/lifecycle-emails"},
    {"name": "outbound-send",               "cron": "*/10 5-15 * * 0-4", "path": "/api/internal/outbound/run-send"},
    {"name": "outbound-replies",            "cron": "*/5 * * * *",   "path": "/api/internal/outbound/run-replies"},
    {"name": "outbound-followups",          "cron": "5,20,35,50 5-15 * * 0-4", "path": "/api/internal/outbound/run-followups"},
    {"name": "outbound-openers",            "cron": "*/5 * * * *",   "path": "/api/internal/outbound/run-openers"},
    {"name": "outbound-research",           "cron": "*/5 * * * *",   "path": "/api/internal/outbound/run-research"},
    {"name": "outbound-discovery",          "cron": "0 4 * * 0-4",   "path": "/api/internal/outbound/run-discovery"},
    {"name": "whatsapp-health",             "cron": "30 3 * * *",    "path": "/api/internal/whatsapp/health"},
    {"name": "whatsapp-broadcast",          "cron": "*/2 * * * *",   "path": "/api/internal/whatsapp/broadcast"}
  ]'::jsonb;
  job jsonb;
begin
  for job in select * from jsonb_array_elements(http_jobs)
  loop
    if exists (select 1 from cron.job where jobname = job->>'name') then
      perform cron.unschedule(job->>'name');
    end if;

    perform cron.schedule(
      job->>'name',
      job->>'cron',
      format(
        $cmd$
        select net.http_post(
          url := %L,
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || %L,
            'Content-Type', 'application/json'
          ),
          body := '{}'::jsonb
        );
        $cmd$,
        'APP_URL_PLACEHOLDER' || (job->>'path'),
        'SERVICE_KEY_PLACEHOLDER'
      )
    );
  end loop;
end $$;

-- Pure-SQL jobs: no HTTP, no secret, nothing to substitute.
--
--   landing-pageviews-retention — the first-party landing measurement
--                                 (decision #49) is promised to visitors as
--                                 deleted after 180 days. Daily 03:17 UTC,
--                                 off the hour so it does not pile onto the
--                                 Edge crons above.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'landing-pageviews-retention') then
    perform cron.unschedule('landing-pageviews-retention');
  end if;

  perform cron.schedule(
    'landing-pageviews-retention',
    '17 3 * * *',
    $cmd$delete from public.landing_pageviews where started_at < now() - interval '180 days'$cmd$
  );
end $$;

-- Verify. Read `command` too, not just the schedule: a job can be registered,
-- active, and 401'ing on every run because it sends the wrong header. Every
-- Edge Function row must contain 'apikey'; every Next.js row must contain
-- 'Authorization'. Also confirm one row per job name — two jobs firing the
-- same function in the same minute is how every reminder went out twice
-- (2026-09-07).
select jobname, schedule, active, command from cron.job order by jobname;
