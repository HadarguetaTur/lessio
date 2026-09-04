-- Which calendars of the connected Google account are consulted by the
-- lesson-conflict check. Array of { "id": text, "summary": text|null };
-- "primary" is the account's primary calendar. Default preserves the
-- pre-feature behaviour (primary only) for existing connections.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS google_calendar_selected_calendars JSONB NOT NULL DEFAULT '[{"id":"primary"}]';

ALTER TABLE teachers
  ADD COLUMN IF NOT EXISTS google_calendar_selected_calendars JSONB NOT NULL DEFAULT '[{"id":"primary"}]';
