-- Saved broadcast lists: a named, hand-picked set of parents.
--
-- Student groups already serve as lists for most announcements ("everyone in
-- beginners' guitar"). What they cannot express is a choice that follows no
-- structure — "the five parents who asked about the summer course". Before
-- this, the only way to reach them was the broadcast `manual` audience, which
-- had no screen and was rebuilt from scratch every time.
--
-- A list is an audience, not a campaign: broadcast_campaigns.audience stores
-- { kind: 'list', listId } and the members are resolved at send time, so a
-- parent removed from the list — or who opted out since — is not messaged.
-- Consent, opt-out and frequency rules apply exactly as for every other
-- audience (src/lib/whatsapp/broadcast/audience.ts).
--
-- Writes go through server actions with the service role; the policies below
-- only let the dashboard read its own org's lists.

create table if not exists broadcast_lists (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 80),
  created_by       uuid references profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_broadcast_lists_org on broadcast_lists (organization_id, name);

create table if not exists broadcast_list_members (
  list_id          uuid not null references broadcast_lists(id) on delete cascade,
  parent_id        uuid not null references parents(id) on delete cascade,
  -- Denormalised so the read policy and the org-scoped queries need no join.
  organization_id  uuid not null references organizations(id) on delete cascade,
  added_at         timestamptz not null default now(),
  primary key (list_id, parent_id)
);

create index if not exists idx_broadcast_list_members_parent on broadcast_list_members (parent_id);

create trigger set_updated_at_broadcast_lists
  before update on broadcast_lists
  for each row execute function set_updated_at();

alter table broadcast_lists enable row level security;
alter table broadcast_list_members enable row level security;

create policy broadcast_lists_read_own_org on broadcast_lists
  for select to authenticated
  using (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    and coalesce(auth.jwt() ->> 'app_role', '') in ('owner', 'admin')
  );

create policy broadcast_list_members_read_own_org on broadcast_list_members
  for select to authenticated
  using (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    and coalesce(auth.jwt() ->> 'app_role', '') in ('owner', 'admin')
  );

comment on table broadcast_lists is
  'Named, hand-picked sets of parents used as a broadcast audience ({ kind: ''list'' }). Members are resolved at send time.';
