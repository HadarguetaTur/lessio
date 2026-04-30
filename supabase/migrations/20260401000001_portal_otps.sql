-- Phone OTP storage for parent portal login.
-- OTPs are short-lived (10 min), single-use, stored as SHA-256 hash.
-- Per /docs/sprint-13-scope.md § Story 1.

CREATE TABLE portal_otps (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  phone           text NOT NULL,
  otp_hash        text NOT NULL,         -- SHA-256 of 6-digit OTP
  expires_at      timestamptz NOT NULL,  -- now() + 10 min
  used            boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE portal_otps IS 'One-time OTP tokens for parent portal login. Hashed (SHA-256), expire after 10 minutes, single-use.';

-- Query by (phone, org_id) for unused OTPs only
CREATE INDEX idx_portal_otps_lookup ON portal_otps(phone, organization_id) WHERE NOT used;

-- Service role only — no parent or dashboard user should query this directly
ALTER TABLE portal_otps ENABLE ROW LEVEL SECURITY;
-- No public policies — accessible via service role key only
