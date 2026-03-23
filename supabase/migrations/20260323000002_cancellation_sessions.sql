-- Sprint 4: cancellation session state machine
-- Used by the WhatsApp cancellation flow (Decision #14)
-- Service-role only — no RLS

create table if not exists cancellation_sessions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  phone           text not null,
  lesson_ids      text[] not null,
  expires_at      timestamptz not null,
  created_at      timestamptz default now(),

  unique (organization_id, phone)
);

create index on cancellation_sessions (organization_id, phone);
create index on cancellation_sessions (expires_at);
