-- The "resend demo email" action on a lead card logs a `demo_email_resent`
-- event, but the type CHECK from 20260907120000 never listed it, so every
-- insert was rejected and the resend never reached the lead's timeline.

ALTER TABLE platform_lead_events
  DROP CONSTRAINT IF EXISTS platform_lead_events_type_check;

ALTER TABLE platform_lead_events
  ADD CONSTRAINT platform_lead_events_type_check
  CHECK (type IN ('form_submit', 'status_change', 'note', 'email', 'call',
                  'page_view', 'signup', 'trial_start', 'paid',
                  'whatsapp_in', 'whatsapp_out',
                  'outbound_reply', 'demo_email', 'demo_email_resent'));
