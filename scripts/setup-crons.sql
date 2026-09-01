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

-- Automatic lesson completion runs in Next.js because that runtime owns the
-- billing and payment-provider adapters. Replace both placeholders before use.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'automatic-lesson-completion') then
    perform cron.unschedule('automatic-lesson-completion');
  end if;

  perform cron.schedule(
    'automatic-lesson-completion',
    '*/5 * * * *',
    $cmd$
    select net.http_post(
      url := 'APP_URL_PLACEHOLDER/api/internal/lessons/auto-complete',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || 'SERVICE_KEY_PLACEHOLDER',
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
    $cmd$
  );
end $$;

-- Verify
select jobname, schedule, active from cron.job order by jobname;
