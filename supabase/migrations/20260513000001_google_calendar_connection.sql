-- Sprint 29: Google Calendar connection per-org and per-teacher
-- Refresh tokens are stored encrypted (AES-256-GCM via GOOGLE_CALENDAR_ENCRYPTION_KEY).

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS google_calendar_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS google_calendar_email         TEXT;

ALTER TABLE teachers
  ADD COLUMN IF NOT EXISTS google_calendar_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS google_calendar_email         TEXT;
