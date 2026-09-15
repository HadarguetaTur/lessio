-- Sprint 35: operational teacher economics. This is not payroll.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS teacher_estimates_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancellation_source text,
  ADD COLUMN IF NOT EXISTS delivery_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_confirmed_by_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_confirmation_source text;

ALTER TABLE lessons DROP CONSTRAINT IF EXISTS lessons_cancellation_source_check;
ALTER TABLE lessons ADD CONSTRAINT lessons_cancellation_source_check CHECK (
  cancellation_source IS NULL OR cancellation_source IN ('parent', 'teacher', 'staff', 'portal', 'whatsapp', 'unknown')
);
ALTER TABLE lessons DROP CONSTRAINT IF EXISTS lessons_delivery_confirmation_source_check;
ALTER TABLE lessons ADD CONSTRAINT lessons_delivery_confirmation_source_check CHECK (
  delivery_confirmation_source IS NULL OR delivery_confirmation_source IN ('teacher', 'staff', 'automatic', 'unknown')
);

CREATE TABLE compensation_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  teacher_id uuid REFERENCES teachers(id) ON DELETE CASCADE,
  model text NOT NULL CHECK (model IN ('hourly', 'fixed_per_lesson', 'percentage_revenue', 'base_plus_participant')),
  base_rate_type text CHECK (base_rate_type IS NULL OR base_rate_type IN ('hourly', 'fixed_per_lesson')),
  hourly_amount numeric(10,2) CHECK (hourly_amount IS NULL OR hourly_amount >= 0),
  fixed_amount numeric(10,2) CHECK (fixed_amount IS NULL OR fixed_amount >= 0),
  revenue_percent numeric(5,2) CHECK (revenue_percent IS NULL OR revenue_percent BETWEEN 0 AND 100),
  participant_amount numeric(10,2) CHECK (participant_amount IS NULL OR participant_amount >= 0),
  no_show_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (no_show_percent BETWEEN 0 AND 100),
  late_parent_cancellation_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (late_parent_cancellation_percent BETWEEN 0 AND 100),
  requires_confirmation boolean NOT NULL DEFAULT false,
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  created_by_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  CHECK (
    (model = 'hourly' AND hourly_amount IS NOT NULL AND fixed_amount IS NULL AND revenue_percent IS NULL AND participant_amount IS NULL)
    OR (model = 'fixed_per_lesson' AND fixed_amount IS NOT NULL AND hourly_amount IS NULL AND revenue_percent IS NULL AND participant_amount IS NULL)
    OR (model = 'percentage_revenue' AND revenue_percent IS NOT NULL AND hourly_amount IS NULL AND fixed_amount IS NULL AND participant_amount IS NULL)
    OR (model = 'base_plus_participant' AND base_rate_type IS NOT NULL AND participant_amount IS NOT NULL AND (base_rate_type = 'hourly' AND hourly_amount IS NOT NULL OR base_rate_type = 'fixed_per_lesson' AND fixed_amount IS NOT NULL))
  )
);

ALTER TABLE compensation_policies
  ADD CONSTRAINT compensation_policies_no_overlap
  EXCLUDE USING gist (
    organization_id WITH =,
    coalesce(teacher_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
    tstzrange(effective_from, coalesce(effective_to, 'infinity'::timestamptz), '[)') WITH &&
  );
CREATE INDEX compensation_policies_scope_idx ON compensation_policies (organization_id, teacher_id, effective_from DESC);
CREATE TRIGGER set_updated_at_compensation_policies BEFORE UPDATE ON compensation_policies FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE teacher_economics_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  month date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at timestamptz,
  published_by_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, month)
);
CREATE TRIGGER set_updated_at_teacher_economics_snapshots BEFORE UPDATE ON teacher_economics_snapshots FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE teacher_economics_snapshot_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  snapshot_id uuid NOT NULL REFERENCES teacher_economics_snapshots(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE RESTRICT,
  teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT,
  policy_id uuid REFERENCES compensation_policies(id) ON DELETE SET NULL,
  policy_snapshot jsonb NOT NULL,
  outcome text NOT NULL,
  duration_minutes numeric(10,2) NOT NULL,
  enrolled_student_count integer NOT NULL,
  attributed_revenue numeric(12,2) NOT NULL DEFAULT 0,
  estimated_compensation numeric(12,2) NOT NULL DEFAULT 0,
  contribution numeric(12,2) NOT NULL DEFAULT 0,
  confirmation_state text NOT NULL CHECK (confirmation_state IN ('confirmed', 'estimated', 'missing_policy')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_id, lesson_id)
);
CREATE INDEX teacher_economics_snapshot_lines_scope_idx ON teacher_economics_snapshot_lines (organization_id, snapshot_id, teacher_id);

CREATE TABLE teacher_economics_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  snapshot_id uuid NOT NULL REFERENCES teacher_economics_snapshots(id) ON DELETE CASCADE,
  lesson_id uuid REFERENCES lessons(id) ON DELETE SET NULL,
  actor_profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  before_values jsonb NOT NULL,
  after_values jsonb NOT NULL,
  reason text NOT NULL,
  decision_reason text,
  decided_by_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX teacher_economics_adjustments_scope_idx ON teacher_economics_adjustments (organization_id, snapshot_id, status);

CREATE TABLE teacher_economics_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('policy', 'snapshot', 'adjustment')),
  entity_id uuid NOT NULL,
  action text NOT NULL,
  actor_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  before_values jsonb,
  after_values jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX teacher_economics_audit_scope_idx ON teacher_economics_audit_log (organization_id, entity_type, entity_id, created_at DESC);

-- Financial/economics tables are service-role only. Server actions apply the
-- capability matrix and return strict role-specific DTOs.
ALTER TABLE compensation_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_economics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_economics_snapshot_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_economics_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_economics_audit_log ENABLE ROW LEVEL SECURITY;
