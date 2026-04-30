-- Sprint 9: auto_send_payment_request org setting
-- When true, a payment request WhatsApp message with payment link is sent
-- automatically when a lesson charge is created on lesson completion.

ALTER TABLE organizations
  ADD COLUMN auto_send_payment_request boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN organizations.auto_send_payment_request IS
  'When true, a payment request WhatsApp message with payment link is sent automatically when a lesson charge is created on lesson completion.';
