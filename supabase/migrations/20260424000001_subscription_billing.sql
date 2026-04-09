-- Migration: 20260424000001_subscription_billing.sql
-- Subscription & Monthly Billing tables + price_per_student on lessons.
-- See docs/subscription-billing-spec.md for full specification.

-- ─── 0. helper function ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── 1. subscriptions ──────────────────────────────────────────────────────

CREATE TABLE subscriptions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  student_id        uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subscription_type text,
  monthly_amount    numeric(10,2) NOT NULL,
  start_date        date NOT NULL,
  end_date          date,
  is_paused         boolean NOT NULL DEFAULT false,
  pause_date        date,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_org_student ON subscriptions(organization_id, student_id);

CREATE TRIGGER set_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions_owner_full" ON subscriptions
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'owner'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'owner'
  );

CREATE POLICY "subscriptions_admin_full" ON subscriptions
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'admin'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'admin'
  );

-- ─── 2. student_cancellation_events ────────────────────────────────────────

CREATE TABLE student_cancellation_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lesson_id           uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  student_id          uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  cancellation_date   timestamptz NOT NULL,
  hours_before        numeric(8,2) NOT NULL,
  is_lt_24h           boolean NOT NULL,
  is_charged          boolean NOT NULL DEFAULT false,
  charge_override     numeric(10,2),
  billing_month       text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cancel_events_org_student_month
  ON student_cancellation_events(organization_id, student_id, billing_month);

ALTER TABLE student_cancellation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cancel_events_owner_full" ON student_cancellation_events
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'owner'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'owner'
  );

CREATE POLICY "cancel_events_admin_full" ON student_cancellation_events
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'admin'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'admin'
  );

-- ─── 3. student_monthly_billing ────────────────────────────────────────────

CREATE TABLE student_monthly_billing (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  student_id                uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  parent_id                 uuid REFERENCES parents(id),
  billing_month             text NOT NULL,
  is_paid                   boolean NOT NULL DEFAULT false,
  is_approved               boolean NOT NULL DEFAULT false,
  lessons_amount            numeric(10,2) NOT NULL DEFAULT 0,
  subscriptions_amount      numeric(10,2) NOT NULL DEFAULT 0,
  cancellations_amount      numeric(10,2) NOT NULL DEFAULT 0,
  total_amount              numeric(10,2) NOT NULL DEFAULT 0,
  lessons_count             integer NOT NULL DEFAULT 0,
  manual_adjustment_amount  numeric(10,2),
  manual_adjustment_reason  text,
  manual_adjustment_date    date,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, student_id, billing_month)
);

CREATE INDEX idx_monthly_billing_org_month
  ON student_monthly_billing(organization_id, billing_month);

CREATE TRIGGER set_monthly_billing_updated_at
  BEFORE UPDATE ON student_monthly_billing
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE student_monthly_billing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "monthly_billing_owner_full" ON student_monthly_billing
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'owner'
  )
  WITH CHECK (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'owner'
  );

CREATE POLICY "monthly_billing_admin_read" ON student_monthly_billing
  FOR SELECT USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND (auth.jwt() ->> 'role') = 'admin'
  );

-- ─── 4. lessons.price_per_student ──────────────────────────────────────────

ALTER TABLE lessons ADD COLUMN price_per_student numeric(10,2);
