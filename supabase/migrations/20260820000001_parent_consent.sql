-- Migration: 20260820000001_parent_consent.sql
-- WhatsApp opt-in record for parents (Sprint 31, Story 9).
--
-- Story 8 recorded consent being *withdrawn* (parents.opted_out_at). Nothing
-- recorded consent being *given*: every parent row is entered by the tutoring
-- business, and the first thing the parent ever hears from the number is a
-- reminder or a payment request.
--
-- Two independent facts are stored:
--   * consent_source / consented_at / consented_by — who said the parent agreed,
--     and when. Evidence, not a gate: a missing record does not block sends.
--   * welcome_sent_at — whether the parent has received the one-time notice
--     that explains who is messaging them and how to stop. This IS what the
--     send path checks: the first business-initiated message to a parent is
--     preceded by that notice, exactly once.
--
-- opted_out_at is unchanged and always wins over both.

ALTER TABLE parents
  ADD COLUMN IF NOT EXISTS consent_source text
    CHECK (consent_source IN ('attested', 'import', 'portal', 'booking', 'whatsapp_reply')),
  ADD COLUMN IF NOT EXISTS consented_at timestamptz,
  ADD COLUMN IF NOT EXISTS consented_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS welcome_sent_at timestamptz;

COMMENT ON COLUMN parents.consent_source IS
  'How consent to WhatsApp messaging was obtained. attested/import = a staff member declared the parent agreed (consented_by is set). portal/booking = the parent accepted the terms line in the parent portal or the booking form. whatsapp_reply = the parent wrote to the business number first, which Meta treats as opt-in.';

COMMENT ON COLUMN parents.consented_at IS
  'When consent_source was recorded. NULL = no consent evidence on file (legacy and imported rows). Does not block sends; see welcome_sent_at.';

COMMENT ON COLUMN parents.consented_by IS
  'Staff profile that attested the consent (attested/import only). NULL when the parent consented directly.';

COMMENT ON COLUMN parents.welcome_sent_at IS
  'When the one-time welcome notice ("messages here are sent on behalf of X via Lessio, reply stop to opt out") went out. The business-send gate sets it atomically before the first business-initiated message; NULL means the next such message will be preceded by the notice.';
