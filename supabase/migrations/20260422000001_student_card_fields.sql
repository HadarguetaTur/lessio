-- Migration: 20260422000001_student_card_fields.sql
-- Adds student card fields: phone, level, focused_subject, weekly_quota, status enum
-- Keeps is_active synced from status via trigger for backward compatibility.

ALTER TABLE students
  ADD COLUMN phone           text,
  ADD COLUMN level           text,
  ADD COLUMN focused_subject text,
  ADD COLUMN weekly_quota    smallint,
  ADD COLUMN status          text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'on_hold', 'inactive'));

-- Backfill status from existing is_active values before the trigger is active
UPDATE students
  SET status = CASE WHEN is_active THEN 'active' ELSE 'inactive' END;

-- Sync is_active boolean from status on every insert/update of status
CREATE OR REPLACE FUNCTION sync_student_is_active()
RETURNS TRIGGER AS $$
BEGIN
  NEW.is_active = (NEW.status = 'active');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_student_is_active_trigger
  BEFORE INSERT OR UPDATE OF status ON students
  FOR EACH ROW EXECUTE FUNCTION sync_student_is_active();
