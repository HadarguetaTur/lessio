-- Per-org automation toggle flags.
-- Each flag controls whether a specific WhatsApp flow is active for the org.
-- All flows default to on except dunning (opt-in) and AI (already has its own column).
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS automation_lesson_reminder_enabled  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS automation_cancellation_enabled     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS automation_payment_request_enabled  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS automation_dunning_enabled          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS automation_new_leads_enabled        boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS automation_lesson_reminder_hours    int     NOT NULL DEFAULT 24
    CHECK (automation_lesson_reminder_hours IN (2, 12, 24));
