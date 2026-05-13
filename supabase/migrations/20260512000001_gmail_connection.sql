-- Sprint 28: per-org Gmail OAuth connection for outbound email
-- Stores encrypted refresh token + the connected Gmail address.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS gmail_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS gmail_connected_email TEXT;
