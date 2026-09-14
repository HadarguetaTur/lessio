-- A Google Calendar connection whose refresh token Google no longer honours
-- (invalid_grant: the user revoked access, or the token was issued while the
-- OAuth app was still in Testing mode and expired after 7 days).
--
-- NULL = the connection is believed healthy. A timestamp = the last time a
-- freeBusy lookup was refused with invalid_grant. The token and email are kept
-- so the settings pages can say "the connection expired, reconnect" instead of
-- "not connected", and the conflict guards stop asking Google (and stop nagging
-- staff on every lesson) until the owner/teacher reconnects, which resets this.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS google_calendar_needs_reauth_at TIMESTAMPTZ NULL;

ALTER TABLE teachers
  ADD COLUMN IF NOT EXISTS google_calendar_needs_reauth_at TIMESTAMPTZ NULL;
