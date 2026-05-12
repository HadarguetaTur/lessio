-- Portal OTP hardening: attempt tracking and rate-limit index.
-- Per security review — must-fix before pilot.

-- Track failed verification attempts per OTP row.
-- verifyOtp increments this on each wrong guess and locks (used=true)
-- once failed_attempts reaches 5.
ALTER TABLE portal_otps
  ADD COLUMN failed_attempts integer NOT NULL DEFAULT 0;

-- Index to support the rate-limit query in requestOtpAction:
-- COUNT recent rows per (org, phone) within a 15-minute window.
CREATE INDEX idx_portal_otps_rate_limit
  ON portal_otps (organization_id, phone, created_at);
