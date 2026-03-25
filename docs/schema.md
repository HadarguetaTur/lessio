# LESSIO — Database Schema (v4)

All tables use `uuid` primary keys.
All tables include `created_at timestamptz default now()`.
All tenant-scoped tables include `organization_id uuid not null references organizations(id)`.
RLS is enabled on all tables.

Sprint 6 note:
Production-readiness work does not require new domain tables by default.
This schema remains the source of truth unless a narrowly justified regression or release-safety fix requires an explicit update.

---

## organizations

```sql
id                          uuid pk
name                        text not null
slug                        text unique not null
whatsapp_number             text
whatsapp_token              text                    -- Meta Cloud API token (encrypted)
timezone                    text not null default 'Asia/Jerusalem'
break_duration_minutes      int not null default 0
min_booking_notice_hours    int not null default 0
billing_mode                text check (billing_mode in ('monthly','per_lesson')) default 'monthly'
created_at                  timestamptz default now()
updated_at                  timestamptz default now()
```

---

## profiles

Authenticated dashboard users (`owner`, `admin`, `teacher`).

```sql
id              uuid pk references auth.users(id)
organization_id uuid not null references organizations(id)
full_name       text not null
phone           text                                -- E.164
role            text not null check (role in ('owner','admin','teacher'))
is_active       boolean default true
created_at      timestamptz default now()
updated_at      timestamptz default now()

index: (organization_id, role)
index: (phone)
```

---

## teachers

```sql
id              uuid pk
organization_id uuid not null references organizations(id)
profile_id      uuid not null unique references profiles(id)
bio             text
hourly_rate     numeric(10,2)
is_active       boolean default true
created_at      timestamptz default now()
updated_at      timestamptz default now()

index: (organization_id)
```

`hourly_rate` was added in Sprint 3 and is used by the existing approved charge flow when a lesson is marked `completed`.

---

## parents

Billing/contact entity. Not an auth user. Identified by phone number in E.164 format.

```sql
id              uuid pk
organization_id uuid not null references organizations(id)
full_name       text not null
phone           text not null                       -- E.164
notes           text
is_active       boolean default true
created_at      timestamptz default now()
updated_at      timestamptz default now()

unique: (organization_id, phone)
index: (organization_id)
index: (phone)
```

---

## students

```sql
id              uuid pk
organization_id uuid not null references organizations(id)
full_name       text not null
grade           text
notes           text
is_active       boolean default true
created_at      timestamptz default now()
updated_at      timestamptz default now()

index: (organization_id)
```

---

## relationships

Links parents to students. `is_primary` determines who gets billed.

```sql
id              uuid pk
organization_id uuid not null references organizations(id)
parent_id       uuid not null references parents(id)
student_id      uuid not null references students(id)
is_primary      boolean default true
created_at      timestamptz default now()

unique: (parent_id, student_id)
index: (organization_id, student_id)
```

**Rule:** The billing parent at lesson creation time = the parent where `is_primary = true` for the given `student_id`.
If there is no primary parent → error, and the lesson is not created.

---

## availability

Recurring weekly availability.

```sql
id              uuid pk
organization_id uuid not null references organizations(id)
teacher_id      uuid not null references teachers(id)
day_of_week     int not null check (day_of_week between 0 and 6)  -- 0=Sunday
start_time      time not null
end_time        time not null
created_at      timestamptz default now()

index: (teacher_id, day_of_week)
```

---

## availability_overrides

Date-specific exceptions.

```sql
id              uuid pk
organization_id uuid not null references organizations(id)
teacher_id      uuid not null references teachers(id)
override_date   date not null
is_available    boolean not null
start_time      time
end_time        time
reason          text
created_at      timestamptz default now()

unique: (teacher_id, override_date)
index: (teacher_id, override_date)
```

---

## lessons

```sql
id              uuid pk
organization_id uuid not null references organizations(id)
teacher_id      uuid not null references teachers(id)
student_id      uuid not null references students(id)
start_at        timestamptz not null
end_at          timestamptz not null
status          text not null check (status in ('scheduled','completed','cancelled','no_show'))
cancel_reason   text
created_at      timestamptz default now()
updated_at      timestamptz default now()

index: (organization_id, teacher_id, start_at)
index: (organization_id, student_id)
```

---

## slot_locks

```sql
id              uuid pk
organization_id uuid not null references organizations(id)
teacher_id      uuid not null references teachers(id)
student_id      uuid references students(id)
start_at        timestamptz not null
end_at          timestamptz not null
expires_at      timestamptz not null                -- now() + 5 min
status          text not null check (status in ('active','consumed','expired')) default 'active'
created_at      timestamptz default now()

index: (teacher_id, start_at, expires_at, status)
```

Valid lock = `status = 'active' AND expires_at > now()`
After confirmation: `status = 'consumed'`

---

## charges

```sql
id              uuid pk
organization_id uuid not null references organizations(id)
parent_id       uuid not null references parents(id)
lesson_id       uuid references lessons(id)         -- nullable
amount          numeric(10,2) not null
charge_type     text not null check (charge_type in ('lesson','cancellation','manual'))
status          text not null check (status in ('pending','invoiced','paid'))
notes           text
due_date        date
paid_at         timestamptz
sent_at         timestamptz                         -- Sprint 4 payment request metadata
sent_by_profile_id uuid references profiles(id)    -- owner/admin who sent the request
created_at      timestamptz default now()
updated_at      timestamptz default now()

index: (organization_id, parent_id, status)
index: (lesson_id)
partial unique index: (lesson_id) where `charge_type = 'lesson'`
```

**Sprint 4 rule:** sending a payment request updates metadata on each included charge.
Minimum logged data = `sent_at` + `sent_by_profile_id`.

**Idempotency rule:** lesson charges are protected by a partial unique index on `lesson_id` for `charge_type = 'lesson'`, so repeating the completed-lesson charge flow does not create duplicates.

---

## cancellation_policies

```sql
id                      uuid pk
organization_id         uuid not null unique references organizations(id)
notice_hours_full       int not null default 24
notice_hours_partial    int not null default 2
partial_charge_percent  int not null default 50
created_at              timestamptz default now()
updated_at              timestamptz default now()
```

---

## leads

Parents who contacted via WhatsApp but do not exist as `parents`.

```sql
id              uuid pk
organization_id uuid not null references organizations(id)
phone           text not null                       -- E.164
raw_message     text
status          text not null check (status in ('new','contacted','converted','irrelevant')) default 'new'
notes           text
created_at      timestamptz default now()
updated_at      timestamptz default now()

unique: (organization_id, phone)
index: (organization_id, status)
index: (phone)
```

**Sprint 4 rule:** repeated WhatsApp messages from the same normalized phone must update the existing lead instead of creating a duplicate record.

---

## Phone Normalization

All phone numbers are stored as E.164. Logic is in `src/lib/phone/index.ts`:

```text
05XXXXXXXX    → +9725XXXXXXXX
9725XXXXXXXX  → +9725XXXXXXXX
+9725XXXXXXXX → unchanged
```

---

## RLS Summary

| Table                  | Owner | Admin      | Teacher                    | Service Role |
| ---------------------- | ----- | ---------- | -------------------------- | ------------ |
| organizations          | full  | read       | read (minimal org context only) | full    |
| profiles               | full  | read (org) | read (self)                | full         |
| teachers               | full  | full       | read (self)                | full         |
| parents                | full  | full       | —                          | full         |
| students               | full  | full       | lesson context only        | full         |
| relationships          | full  | full       | —                          | full         |
| availability           | full  | full       | —                          | full         |
| availability_overrides | full  | full       | —                          | full         |
| lessons                | full  | full       | read + update own outcome only | full      |
| slot_locks             | —     | —          | —                          | full only    |
| charges                | full  | read       | —                          | full         |
| cancellation_policies  | full  | read       | —                          | full         |
| leads                  | full  | full       | —                          | full         |


---

## Planned Post-Launch Expansion (not part of Sprint 6 baseline)

The following tables are planning targets for future SaaS expansion work.
They are **not** implemented by the current Sprint 6 schema baseline and must not be treated as live production behavior until explicitly migrated.

### conversation_threads

Per-organization conversation container for official WhatsApp interactions.

```sql
id                 uuid pk
organization_id    uuid not null references organizations(id)
channel            text not null check (channel in ('whatsapp'))
actor_type         text not null check (actor_type in ('parent','student','teacher','staff'))
actor_phone        text not null                      -- E.164
status             text not null check (status in ('active','paused','closed')) default 'active'
last_message_at    timestamptz
created_at         timestamptz default now()
updated_at         timestamptz default now()

index: (organization_id, actor_phone)
index: (organization_id, status)
```

### conversation_sessions

Active bot flow state for deterministic WhatsApp journeys.

```sql
id                 uuid pk
organization_id    uuid not null references organizations(id)
thread_id          uuid not null references conversation_threads(id)
flow_key           text not null                      -- booking, cancel, balance_lookup, homework_lookup
actor_type         text not null check (actor_type in ('parent','student','teacher','staff'))
state              text not null
context_json       jsonb not null default '{}'
expires_at         timestamptz
status             text not null check (status in ('active','completed','expired','cancelled')) default 'active'
created_at         timestamptz default now()
updated_at         timestamptz default now()

index: (organization_id, status, expires_at)
index: (thread_id, status)
```

### teacher_calendar_connections

Teacher-owned external calendar connection. First phase = outbound sync only.

```sql
id                 uuid pk
organization_id    uuid not null references organizations(id)
teacher_id         uuid not null references teachers(id)
provider           text not null check (provider in ('google'))
external_calendar_id text not null
access_token       text                              -- encrypted at rest
refresh_token      text                              -- encrypted at rest
token_expires_at   timestamptz
sync_direction     text not null check (sync_direction in ('outbound_only')) default 'outbound_only'
status             text not null check (status in ('active','revoked','error')) default 'active'
last_synced_at     timestamptz
created_at         timestamptz default now()
updated_at         timestamptz default now()

unique: (teacher_id, provider)
index: (organization_id, status)
```

### calendar_sync_events

Delivery tracking between LESSIO lessons and external calendar events.

```sql
id                 uuid pk
organization_id    uuid not null references organizations(id)
connection_id      uuid not null references teacher_calendar_connections(id)
lesson_id          uuid not null references lessons(id)
external_event_id  text
sync_status        text not null check (sync_status in ('pending','synced','failed','deleted')) default 'pending'
last_attempt_at    timestamptz
last_error         text
created_at         timestamptz default now()
updated_at         timestamptz default now()

unique: (connection_id, lesson_id)
index: (organization_id, sync_status)
```

### homework_templates

Reusable homework library owned by each organization.

```sql
id                 uuid pk
organization_id    uuid not null references organizations(id)
title              text not null
subject            text
grade_level        text
content_markdown   text not null
tags               text[] default '{}'
created_by_profile_id uuid references profiles(id)
is_active          boolean default true
created_at         timestamptz default now()
updated_at         timestamptz default now()

index: (organization_id, is_active)
```

### homework_assignments

Student-facing assignment created from a template or ad-hoc content.

```sql
id                 uuid pk
organization_id    uuid not null references organizations(id)
template_id        uuid references homework_templates(id)
student_id         uuid not null references students(id)
teacher_id         uuid references teachers(id)
lesson_id          uuid references lessons(id)
title              text not null
content_markdown   text not null
due_at             timestamptz
status             text not null check (status in ('assigned','viewed','submitted','checked','overdue')) default 'assigned'
assigned_at        timestamptz default now()
reminder_sent_at   timestamptz
checked_at         timestamptz
notes              text
created_at         timestamptz default now()
updated_at         timestamptz default now()

index: (organization_id, student_id, status)
index: (organization_id, due_at)
index: (lesson_id)
```

### organization_integrations

Organization-scoped configuration for external providers and automation endpoints.

```sql
id                 uuid pk
organization_id    uuid not null references organizations(id)
provider_type      text not null check (provider_type in ('payment','automation','calendar','messaging'))
provider_key       text not null                      -- make, google, meta, provider-specific payment adapter
status             text not null check (status in ('draft','active','disabled','error')) default 'draft'
config_json        jsonb not null default '{}'
created_by_profile_id uuid references profiles(id)
last_tested_at     timestamptz
created_at         timestamptz default now()
updated_at         timestamptz default now()

unique: (organization_id, provider_type, provider_key)
index: (organization_id, status)
```

### integration_deliveries

Outbound event delivery log for Make and other provider adapters.

```sql
id                 uuid pk
organization_id    uuid not null references organizations(id)
integration_id     uuid not null references organization_integrations(id)
event_type         text not null
event_key          text not null
payload_json       jsonb not null
status             text not null check (status in ('pending','sent','failed','dead_letter')) default 'pending'
attempt_count      int not null default 0
last_attempt_at    timestamptz
response_code      int
response_body      text
created_at         timestamptz default now()
updated_at         timestamptz default now()

unique: (integration_id, event_key)
index: (organization_id, status, last_attempt_at)
```
