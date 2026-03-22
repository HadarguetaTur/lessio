-- supabase/seed.sql
-- Sprint 1 demo data per /docs/sprint-1-scope.md:
--   1 organization, 1 owner, 1 teacher (Mon–Thu 16:00–20:00),
--   1 parent, 1 student, 1 relationship, 1 cancellation policy.
--
-- Fixed UUIDs are used throughout for reproducibility in tests and local dev.
-- ⚠️  Demo credentials below are for local development only — never use in production.

DO $$
DECLARE
  v_org_id         uuid := 'a1000000-0000-0000-0000-000000000001';
  v_owner_id       uuid := 'a1000000-0000-0000-0000-000000000002';
  v_teacher_uid    uuid := 'a1000000-0000-0000-0000-000000000003';
  v_teacher_id     uuid;
  v_parent_id      uuid := 'a1000000-0000-0000-0000-000000000004';
  v_student_id     uuid := 'a1000000-0000-0000-0000-000000000005';
BEGIN

  -- ── Auth users ──────────────────────────────────────────────────────────────
  -- Insert directly into auth.users so profile foreign keys resolve.
  -- For full login capability in local dev, these users can also be created
  -- via the Supabase dashboard or CLI: `supabase auth user create`.

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin
  ) VALUES
    (
      '00000000-0000-0000-0000-000000000000',
      v_owner_id,
      'authenticated', 'authenticated',
      'owner@lessio.demo',
      crypt('Demo1234!', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}', '{}', false
    ),
    (
      '00000000-0000-0000-0000-000000000000',
      v_teacher_uid,
      'authenticated', 'authenticated',
      'teacher@lessio.demo',
      crypt('Demo1234!', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}', '{}', false
    )
  ON CONFLICT (id) DO NOTHING;

  -- Auth identities (required for email provider login)
  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES
    (
      gen_random_uuid(), v_owner_id, v_owner_id::text,
      jsonb_build_object('sub', v_owner_id::text, 'email', 'owner@lessio.demo'),
      'email', now(), now(), now()
    ),
    (
      gen_random_uuid(), v_teacher_uid, v_teacher_uid::text,
      jsonb_build_object('sub', v_teacher_uid::text, 'email', 'teacher@lessio.demo'),
      'email', now(), now(), now()
    )
  ON CONFLICT DO NOTHING;

  -- ── Organization ────────────────────────────────────────────────────────────
  INSERT INTO organizations (
    id, name, slug, timezone,
    break_duration_minutes, min_booking_notice_hours, billing_mode
  ) VALUES (
    v_org_id,
    'Lessio Demo',
    'lessio-demo',
    'Asia/Jerusalem',
    15,   -- 15-minute break between lessons
    0,    -- same-day booking allowed
    'monthly'
  )
  ON CONFLICT (id) DO NOTHING;

  -- ── Profiles ────────────────────────────────────────────────────────────────
  INSERT INTO profiles (id, organization_id, full_name, phone, role, is_active)
  VALUES
    (v_owner_id,    v_org_id, 'Demo Owner',   '+972501234567', 'owner',   true),
    (v_teacher_uid, v_org_id, 'Demo Teacher', '+972507654321', 'teacher', true)
  ON CONFLICT (id) DO NOTHING;

  -- ── Teacher record ──────────────────────────────────────────────────────────
  INSERT INTO teachers (organization_id, profile_id, is_active)
  VALUES (v_org_id, v_teacher_uid, true)
  ON CONFLICT (profile_id) DO NOTHING
  RETURNING id INTO v_teacher_id;

  -- RETURNING above is skipped on DO NOTHING — resolve the id explicitly
  IF v_teacher_id IS NULL THEN
    SELECT id INTO v_teacher_id FROM teachers WHERE profile_id = v_teacher_uid;
  END IF;

  -- ── Teacher availability: Monday–Thursday 16:00–20:00 ───────────────────────
  -- day_of_week: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday
  INSERT INTO availability (organization_id, teacher_id, day_of_week, start_time, end_time)
  VALUES
    (v_org_id, v_teacher_id, 1, '16:00', '20:00'),  -- Monday
    (v_org_id, v_teacher_id, 2, '16:00', '20:00'),  -- Tuesday
    (v_org_id, v_teacher_id, 3, '16:00', '20:00'),  -- Wednesday
    (v_org_id, v_teacher_id, 4, '16:00', '20:00')   -- Thursday
  ON CONFLICT DO NOTHING;

  -- ── Parent ──────────────────────────────────────────────────────────────────
  INSERT INTO parents (id, organization_id, full_name, phone, is_active)
  VALUES (v_parent_id, v_org_id, 'Demo Parent', '+972509876543', true)
  ON CONFLICT (id) DO NOTHING;

  -- ── Student ─────────────────────────────────────────────────────────────────
  INSERT INTO students (id, organization_id, full_name, grade, is_active)
  VALUES (v_student_id, v_org_id, 'Demo Student', '5', true)
  ON CONFLICT (id) DO NOTHING;

  -- ── Relationship: parent → student (primary) ────────────────────────────────
  INSERT INTO relationships (organization_id, parent_id, student_id, is_primary)
  VALUES (v_org_id, v_parent_id, v_student_id, true)
  ON CONFLICT (parent_id, student_id) DO NOTHING;

  -- ── Cancellation policy ─────────────────────────────────────────────────────
  -- 24h notice = full refund, 2h notice = 50% charge
  INSERT INTO cancellation_policies (
    organization_id, notice_hours_full, notice_hours_partial, partial_charge_percent
  ) VALUES (v_org_id, 24, 2, 50)
  ON CONFLICT (organization_id) DO NOTHING;

  RAISE NOTICE '✓ Seed complete.';
  RAISE NOTICE '  org_id:      %', v_org_id;
  RAISE NOTICE '  owner_id:    %  (owner@lessio.demo / Demo1234!)', v_owner_id;
  RAISE NOTICE '  teacher_uid: %  (teacher@lessio.demo / Demo1234!)', v_teacher_uid;
  RAISE NOTICE '  teacher_id:  %', v_teacher_id;
  RAISE NOTICE '  parent_id:   %', v_parent_id;
  RAISE NOTICE '  student_id:  %', v_student_id;

END $$;
