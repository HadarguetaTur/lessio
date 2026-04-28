-- Sprint 25: AI Intelligence + Multi-Channel Communications
-- Adds: AI multi-provider columns, AI usage tracking, email notification settings, in-app notifications

-- Story 1: AI multi-provider columns
ALTER TABLE organizations
  ADD COLUMN ai_provider         text NOT NULL DEFAULT 'openai'
    CHECK (ai_provider IN ('openai', 'anthropic', 'google')),
  ADD COLUMN ai_model            text NOT NULL DEFAULT 'gpt-4o-mini',
  ADD COLUMN ai_config_encrypted text; -- AES-256-GCM encrypted API key

-- Story 2: AI usage tracking
CREATE TABLE ai_usage_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date              date NOT NULL DEFAULT CURRENT_DATE,
  provider          text NOT NULL,
  model             text NOT NULL,
  prompt_tokens     int NOT NULL DEFAULT 0,
  completion_tokens int NOT NULL DEFAULT 0,
  estimated_cost_usd numeric(10,6) NOT NULL DEFAULT 0,
  satisfaction      text NOT NULL DEFAULT 'none'
    CHECK (satisfaction IN ('positive', 'negative', 'none')),
  created_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_ai_usage_log"
  ON ai_usage_log AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);
CREATE INDEX idx_ai_usage_log_org_date
  ON ai_usage_log (organization_id, date);

-- Story 3: Email notification settings
ALTER TABLE organizations
  ADD COLUMN email_notifications jsonb NOT NULL DEFAULT '{}';
-- Values: { "lesson_reminder": true, "payment_reminder": true, ... }

-- Story 3: Parent email column (if not already present)
ALTER TABLE parents
  ADD COLUMN IF NOT EXISTS email text;

-- Story 4: In-app notification center
CREATE TABLE in_app_notifications (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  recipient_profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type                 text NOT NULL,
  title                text NOT NULL,
  body                 text,
  action_url           text,
  read_at              timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE in_app_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_in_app_notifications"
  ON in_app_notifications AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);
CREATE INDEX idx_notifications_recipient
  ON in_app_notifications (recipient_profile_id, read_at)
  WHERE read_at IS NULL;
CREATE INDEX idx_notifications_cleanup
  ON in_app_notifications (created_at);
