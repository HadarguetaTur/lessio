-- Migration: 20260829140200_notification_log_dedup_keys.sql
--
-- notification_log is the idempotency ledger for anything the platform sends
-- on a schedule. Two things stopped it working for platform-level (as opposed
-- to lesson-level) notifications:
--
--   entity_id was uuid. saas-renewal-reminder dedups on a composite key
--   ("saas_renewal_reminder:<sub id>:<period end date>") which is not a uuid,
--   so both its lookup and its insert were guaranteed to fail. Combined with a
--   third bug in that function — it wrote a column named `notification_type`,
--   while the column is `type` — the reminder never deduped at all and would
--   have messaged an owner once a day for the whole 3-day window, logging a
--   failure each time. It has never fired in production, which is why nobody
--   saw it.
--
--   The type CHECK listed only the three lesson/homework/payment reminders.
--
-- entity_id becomes text so a dedup key can be whatever identifies the thing
-- being deduplicated. Existing uuid values cast cleanly and the
-- UNIQUE (organization_id, type, entity_id) guarantee is unchanged.

ALTER TABLE notification_log
  ALTER COLUMN entity_id TYPE text USING entity_id::text;

ALTER TABLE notification_log
  DROP CONSTRAINT IF EXISTS notification_log_type_check;

ALTER TABLE notification_log
  ADD CONSTRAINT notification_log_type_check CHECK (type IN (
    'lesson_reminder',
    'payment_reminder',
    'homework_reminder',
    -- Platform billing: renewal warning, the dunning sequence, and the once-a-day
    -- "this studio is not available" auto-reply the bot gives a parent while the
    -- org is suspended.
    'saas_renewal_reminder',
    'saas_dunning',
    'org_suspended_notice'
  ));

COMMENT ON COLUMN notification_log.entity_id IS
  'Whatever identifies the deduplicated thing: a lesson/charge id, or a composite key such as saas_renewal_reminder:<subscription id>:<period end>. Text, not uuid — platform notifications are not keyed by a single row.';
