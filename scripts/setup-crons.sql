-- Setup pg_cron schedules for Lessio Edge Functions
-- Run once against the cloud DB after deploying functions.

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
    {"name": "holiday-sync",             "cron": "0 2 1 * *", "fn": "holiday-sync"}
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

    cmd := format(
      $cmd$
      select net.http_post(
        url := 'https://%s.supabase.co/functions/v1/%s',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || %L,
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      );
      $cmd$,
      'PROJECT_REF_PLACEHOLDER',
      fn_name,
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
--
-- Both send the same SERVICE_KEY_PLACEHOLDER bearer token. The app never sees
-- the token itself, only its SHA-256, so set BOTH env vars to the hex sha256 of
-- whatever you substitute here:
--   LESSIO_AUTO_COMPLETION_CRON_SECRET_SHA256
--   LESSIO_SAAS_CRON_SECRET_SHA256
do $$
declare
  http_jobs jsonb := '[
    {"name": "automatic-lesson-completion", "cron": "*/5 * * * *",   "path": "/api/internal/lessons/auto-complete"},
    {"name": "saas-renew",                  "cron": "*/15 2-3 * * *","path": "/api/internal/saas/renew"},
    {"name": "saas-lifecycle-emails",       "cron": "0 8 * * *",     "path": "/api/internal/saas/lifecycle-emails"}
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

-- Verify
select jobname, schedule, active from cron.job order by jobname;
