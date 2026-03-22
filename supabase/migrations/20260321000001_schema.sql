-- Migration: 20260321000001_schema.sql
-- All Sprint 1 tables per /docs/schema.md (v2 Final) and /docs/decisions.md
-- Tables created in foreign-key dependency order.

-- ─── updated_at trigger function ─────────────────────────────────────────────
-- Shared by: organizations, profiles, teachers, parents, students,
--            lessons, charges, cancellation_policies
-- (leads has updated_at column per schema.md but is not listed in the
--  sprint-1-scope.md trigger list — column present, trigger omitted.)

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── organizations ────────────────────────────────────────────────────────────

CREATE TABLE organizations (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     text        NOT NULL,
  slug                     text        UNIQUE NOT NULL,
  whatsapp_number          text,
  whatsapp_token           text,                          -- Meta Cloud API token (encrypted at app layer)
  timezone                 text        NOT NULL DEFAULT 'Asia/Jerusalem',
  break_duration_minutes   int         NOT NULL DEFAULT 0,
  min_booking_notice_hours int         NOT NULL DEFAULT 0,
  billing_mode             text        CHECK (billing_mode IN ('monthly', 'per_lesson')) DEFAULT 'monthly',
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now()
);

CREATE TRIGGER set_updated_at_organizations
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── profiles ─────────────────────────────────────────────────────────────────
-- Authenticated dashboard users: owner, admin, teacher.
-- id mirrors auth.users(id) — one profile per Supabase Auth user.

CREATE TABLE profiles (
  id              uuid  PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid  NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name       text  NOT NULL,
  phone           text,                                   -- E.164
  role            text  NOT NULL CHECK (role IN ('owner', 'admin', 'teacher')),
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_profiles_org_role ON profiles (organization_id, role);
CREATE INDEX idx_profiles_phone    ON profiles (phone);

CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── teachers ─────────────────────────────────────────────────────────────────
-- Every teacher must have a dashboard profile (profile_id NOT NULL per decisions.md #7).

CREATE TABLE teachers (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id      uuid    NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  bio             text,
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_teachers_org ON teachers (organization_id);

CREATE TRIGGER set_updated_at_teachers
  BEFORE UPDATE ON teachers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── parents ──────────────────────────────────────────────────────────────────
-- Billing/contact entity. Not a Supabase Auth user.
-- Phone stored as E.164; unique per org.

CREATE TABLE parents (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name       text    NOT NULL,
  phone           text    NOT NULL,                       -- E.164
  notes           text,
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (organization_id, phone)
);

CREATE INDEX idx_parents_org   ON parents (organization_id);
CREATE INDEX idx_parents_phone ON parents (phone);

CREATE TRIGGER set_updated_at_parents
  BEFORE UPDATE ON parents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── students ─────────────────────────────────────────────────────────────────

CREATE TABLE students (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name       text    NOT NULL,
  grade           text,
  notes           text,
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_students_org ON students (organization_id);

CREATE TRIGGER set_updated_at_students
  BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── relationships ────────────────────────────────────────────────────────────
-- Links parents to students. is_primary = true → billing parent for lessons.
-- Rule: if a student has no primary parent, lesson creation must fail.

CREATE TABLE relationships (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  parent_id       uuid    NOT NULL REFERENCES parents(id)  ON DELETE CASCADE,
  student_id      uuid    NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  is_primary      boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (parent_id, student_id)
);

CREATE INDEX idx_relationships_org_student ON relationships (organization_id, student_id);

-- ─── availability ─────────────────────────────────────────────────────────────
-- Recurring weekly availability windows. day_of_week: 0=Sunday … 6=Saturday.

CREATE TABLE availability (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  teacher_id      uuid NOT NULL REFERENCES teachers(id)      ON DELETE CASCADE,
  day_of_week     int  NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time      time NOT NULL,
  end_time        time NOT NULL,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_availability_teacher_day ON availability (teacher_id, day_of_week);

-- ─── availability_overrides ───────────────────────────────────────────────────
-- Date-specific exceptions that override recurring availability.

CREATE TABLE availability_overrides (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  teacher_id      uuid    NOT NULL REFERENCES teachers(id)      ON DELETE CASCADE,
  override_date   date    NOT NULL,
  is_available    boolean NOT NULL,
  start_time      time,
  end_time        time,
  reason          text,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (teacher_id, override_date)
);

CREATE INDEX idx_availability_overrides_teacher_date ON availability_overrides (teacher_id, override_date);

-- ─── lessons ──────────────────────────────────────────────────────────────────
-- Confirmed bookings. start_at / end_at stored as UTC.

CREATE TABLE lessons (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  teacher_id      uuid NOT NULL REFERENCES teachers(id),
  student_id      uuid NOT NULL REFERENCES students(id),
  start_at        timestamptz NOT NULL,
  end_at          timestamptz NOT NULL,
  status          text NOT NULL CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
  cancel_reason   text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_lessons_org_teacher_start ON lessons (organization_id, teacher_id, start_at);
CREATE INDEX idx_lessons_org_student       ON lessons (organization_id, student_id);

CREATE TRIGGER set_updated_at_lessons
  BEFORE UPDATE ON lessons
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── slot_locks ───────────────────────────────────────────────────────────────
-- Transient booking locks. Valid lock = status='active' AND expires_at > now().
-- Expired locks are NOT deleted — they are treated as released in queries.
-- Writes are service-role only (enforced via RLS in migration 2).

CREATE TABLE slot_locks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  teacher_id      uuid NOT NULL REFERENCES teachers(id),
  student_id      uuid          REFERENCES students(id),
  start_at        timestamptz NOT NULL,
  end_at          timestamptz NOT NULL,
  expires_at      timestamptz NOT NULL,               -- now() + 5 minutes at creation
  status          text NOT NULL
                    CHECK (status IN ('active', 'consumed', 'expired'))
                    DEFAULT 'active',
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_slot_locks_teacher_start ON slot_locks (teacher_id, start_at, expires_at, status);

-- ─── charges ──────────────────────────────────────────────────────────────────

CREATE TABLE charges (
  id              uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid           NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  parent_id       uuid           NOT NULL REFERENCES parents(id),
  lesson_id       uuid                    REFERENCES lessons(id),         -- nullable
  amount          numeric(10, 2) NOT NULL,
  charge_type     text           NOT NULL CHECK (charge_type IN ('lesson', 'cancellation', 'manual')),
  status          text           NOT NULL CHECK (status IN ('pending', 'invoiced', 'paid')),
  notes           text,
  due_date        date,
  paid_at         timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_charges_org_parent_status ON charges (organization_id, parent_id, status);
CREATE INDEX idx_charges_lesson            ON charges (lesson_id);

CREATE TRIGGER set_updated_at_charges
  BEFORE UPDATE ON charges
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── cancellation_policies ────────────────────────────────────────────────────
-- One policy per organization (enforced by UNIQUE on organization_id).

CREATE TABLE cancellation_policies (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  notice_hours_full      int  NOT NULL DEFAULT 24,
  notice_hours_partial   int  NOT NULL DEFAULT 2,
  partial_charge_percent int  NOT NULL DEFAULT 50,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);

CREATE TRIGGER set_updated_at_cancellation_policies
  BEFORE UPDATE ON cancellation_policies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── leads ────────────────────────────────────────────────────────────────────
-- Parents who contacted via WhatsApp but do not exist in the parents table.
--
-- TODO(LESSIO): Conflict between docs/schema.md (v2 Final) and docs/decisions.md on leads table.
-- Conflict: decisions.md adds `source text not null default 'whatsapp'` and
--           unique(organization_id, phone), but omits raw_message, notes, updated_at.
--           schema.md (v2 Final) has raw_message, notes, updated_at but no source or unique constraint.
-- Question: Should leads have source + unique(org_id, phone) from decisions.md?
--           Using schema.md as authoritative until explicitly resolved.

CREATE TABLE leads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  phone           text NOT NULL,                          -- E.164
  raw_message     text,
  status          text NOT NULL
                    CHECK (status IN ('new', 'contacted', 'converted', 'irrelevant'))
                    DEFAULT 'new',
  notes           text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_leads_org_status ON leads (organization_id, status);
CREATE INDEX idx_leads_phone       ON leads (phone);
