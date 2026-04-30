-- SaaS platform subscriptions (LESSIO tenant billing), invoices, and custom-plan inquiries.
-- Distinct from student-facing `subscriptions` (tuition).

-- ─── saas_plans (catalog) ───────────────────────────────────────────────────

CREATE TABLE saas_plans (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL UNIQUE,
  display_name_he    text NOT NULL,
  display_name_en    text NOT NULL,
  price_monthly      numeric(10,2) NOT NULL DEFAULT 0,
  price_yearly       numeric(10,2),
  features           jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active          boolean NOT NULL DEFAULT true,
  sort_order         integer NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Feature flags: whatsapp_automation, ai_assistant, full_reports, leads, homework, parent_portal
INSERT INTO saas_plans (name, display_name_he, display_name_en, price_monthly, price_yearly, features, sort_order) VALUES
  (
    'free',
    'חינמי (ניסיון)',
    'Free (trial)',
    0,
    NULL,
    '{"whatsapp_automation":false,"ai_assistant":false,"full_reports":false,"leads":false,"homework":false,"parent_portal":false}'::jsonb,
    0
  ),
  (
    'basic',
    'בסיסי',
    'Basic',
    99,
    990,
    '{"whatsapp_automation":false,"ai_assistant":false,"full_reports":false,"leads":false,"homework":false,"parent_portal":false}'::jsonb,
    1
  ),
  (
    'advanced',
    'מתקדם',
    'Advanced',
    199,
    1990,
    '{"whatsapp_automation":true,"ai_assistant":true,"full_reports":true,"leads":true,"homework":true,"parent_portal":true}'::jsonb,
    2
  ),
  (
    'custom',
    'מותאם אישית',
    'Custom',
    0,
    NULL,
    '{"whatsapp_automation":true,"ai_assistant":true,"full_reports":true,"leads":true,"homework":true,"parent_portal":true}'::jsonb,
    3
  );

ALTER TABLE saas_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saas_plans_authenticated_read"
  ON saas_plans FOR SELECT
  TO authenticated
  USING (is_active = true);

-- ─── organization_subscriptions (one row per org, MVP) ────────────────────────

CREATE TABLE organization_subscriptions (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id                   uuid NOT NULL REFERENCES saas_plans(id),
  status                    text NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('trial', 'active', 'pending_payment', 'past_due', 'cancelled', 'read_only')),
  billing_interval          text NOT NULL DEFAULT 'monthly'
    CHECK (billing_interval IN ('monthly', 'yearly')),
  trial_ends_at             timestamptz,
  current_period_start      timestamptz,
  current_period_end        timestamptz,
  sumit_customer_id         text,
  sumit_subscription_id     text,
  sumit_payment_token       text,
  card_last_four            text,
  pending_checkout_reference text,
  cancel_at_period_end      boolean NOT NULL DEFAULT false,
  cancelled_at              timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_org_subscriptions_org ON organization_subscriptions(organization_id);
CREATE INDEX idx_org_subscriptions_status ON organization_subscriptions(status);

CREATE TRIGGER set_organization_subscriptions_updated_at
  BEFORE UPDATE ON organization_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE organization_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_subscriptions_owner_full" ON organization_subscriptions
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'owner'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'owner'
  );

CREATE POLICY "org_subscriptions_admin_select" ON organization_subscriptions
  FOR SELECT USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'admin'
  );

-- ─── saas_invoices ───────────────────────────────────────────────────────────

CREATE TABLE saas_invoices (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id       uuid REFERENCES organization_subscriptions(id) ON DELETE SET NULL,
  amount                numeric(10,2) NOT NULL,
  currency              text NOT NULL DEFAULT 'ILS',
  status                text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('paid', 'pending', 'failed')),
  sumit_document_id     text,
  sumit_document_url    text,
  billing_period_start  timestamptz,
  billing_period_end    timestamptz,
  issued_at             timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_saas_invoices_org ON saas_invoices(organization_id);

ALTER TABLE saas_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saas_invoices_owner_select" ON saas_invoices
  FOR SELECT USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'owner'
  );

CREATE POLICY "saas_invoices_admin_select" ON saas_invoices
  FOR SELECT USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'admin'
  );

-- ─── saas_plan_inquiries (custom plan) ───────────────────────────────────────

CREATE TABLE saas_plan_inquiries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_name      text NOT NULL,
  phone             text NOT NULL,
  message           text,
  status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_saas_inquiries_org ON saas_plan_inquiries(organization_id);
CREATE INDEX idx_saas_inquiries_status ON saas_plan_inquiries(status);

ALTER TABLE saas_plan_inquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saas_inquiries_owner_select" ON saas_plan_inquiries
  FOR SELECT USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'owner'
  );
