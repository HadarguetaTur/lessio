-- Punch cards, per-student attendance and one collection policy (decision #46).
--
-- A pack is a LEDGER, not a pricing rule and not a balance column. Its balance
-- is always SUM(delta) over the un-reversed rows of lesson_pack_ledger, so a
-- retry, a race or an undo can never leave a stored number disagreeing with
-- its history. A lesson is covered by a pack exactly when an un-reversed
-- consume_* row exists for (lesson_id, student_id).
--
-- Attendance is recorded per student on lesson_students; the lesson status is
-- derived from it (no_show iff every enrolled student was absent).
--
-- Every default keeps today's behaviour for an org that configures nothing:
-- a no-show costs 0%, packs activate immediately and belong to one student.
--
-- Replaces the unapplied draft 20260915150000_lesson_packs_foundation.sql,
-- which recorded an undo as a separate row and so could never re-punch the
-- same (lesson, student) after a reversal. That draft must be deleted before
-- this migration runs — both create lesson_packs.

-- ── 1. Catalog ─────────────────────────────────────────────────────────────

create table if not exists lesson_pack_products (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references organizations(id) on delete cascade,
  name                 text not null check (length(btrim(name)) > 0),
  credits              integer not null check (credits > 0),
  price                numeric(10,2) not null check (price >= 0),
  covered_lesson_types text[] not null default '{individual,pair,group,custom}'
                         check (cardinality(covered_lesson_types) > 0
                           and covered_lesson_types <@ array['individual','pair','group','custom']::text[]),
  validity_days        integer check (validity_days is null or validity_days > 0),
  is_active            boolean not null default true,
  sort_order           integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists lesson_pack_products_org_idx
  on lesson_pack_products (organization_id, is_active, sort_order);

create trigger set_updated_at_lesson_pack_products
  before update on lesson_pack_products
  for each row execute function set_updated_at();

-- ── 2. Packs: one sale, with a snapshot of the product ─────────────────────

create table if not exists lesson_packs (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references organizations(id) on delete cascade,
  product_id              uuid references lesson_pack_products(id) on delete set null,
  -- The paying parent, and the owner of a family pack.
  parent_id               uuid not null references parents(id) on delete cascade,
  -- NULL = family pack: every child of parent_id punches the same card.
  student_id              uuid references students(id) on delete cascade,
  -- Whose monthly bill carries the sale in a monthly org. Equals student_id for
  -- a personal pack; for a family pack, the child it was sold from.
  billing_student_id      uuid references students(id) on delete set null,
  name                    text not null,
  total_credits           integer not null check (total_credits > 0),
  price                   numeric(10,2) not null check (price >= 0),
  covered_lesson_types    text[] not null
                            check (cardinality(covered_lesson_types) > 0
                              and covered_lesson_types <@ array['individual','pair','group','custom']::text[]),
  purchased_at            timestamptz not null default now(),
  valid_from              date not null,
  valid_until             date,
  -- The billing month the sale belongs to. A monthly org bills it there.
  sold_billing_month      text not null check (sold_billing_month ~ '^\d{4}-\d{2}$'),
  -- NULL = waiting for payment (pack_activation = 'on_payment').
  activated_at            timestamptz,
  -- Set iff the org bills per lesson. NULL is how the monthly engine knows the
  -- sale is a line on the monthly bill instead of a charge of its own.
  charge_id               uuid unique references charges(id) on delete set null,
  cancelled_at            timestamptz,
  cancel_reason           text,
  low_balance_notified_at timestamptz,
  exhausted_notified_at   timestamptz,
  notes                   text,
  created_by              uuid references profiles(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint lesson_packs_validity_order check (valid_until is null or valid_until >= valid_from),
  constraint lesson_packs_cancel_reason check (cancelled_at is null or length(btrim(coalesce(cancel_reason, ''))) > 0)
);

create index if not exists lesson_packs_org_student_idx
  on lesson_packs (organization_id, student_id) where cancelled_at is null;
create index if not exists lesson_packs_org_parent_idx
  on lesson_packs (organization_id, parent_id) where cancelled_at is null;
create index if not exists lesson_packs_monthly_sales_idx
  on lesson_packs (organization_id, billing_student_id, sold_billing_month)
  where cancelled_at is null and charge_id is null;

create trigger set_updated_at_lesson_packs
  before update on lesson_packs
  for each row execute function set_updated_at();

-- ── 3. The ledger (append-only; an undo marks reversed_at) ─────────────────

create table if not exists lesson_pack_ledger (
  id               uuid primary key default gen_random_uuid(),
  pack_id          uuid not null references lesson_packs(id) on delete cascade,
  organization_id  uuid not null references organizations(id) on delete cascade,
  student_id       uuid references students(id) on delete set null,
  lesson_id        uuid references lessons(id) on delete set null,
  kind             text not null check (kind in (
                     'purchase', 'consume_lesson', 'consume_late_cancel', 'consume_no_show',
                     'manual_adjust', 'expire')),
  delta            integer not null,
  reason           text,
  actor_profile_id uuid references profiles(id) on delete set null,
  reversed_at      timestamptz,
  reversed_reason  text,
  created_at       timestamptz not null default now(),
  constraint lesson_pack_ledger_delta_sign check (
    (kind = 'purchase' and delta > 0)
    or (kind in ('consume_lesson', 'consume_late_cancel', 'consume_no_show') and delta = -1)
    or (kind = 'expire' and delta < 0)
    or (kind = 'manual_adjust' and delta <> 0)
  ),
  constraint lesson_pack_ledger_manual_reason check (
    kind not in ('manual_adjust', 'expire') or length(btrim(coalesce(reason, ''))) > 0
  )
);

-- One punch per student per lesson. The idempotency key for every completion,
-- retry and race; reversed rows drop out so an undo can be re-punched.
create unique index if not exists lesson_pack_ledger_one_use_per_lesson_student
  on lesson_pack_ledger (lesson_id, student_id)
  where lesson_id is not null
    and reversed_at is null
    and kind in ('consume_lesson', 'consume_late_cancel', 'consume_no_show');

create index if not exists lesson_pack_ledger_pack_idx
  on lesson_pack_ledger (pack_id) where reversed_at is null;
create index if not exists lesson_pack_ledger_org_lesson_idx
  on lesson_pack_ledger (organization_id, lesson_id) where lesson_id is not null;

create or replace view lesson_pack_balances
  with (security_invoker = true) as
select
  p.*,
  coalesce(sum(l.delta) filter (where l.reversed_at is null), 0)::integer as remaining,
  count(l.id) filter (
    where l.reversed_at is null
      and l.kind in ('consume_lesson', 'consume_late_cancel', 'consume_no_show')
  )::integer as used_count
from lesson_packs p
left join lesson_pack_ledger l on l.pack_id = p.id
group by p.id;

-- ── 4. Punching: one serialised decision ───────────────────────────────────
--
-- 'already'  an un-reversed use for (lesson, student) exists; nothing written.
-- 'consumed' one credit was taken from the best eligible pack.
-- 'none'     no active, valid, covering pack with credit — bill in money.
--
-- Candidate order: the student's own pack before a family pack, then the one
-- expiring first, then oldest purchase. FOR UPDATE serialises two lessons
-- racing for the last credit (the loser sees remaining = 0 and gets 'none').

create or replace function consume_pack_credit(
  p_org         uuid,
  p_student     uuid,
  p_lesson      uuid,
  p_lesson_type text,
  p_lesson_date date,
  p_kind        text
)
returns table (consumed_pack_id uuid, remaining_credits integer, outcome text, consumed_kind text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_pack uuid;
  v_existing_kind text;
  v_parent        uuid;
  v_candidate     uuid;
  v_remaining     integer;
begin
  if p_kind not in ('consume_lesson', 'consume_late_cancel', 'consume_no_show') then
    raise exception 'consume_pack_credit: invalid kind %', p_kind;
  end if;

  select l.pack_id, l.kind
    into v_existing_pack, v_existing_kind
    from lesson_pack_ledger l
   where l.organization_id = p_org
     and l.lesson_id = p_lesson
     and l.student_id = p_student
     and l.reversed_at is null
     and l.kind in ('consume_lesson', 'consume_late_cancel', 'consume_no_show')
   limit 1;

  if v_existing_pack is not null then
    return query
      select v_existing_pack,
             (select coalesce(sum(x.delta), 0)::integer
                from lesson_pack_ledger x
               where x.pack_id = v_existing_pack and x.reversed_at is null),
             'already'::text,
             v_existing_kind;
    return;
  end if;

  select r.parent_id
    into v_parent
    from relationships r
   where r.organization_id = p_org
     and r.student_id = p_student
     and r.is_primary = true
   limit 1;

  for v_candidate in
    select p.id
      from lesson_packs p
     where p.organization_id = p_org
       and p.cancelled_at is null
       and p.activated_at is not null
       and p.valid_from <= p_lesson_date
       and (p.valid_until is null or p.valid_until >= p_lesson_date)
       and p_lesson_type = any (p.covered_lesson_types)
       and (
         p.student_id = p_student
         or (p.student_id is null and v_parent is not null and p.parent_id = v_parent)
       )
     order by (p.student_id is null), p.valid_until nulls last, p.purchased_at
     for update of p
  loop
    select coalesce(sum(x.delta), 0)::integer
      into v_remaining
      from lesson_pack_ledger x
     where x.pack_id = v_candidate and x.reversed_at is null;

    if v_remaining > 0 then
      begin
        insert into lesson_pack_ledger (pack_id, organization_id, student_id, lesson_id, kind, delta)
        values (v_candidate, p_org, p_student, p_lesson, p_kind, -1);
      exception when unique_violation then
        -- A concurrent call punched this (lesson, student) first.
        return query select null::uuid, 0, 'already'::text, null::text;
        return;
      end;
      return query select v_candidate, v_remaining - 1, 'consumed'::text, p_kind;
      return;
    end if;
  end loop;

  return query select null::uuid, 0, 'none'::text, null::text;
end;
$$;

revoke all on function consume_pack_credit(uuid, uuid, uuid, text, date, text) from public, anon, authenticated;
grant execute on function consume_pack_credit(uuid, uuid, uuid, text, date, text) to service_role;

-- ── 5. Booking that waits for payment ──────────────────────────────────────
--
-- A parent with no entitlement picks a pack or a single lesson and pays
-- BEFORE the lesson exists. Only a verified payment that still holds an
-- active slot lock may confirm; anything else creates no lesson.

create table if not exists booking_checkout_sessions (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  parent_id         uuid not null references parents(id) on delete cascade,
  student_id        uuid not null references students(id) on delete cascade,
  teacher_id        uuid not null references teachers(id) on delete cascade,
  slot_lock_id      uuid not null unique references slot_locks(id) on delete cascade,
  selection         text not null check (selection in ('pack', 'single_lesson')),
  pack_product_id   uuid references lesson_pack_products(id) on delete set null,
  charge_id         uuid unique references charges(id) on delete set null,
  pack_id           uuid unique references lesson_packs(id) on delete set null,
  lesson_id         uuid unique references lessons(id) on delete set null,
  lesson_start_at   timestamptz not null,
  lesson_end_at     timestamptz not null,
  lesson_type       text not null default 'individual',
  quoted_amount     numeric(10,2) not null check (quoted_amount >= 0),
  currency          text,
  status            text not null default 'pending'
                      check (status in ('pending', 'paid', 'confirmed', 'expired', 'cancelled', 'needs_attention')),
  failure_reason    text,
  expires_at        timestamptz not null,
  payment_reference text,
  payment_link      text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint booking_checkout_pack_product check (selection <> 'pack' or pack_product_id is not null)
);

create index if not exists booking_checkout_sessions_org_status_idx
  on booking_checkout_sessions (organization_id, status, expires_at);

create trigger set_updated_at_booking_checkout_sessions
  before update on booking_checkout_sessions
  for each row execute function set_updated_at();

-- ── 6. Attendance per student ──────────────────────────────────────────────

alter table lesson_students
  add column if not exists attendance             text check (attendance in ('present', 'absent')),
  add column if not exists attendance_recorded_at timestamptz,
  -- What the policy said this absence costs, recorded when it was settled, so
  -- a later policy edit does not rewrite an old bill. 0 when covered.
  add column if not exists absence_amount         numeric(10,2) check (absence_amount is null or absence_amount >= 0),
  add column if not exists absence_covered_by     text check (absence_covered_by in ('subscription', 'pack'));

create index if not exists lesson_students_absent_idx
  on lesson_students (lesson_id) where attendance = 'absent';

-- ── 7. The collection policy ───────────────────────────────────────────────

alter table cancellation_policies
  add column if not exists no_show_charge_percent     integer not null default 0
    check (no_show_charge_percent between 0 and 100),
  add column if not exists no_show_pack_action        text not null default 'consume'
    check (no_show_pack_action in ('consume', 'charge')),
  add column if not exists late_cancel_pack_action    text not null default 'consume'
    check (late_cancel_pack_action in ('consume', 'charge')),
  add column if not exists pack_activation            text not null default 'immediate'
    check (pack_activation in ('immediate', 'on_payment')),
  add column if not exists pack_scope                 text not null default 'student'
    check (pack_scope in ('student', 'family')),
  add column if not exists pack_low_balance_threshold integer not null default 2
    check (pack_low_balance_threshold >= 0),
  add column if not exists pack_notifications_enabled boolean not null default false,
  -- The org collects through punch cards: a portal booking with no
  -- entitlement is paid before it is confirmed. Per-lesson orgs only.
  add column if not exists pack_collection_enabled    boolean not null default false;

-- ── 8. Money ───────────────────────────────────────────────────────────────

alter table charges drop constraint if exists charges_charge_type_check;
alter table charges add constraint charges_charge_type_check
  check (charge_type in ('lesson', 'cancellation', 'manual', 'monthly', 'pack', 'no_show'));

create unique index if not exists charges_no_show_lesson_student_unique
  on charges (lesson_id, student_id)
  where charge_type = 'no_show' and status <> 'voided';

alter table student_monthly_billing
  add column if not exists packs_amount   numeric(10,2) not null default 0,
  add column if not exists packs_count    integer not null default 0,
  add column if not exists no_show_amount numeric(10,2) not null default 0,
  add column if not exists no_show_count  integer not null default 0;

alter table notification_log drop constraint if exists notification_log_type_check;
alter table notification_log add constraint notification_log_type_check check (type in (
  'lesson_reminder',
  'payment_reminder',
  'homework_reminder',
  'saas_renewal_reminder',
  'saas_dunning',
  'org_suspended_notice',
  'saas_trial_reminder',
  'saas_lifecycle_email',
  'exam_good_luck',
  'pack_low_balance',
  'pack_exhausted'
));

-- ── 9. RLS ─────────────────────────────────────────────────────────────────
-- Financial records: owner/admin read only, every write through server code
-- with the service role. No office_manager policy, matching
-- 20260915130000_office_manager_role.sql — an office manager sees a balance
-- only through a server read that strips the money.

alter table lesson_pack_products      enable row level security;
alter table lesson_packs              enable row level security;
alter table lesson_pack_ledger        enable row level security;
alter table booking_checkout_sessions enable row level security;

create policy lesson_pack_products_read_own_org on lesson_pack_products
  for select to authenticated
  using (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    and coalesce(auth.jwt() ->> 'app_role', '') in ('owner', 'admin')
  );

create policy lesson_packs_read_own_org on lesson_packs
  for select to authenticated
  using (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    and coalesce(auth.jwt() ->> 'app_role', '') in ('owner', 'admin')
  );

create policy lesson_pack_ledger_read_own_org on lesson_pack_ledger
  for select to authenticated
  using (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    and coalesce(auth.jwt() ->> 'app_role', '') in ('owner', 'admin')
  );

create policy booking_checkout_sessions_read_own_org on booking_checkout_sessions
  for select to authenticated
  using (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    and coalesce(auth.jwt() ->> 'app_role', '') in ('owner', 'admin')
  );

comment on table lesson_pack_ledger is
  'Append-only punch-card ledger. Balance = SUM(delta) WHERE reversed_at IS NULL. Decision #46.';
comment on table booking_checkout_sessions is
  'A portal booking with no entitlement, held on a slot lock until the parent pays. Only a verified payment on a live lock confirms it.';
