-- Per-org overrides for bot strings the owner may reword — today, the labels on
-- the buttons the bot sends.
--
-- Not a column on message_templates: a button label is a bot string shared
-- across flows (the same "open my area" label appears on three different
-- replies), so hanging it off one template type would duplicate it and let the
-- copies drift. Keyed by BotStringKey instead, which is what botString() looks
-- up at send time.
--
-- Which keys may be overridden is enforced in the application layer against
-- CUSTOMIZABLE_BOT_STRINGS (src/lib/whatsapp/templateButtons.ts), the same way
-- message_templates.type is — a CHECK here would need a migration every time a
-- flow gains a button.

create table org_bot_strings (
  organization_id uuid        not null references organizations(id) on delete cascade,
  key             text        not null,
  locale          text        not null check (locale in ('he', 'en')),
  value           text        not null,
  updated_at      timestamptz not null default now(),
  primary key (organization_id, key, locale)
);

comment on table org_bot_strings is
  'Org-authored overrides for bot strings, keyed by BotStringKey. Absence = the built-in string.';

alter table org_bot_strings enable row level security;

-- Mirrors message_templates: any org member may read what their bot says,
-- only an owner may change it. Both the page and the actions use the service
-- role, so the owner check in the server action is the real enforcement — this
-- is defence in depth.
create policy "org members can read own bot strings"
  on org_bot_strings for select
  using (
    organization_id in (
      select organization_id from profiles where id = auth.uid()
    )
  );

create policy "owner can manage own bot strings"
  on org_bot_strings for all
  using (
    organization_id in (
      select organization_id from profiles where id = auth.uid() and role = 'owner'
    )
  );
