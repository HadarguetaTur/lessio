# LESSIO — Database Schema
*Covers the live schema through Sprint 33 (Integration Hub).*
*The migrations in `supabase/migrations/` are authoritative; this is the readable map of them.*

All tables use `uuid` primary keys (`gen_random_uuid()`).
All tables include `created_at timestamptz default now()`.
All tenant-scoped tables include `organization_id uuid not null references organizations(id)`.
RLS is enabled on all tables. Service role bypasses RLS for server-side logic.

---

## organizations

```sql
id                            uuid pk
name                          text not null
slug                          text unique not null
-- WhatsApp (Sprint 7)
whatsapp_number               text                     -- legacy, deprecated after Sprint 7
whatsapp_token                text                     -- legacy, deprecated after Sprint 7
whatsapp_phone_number_id      text unique              -- Meta internal phone number ID
whatsapp_access_token         text                     -- AES-256-GCM encrypted Meta access token
-- Scheduling  (owner-editable at /settings/scheduling since 2026-09)
timezone                      text not null default 'Asia/Jerusalem'
break_duration_minutes        int not null default 0   -- default; teachers may override
min_booking_notice_hours      int not null default 0
tail_prompt_enabled           boolean not null default true  -- 2026-09
-- Billing
billing_mode                  text check (billing_mode in ('monthly','per_lesson')) default 'monthly'
group_pricing_mode            text check (group_pricing_mode in ('fixed','per_student')) default 'per_student'
-- Payments (Sprint 8)
payment_provider              text check (payment_provider in ('cardcom','payplus','bit','paybox','stripe','grow','make'))
payment_config_encrypted      text                     -- AES-256-GCM encrypted JSON with credentials
-- Auto payment (Sprint 9)
auto_send_payment_request     boolean not null default false
payment_confirmation_default_enabled boolean not null default true
                              -- pre-checks the "tell the parent" box in the
                              -- mark-as-paid dialogs; a default only, staff
                              -- can flip it per payment
-- Parent portal (owner/admin-editable at /settings/parent-portal since 2026-09)
portal_settings               jsonb not null default '{}'::jsonb
                              -- {enabled, payments, homework, exams, progress,
                              --  messages, booking, cancellation}; a missing key
                              --  means on. Read via normalizePortalSettings().
-- Reminders (Sprint 12)
reminders_enabled             boolean not null default true
lesson_reminder_hours         smallint not null default 24
                              check (lesson_reminder_hours in (2, 4, 12, 24, 48))
payment_reminder_days         smallint not null default 7
                              check (payment_reminder_days > 0 and payment_reminder_days <= 30)
-- Timestamps
created_at                    timestamptz default now()
updated_at                    timestamptz default now()
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
hourly_rate     numeric(10,2)                       -- Sprint 3
break_duration_minutes int null                     -- 2026-09; NULL inherits the org
is_active       boolean default true
ical_token      text                                -- planned Sprint 16
created_at      timestamptz default now()
updated_at      timestamptz default now()

index: (organization_id)
```

`break_duration_minutes` overrides `organizations.break_duration_minutes`. NULL and 0
are different answers: NULL follows the business, 0 is a teacher who teaches
back-to-back and must not acquire a break when the business raises its default. See
decisions.md #2.

---

## parents

Billing/contact entity. Not a Supabase Auth user. Identified by E.164 phone.

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
phone           text                                -- E.164, nullable (Sprint 7)
is_active       boolean default true
created_at      timestamptz default now()
updated_at      timestamptz default now()

index: (organization_id)
```

When `phone` is set, WhatsApp messages (homework, reminders) go directly to the student.
When null, messages go to the primary parent via `relationships`.

---

## relationships

Links parents to students. `is_primary` determines billing parent.

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

**Rule:** Billing parent at lesson creation = parent where `is_primary = true` for the student.
No primary parent → error; lesson not created.

---

## availability

Recurring weekly availability windows.

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

Date-specific exceptions to recurring availability.

```sql
id              uuid pk
organization_id uuid not null references organizations(id)
teacher_id      uuid not null references teachers(id)
override_date   date not null
is_available    boolean not null
start_time      time                                -- null = unavailable all day
end_time        time
reason          text
created_at      timestamptz default now()

index: (teacher_id, override_date)
partial unique: (teacher_id, override_date) where is_available = false and start_time is null
```

Several rows per teacher per date are legal since `20260901130000`; the old
`unique (teacher_id, override_date)` was dropped. Three row kinds share the table:

| is_available | times | meaning |
|---|---|---|
| false | null | the whole date is blocked |
| false | set | just that range is blocked |
| true | set | special hours **replacing** the weekly grid for that date |

Readers take the base windows (the special-hours rows if any, else the weekly grid)
and subtract every blocked range — `resolveDayWindows` in `src/lib/availability/`
is the single implementation of that rule. "Replacing" is why extending a day has to
materialise *all* of its windows, not just the one being extended.

---

## availability_tail_prompts

Unbookable leftover time at the end of a teacher's day, awaiting their decision.
Added 2026-09.

```sql
id              uuid pk
organization_id uuid not null references organizations(id) on delete cascade
teacher_id      uuid not null references teachers(id) on delete cascade
tail_date       date not null
tail_start      time not null                       -- org-local wall clock
tail_end        time not null
tail_minutes    int not null check (tail_minutes > 0)
status          text not null default 'pending'     -- pending|dismissed|blocked|extended
resolved_by     uuid references profiles(id) on delete set null
resolved_at     timestamptz
created_at      timestamptz default now()
updated_at      timestamptz default now()

unique: (teacher_id, tail_date)
index: (organization_id, teacher_id, tail_date) where status = 'pending'
```

Notes:
- Service-role only (RLS enabled, deny-all policy), like `in_app_notifications`.
- The unique key is the dedupe: every booking on a date recomputes the remainder, and
  without it each one would raise another notification about the same half hour.
  `detectDayTail` treats 23505 as "already asked" rather than an error.
- Times are wall clock, matching `availability` and `availability_overrides` — an
  instant would put a DST transition between the prompt and the window it describes.
- The row records that the teacher was asked, not what is true now. Reads re-derive the
  remainder and drop rows whose leftover a cancelled lesson has since freed.

---

## organization_holidays

Org-wide holiday dates. Blocks all slots for all teachers on these dates.

```sql
id              uuid pk
organization_id uuid not null references organizations(id)
date            date not null
name            text not null
created_at      timestamptz default now()

unique: (organization_id, date)
index: (organization_id, date)
```

---

## lesson_series

Metadata for a recurring lesson series. Individual lessons reference this via `series_id`.

```sql
id              uuid pk
organization_id uuid not null references organizations(id)
teacher_id      uuid not null references teachers(id)
student_id      uuid not null references students(id)   -- display/primary only; the roster is per lesson
group_id        uuid references student_groups(id) on delete set null  -- set for a group series
rule            jsonb not null                      -- { frequency, day_of_week, start_time, duration_minutes, until }
stopped_at      timestamptz                         -- set when an admin stopped the series; cleared on extend
created_by      uuid not null references profiles(id)
created_at      timestamptz default now()

index: none beyond the pk — always read as WHERE organization_id = ?
```

**rule JSON shape:**
```json
{
  "frequency": "weekly" | "biweekly",
  "day_of_week": 0-6,
  "start_time": "HH:MM",
  "duration_minutes": 30 | 45 | 60 | 90,
  "until": "YYYY-MM-DD"
}
```

---

## lessons

```sql
id              uuid pk
organization_id uuid not null references organizations(id)
teacher_id      uuid not null references teachers(id)
-- student_id removed in Sprint 7 (now in lesson_students junction)
lesson_type     text not null check (lesson_type in ('individual','pair','group','custom')) default 'individual'
max_students    int not null default 1
series_id       uuid references lesson_series(id)  -- null for one-off lessons
group_id        uuid references student_groups(id) on delete set null
                -- the student group a group lesson was built from; the calendar shows its name.
                -- check: group_id is null or lesson_type = 'group'. Null for legacy group lessons
                -- that no single group matched at backfill, and after the group is deleted.
start_at        timestamptz not null               -- UTC
end_at          timestamptz not null               -- UTC
status          text not null check (status in ('scheduled','completed','cancelled','no_show'))
cancel_reason   text
created_at      timestamptz default now()
updated_at      timestamptz default now()

index: (organization_id, teacher_id, start_at)
index: (organization_id, series_id)
index: (group_id) where group_id is not null
```

---

## lesson_students

Junction table linking students to lessons. Supports group/pair/individual.

```sql
id              uuid pk
organization_id uuid not null references organizations(id)
lesson_id       uuid not null references lessons(id) on delete cascade
student_id      uuid not null references students(id)
status          text not null check (status in ('enrolled','cancelled')) default 'enrolled'
created_at      timestamptz default now()

unique: (lesson_id, student_id)
index: (organization_id, lesson_id)
index: (organization_id, student_id)
```

---

## slot_locks

Temporary reservation during the parent booking flow.

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
After booking confirmation: `status = 'consumed'`

---

## charges

```sql
id                  uuid pk
organization_id     uuid not null references organizations(id)
parent_id           uuid not null references parents(id)
lesson_id           uuid references lessons(id)       -- nullable for manual charges
amount              numeric(10,2) not null
charge_type         text not null check (charge_type in ('lesson','cancellation','manual'))
status              text not null check (status in ('pending','invoiced','paid'))
notes               text
due_date            date
paid_at             timestamptz
-- Payment request metadata (Sprint 4)
sent_at             timestamptz
sent_by_profile_id  uuid references profiles(id)
-- Payment provider (Sprint 8)
payment_link        text                              -- URL for parent to pay online
payment_reference   text                              -- provider transaction reference
payment_provider    text                              -- cardcom | payplus | bit | paybox | stripe | grow | make
-- Receipt (planned Sprint 15)
receipt_url         text
receipt_issued_at   timestamptz
created_at          timestamptz default now()
updated_at          timestamptz default now()

index: (organization_id, parent_id, status)
index: (lesson_id)
partial unique index: (lesson_id) where charge_type = 'lesson'
```

**Idempotency:** partial unique index on `lesson_id` for `charge_type = 'lesson'` prevents duplicate lesson charges.

---

## cancellation_policies

One row per organization.

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

Inbound WhatsApp contacts not yet in `parents`.

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

Repeated WhatsApp messages from the same phone update the existing lead (no duplicate created).

---

## cancellation_sessions

Active WhatsApp cancellation conversation state.

```sql
id              uuid pk
organization_id uuid not null references organizations(id)
parent_id       uuid not null references parents(id)
phone           text not null
lesson_ids      uuid[]                              -- eligible lessons shown to parent
expires_at      timestamptz not null                -- 10-min timeout
created_at      timestamptz default now()
```

---

## notification_log

Idempotency log for all automated WhatsApp notifications. One row per entity per type.

```sql
id              uuid pk
organization_id uuid not null references organizations(id)
type            text not null check (type in ('lesson_reminder','payment_reminder'))
entity_id       uuid not null                       -- lesson_id or charge_id
sent_at         timestamptz not null default now()
status          text not null check (status in ('sent','failed')) default 'sent'
error_message   text

unique: (organization_id, type, entity_id)
index: idx_notification_log_lookup on (organization_id, type, entity_id)
```

RLS: service role only. Edge Functions use service role key.

---

## portal_otps
*Planned: Sprint 13*

Phone OTP storage for parent portal login.

```sql
id              uuid pk
organization_id uuid not null references organizations(id)
phone           text not null                       -- E.164
otp_hash        text not null                       -- SHA-256 of 6-digit OTP
expires_at      timestamptz not null                -- now() + 10 min
used            boolean not null default false
created_at      timestamptz default now()

index: idx_portal_otps_lookup on (phone, organization_id) where not used
```

RLS: service role only.

---

## Phone Normalization

All phones stored as E.164. Logic in `src/lib/phone/index.ts`:

```text
05XXXXXXXX    → +9725XXXXXXXX
9725XXXXXXXX  → +9725XXXXXXXX
+9725XXXXXXXX → unchanged
```

---

## RLS Summary

| Table | Owner | Admin | Teacher | Service Role |
|---|---|---|---|---|
| organizations | full | read | read (minimal) | full |
| profiles | full | read (org) | read (self) | full |
| teachers | full | full | read (self) | full |
| parents | full | full | — | full |
| students | full | full | lesson context | full |
| relationships | full | full | — | full |
| availability | full | full | self only | full |
| availability_overrides | full | full | self only | full |
| organization_holidays | full | full | read | full |
| lesson_series | full | full | read (own) | full |
| lessons | full | full | read + update outcome (own) | full |
| lesson_students | full | full | read (own) | full |
| slot_locks | — | — | — | full only |
| charges | full | read | — | full |
| cancellation_policies | full | read | — | full |
| leads | full | full | — | full |
| cancellation_sessions | — | — | — | full only |
| notification_log | — | — | — | full only |
| portal_otps | — | — | — | full only |

---

## Planned Tables (Future Sprints)

### homework_templates (Sprint 14)

```sql
id                      uuid pk
organization_id         uuid not null references organizations(id)
title                   text not null
subject                 text
grade_level             text
content_markdown        text not null
tags                    text[] default '{}'
created_by_profile_id   uuid references profiles(id)
is_active               boolean default true
created_at              timestamptz default now()
updated_at              timestamptz default now()

index: (organization_id, is_active)
```

### homework_assignments (Sprint 14)

```sql
id                  uuid pk
organization_id     uuid not null references organizations(id)
template_id         uuid references homework_templates(id)
student_id          uuid not null references students(id)
teacher_id          uuid references teachers(id)
lesson_id           uuid references lessons(id)
title               text not null
content_markdown    text not null
due_at              timestamptz
status              text not null default 'assigned'
                    check (status in ('assigned','viewed','submitted','checked','overdue'))
assigned_at         timestamptz default now()
reminder_sent_at    timestamptz
checked_at          timestamptz
notes               text
created_at          timestamptz default now()
updated_at          timestamptz default now()

index: (organization_id, student_id, status)
index: (organization_id, due_at)
index: (lesson_id)
```

### message_templates (Sprint 16)

Custom WhatsApp message bodies per org per notification type.

```sql
id              uuid pk
organization_id uuid not null references organizations(id)
type            text not null                       -- booking_confirmation, lesson_reminder, etc.
body_template   text not null                       -- with {{variable}} placeholders
updated_at      timestamptz not null default now()

unique: (organization_id, type)
```

### conversation_log (Sprint 19)

AI WhatsApp assistant conversation history.

```sql
id              uuid pk
organization_id uuid not null references organizations(id)
parent_id       uuid references parents(id)
phone           text not null
role            text not null check (role in ('parent','assistant'))
content         text not null
created_at      timestamptz default now()

index: (organization_id, phone, created_at)
```

### whatsapp_messages (2026-09-03)

The WhatsApp conversation transcript, both directions. Distinct from
`conversation_log`, which only ever recorded the AI-assistant branch.

```sql
id                 uuid pk
organization_id    uuid not null references organizations(id) on delete cascade
phone              text not null                       -- conversation key, normalized E.164
direction          text not null check (direction in ('in','out'))
origin             text check (origin in ('bot','ai','staff','cron'))  -- null on inbound
parent_id          uuid references parents(id) on delete set null      -- best-effort
sender_role        text check (sender_role in ('parent','student','teacher','staff','unknown'))
sent_by_profile_id uuid references profiles(id) on delete set null     -- staff manual sends
kind               text not null default 'text'
                     check (kind in ('text','template','interactive','cta_url','media','unsupported'))
body               text not null                       -- '[template: …]' / '[media]' placeholders
wa_message_id      text                                -- Meta's id (messages[0].id on outbound)
status             text not null default 'sent' check (status in ('received','sent','failed'))
created_at         timestamptz not null default now()

index: idx_whatsapp_messages_thread on (organization_id, phone, created_at DESC)
```

RLS: SELECT for owner / admin / teacher in the org (org-wide, deliberately —
teacher scoping is done by the page query through the service-role client).
Writes are service-role only. Published to `supabase_realtime`.

Written fire-and-forget by `src/lib/whatsapp/messageLog.ts`. Edge Function
(Deno) sends are **not** logged yet. Anonymised by the `data-retention` cron.

### whatsapp_takeovers (2026-09-03)

A staff member is answering a conversation by hand; the webhook skips its
auto-reply while a row is live. Same lifecycle as `support_sessions`.

```sql
id                  uuid pk
organization_id     uuid not null references organizations(id) on delete cascade
phone               text not null
taken_by_profile_id uuid references profiles(id) on delete set null
expires_at          timestamptz not null                -- now() + 6h, extended per staff message
created_at          timestamptz not null default now()

unique: (organization_id, phone)
```

Expiry is checked at read time (no cleanup cron); release is a DELETE. Same RLS
and realtime posture as `whatsapp_messages`.

### subscriptions (Sprint 21)

SaaS subscription tracking for LESSIO's own customers.

> **Superseded.** This Stripe-shaped sketch never shipped. What was actually
> built is `saas_plans` / `organization_subscriptions` / `saas_invoices`,
> billed through Sumit — see **SaaS platform billing** at the end of this
> document.

```sql
-- organizations table additions (Sprint 21):
-- trial_ends_at      timestamptz
-- stripe_customer_id text
-- subscription_status text check (...) default 'trial'

CREATE TABLE subscription_plans (
  id                text primary key,               -- 'basic', 'pro', 'enterprise'
  name              text not null,
  price_monthly     numeric not null,
  stripe_price_id   text not null
);
```

---

## Support (Sprint 32)

Customer→platform support. The "customer" is an org owner/admin; the responder
is the platform operator in `/admin/support`. Both tables are service-role only
(RLS deny-all) — all access goes through server actions that resolve the org
from the session.

```sql
CREATE TABLE support_tickets (
  id                uuid pk
  organization_id   uuid not null references organizations(id) on delete cascade
  created_by        uuid references profiles(id) on delete set null
  subject           text not null
  status            text not null default 'open'
                    check (status in ('open','in_progress','waiting_on_customer','resolved','closed'))
  category          text check (category in ('bug','question','feature_request','other'))  -- null until AI triage
  severity          text check (severity in ('low','medium','high','critical'))            -- null until AI triage
  source            text not null check (source in ('widget','whatsapp','auto'))
  page_url          text            -- captured by the widget
  user_agent        text            -- captured by the widget
  ai_classified_at  timestamptz
  resolved_at       timestamptz
  created_at        timestamptz not null default now()
  updated_at        timestamptz not null default now()   -- update_updated_at() trigger
);

index: (organization_id, created_at desc)
index: (status, created_at desc) where status in ('open','in_progress','waiting_on_customer')

CREATE TABLE support_ticket_messages (
  id                uuid pk
  ticket_id         uuid not null references support_tickets(id) on delete cascade
  author_type       text not null check (author_type in ('customer','admin','ai','system'))
  author_profile_id uuid references profiles(id) on delete set null
  body              text not null
  created_at        timestamptz not null default now()
);

index: (ticket_id, created_at)
```

Notes:
- A ticket is a thread. The opening customer message is a `support_ticket_messages`
  row like any other, so a reply from either side is the same insert.
- Tickets outlive notifications: `in_app_notifications` is swept after 30 days by
  the `notification-cleanup` cron, so notifications carry only an `action_url`
  pointer into these tables, never the content.
- Support is not plan-gated — no `saasFeature` / `requireFeature` on any of it.

---

## Support sessions + error telemetry (Sprint 32 M2/M3)

```sql
CREATE TABLE support_sessions (          -- in-flight WhatsApp support requests
  id              uuid pk
  organization_id uuid not null references organizations(id) on delete cascade
  phone           text not null
  step            text not null default 'awaiting_description'
                  check (step in ('awaiting_description','awaiting_confirm'))
  draft_text      text                   -- typed but not yet confirmed
  expires_at      timestamptz not null   -- read-time expiry, no cleanup cron
  created_at      timestamptz not null default now()
  unique (organization_id, phone)        -- upsert target: one request per phone
);

CREATE TABLE error_events (              -- raw production error feed
  id              uuid pk
  fingerprint     text not null          -- sha256(name + norm message + norm route)[:16]
  name            text
  message         text
  route           text
  digest          text                   -- Next's per-build error id (NOT in fingerprint)
  source          text not null check (source in ('server','client','edge'))
  organization_id uuid references organizations(id) on delete set null
  url             text
  user_agent      text
  stack           text                   -- truncated to 8k
  created_at      timestamptz not null default now()
);

index: (fingerprint, created_at desc)    -- the detection query
index: (created_at)                      -- the 30-day sweep

CREATE TABLE dev_issues (                -- recurring bugs promoted from the feed
  id                  uuid pk
  fingerprint         text unique        -- null for a hand-opened issue
  title               text not null
  status              text not null default 'open'
                      check (status in ('open','investigating','fixed','wont_fix'))
  severity            text check (severity in ('low','medium','high','critical'))
  event_count         integer not null default 0
  org_count           integer not null default 0
  first_seen          timestamptz
  last_seen           timestamptz
  sample_stack        text
  github_issue_number integer
  github_issue_url    text               -- also the anti-double-file guard
  resolved_at         timestamptz
  created_at          timestamptz not null default now()
  updated_at          timestamptz not null default now()   -- update_updated_at() trigger
);

index: (status, last_seen desc)

ALTER TABLE support_tickets
  ADD COLUMN dev_issue_id uuid references dev_issues(id) on delete set null;
index: (dev_issue_id) where dev_issue_id is not null
```

Notes:
- All three are service-role only (RLS deny-all restrictive).
- `dev_issues.fingerprint` is UNIQUE and the cron upserts on it — that is the
  guarantee one bug can never open two issues, however often the cron runs.
- `ON DELETE SET NULL` on `dev_issue_id`: deleting an issue must never take a
  customer's support ticket with it.
- The fingerprint excludes Next's `digest`, which changes every build.

---

## Sprint 33 — Integration Hub (M1)

```sql
CREATE TABLE organization_api_keys (
  id              uuid primary key default gen_random_uuid()
  organization_id uuid not null references organizations(id) on delete cascade
  name            text not null                      -- owner-facing label only
  key_hash        text not null unique               -- sha256 hex of the full key
  key_prefix      text not null                      -- first 12 chars, for display
  scopes          text[] not null default '{}'       -- read | write | messages:send
  created_by      uuid references profiles(id) on delete set null
  last_used_at    timestamptz
  revoked_at      timestamptz                        -- set, never deleted
  created_at      timestamptz not null default now()
);

index: (organization_id) where revoked_at is null

CREATE TABLE api_request_log (
  id              bigserial primary key
  organization_id uuid not null references organizations(id) on delete cascade
  api_key_id      uuid references organization_api_keys(id) on delete set null
  method          text not null
  path            text not null
  status_code     int  not null
  created_at      timestamptz not null default now()
);

index: (api_key_id, created_at desc)      -- the rate-limit window
index: (organization_id, created_at desc) -- the settings activity list
```

Notes:
- Both are service-role only (RLS enabled, no policies), like `charge_audit_log`.
- `key_hash` is a **digest, not ciphertext**. Unlike `payment_config_encrypted` or a
  Gmail refresh token — third-party credentials we must be able to replay — an API key
  is minted by us and only ever needs to be recognised again. A leak of this table
  hands out no working keys. The plaintext exists for exactly one HTTP response.
- A revoked key keeps its row: `api_request_log` references it, and an owner
  investigating what an automation did needs the name to outlive the revoke.
- `api_request_log` is written for **every** authenticated request, failures included —
  the sliding-window rate limiter counts these rows, so skipping failures would let a
  caller retry past the limit for free.
- `saas_plans.features` gained an `integrations` key. `parseSaasFeatures` reads keys by
  name and coerces a missing one to `false`, so every plan row needs an explicit value.

---

## SaaS platform billing

Organizations paying **Lessio**. Entirely separate from the billing engine that
bills an org’s own students (`charges`, `student_monthly_billing`).

### saas_plans

The catalog. Prices are VAT-inclusive ILS.

```sql
id                    uuid primary key
name                  text unique       -- free | basic | advanced | solo | studio | center | custom
display_name_he       text
display_name_en       text
price_monthly         numeric(10,2) not null default 0
price_yearly          numeric(10,2)
features              jsonb default '{}'  -- 8 boolean flags, see src/lib/saas/types.ts
is_active             boolean default true
sort_order            int                 -- the value ladder; retired tiers interleave
students_quota        int                 -- null = unlimited
lessons_monthly_quota int
teachers_quota        int                 -- the seat metric since Sep 2026
```

`getSaasPlanById` deliberately does **not** filter `is_active`: a retired row
keeps resolving for the orgs that hold it, which is what makes grandfathering
structural rather than a promise. Pinned by `plans.test.ts`.

### organization_subscriptions

One row per org (`organization_id` is UNIQUE).

```sql
id                          uuid primary key
organization_id             uuid unique references organizations(id)
plan_id                     uuid references saas_plans(id)
status                      text  -- trial | active | pending_payment | past_due | cancelled | read_only
billing_interval            text  -- monthly | yearly
trial_ends_at               timestamptz
current_period_start        timestamptz
current_period_end          timestamptz
cancel_at_period_end        boolean default false
cancelled_at                timestamptz

-- Sumit linkage, written at activation
sumit_customer_id           text
sumit_subscription_id       text
sumit_payment_token         text          -- the card the renewal charger charges
card_last_four              text
card_expiry_month           smallint      -- 20260902120000
card_expiry_year            smallint      -- 20260902120000

-- Checkout in flight
pending_checkout_reference  text          -- server-generated uuid, the binding key
pending_checkout_started_at timestamptz   -- 20260902120000; a payment older than this cannot activate
previous_status             text          -- snapshot so an abandoned checkout can revert
previous_plan_id            uuid

-- Renewal state machine (20260902120000)
renewal_attempts            integer not null default 0
next_renewal_attempt_at     timestamptz   -- period_end + 0/3/7 days
last_renewal_attempt_at     timestamptz   -- doubles as the claim lease
last_renewal_error          text
```

### saas_invoices

Every platform charge, successful or not.

```sql
id                   uuid primary key
organization_id      uuid
subscription_id      uuid
amount               numeric(10,2)
currency             text default 'ILS'
status               text  -- paid | pending | failed
source               text  -- checkout | renewal | manual   (20260902120000)
sumit_payment_id     text          -- 20260902120000; unique across paid rows
sumit_document_id    text          -- unique where not null (20260829130100)
sumit_document_url   text
failure_reason       text          -- 20260902120000; the binding refusal or Sumit decline
billing_period_start timestamptz
billing_period_end   timestamptz
issued_at            timestamptz
```

Two unique indexes carry the money-safety guarantees:

- `idx_saas_invoices_sumit_payment` — a Sumit payment id may appear on **one**
  paid row. This is the anti-replay guard: a valid payment id pasted into a
  fresh callback URL cannot activate a second subscription.
- `idx_saas_invoices_paid_period` — one paid row per `(subscription_id,
  billing_period_start)`, a backstop against a double renewal.

### Functions (20260902120000)

| Function | Purpose |
|---|---|
| `claim_saas_renewals(now, lease, max_attempts, limit)` | Selects due renewals and stamps the lease in one statement (`FOR UPDATE SKIP LOCKED`), so overlapping cron runs cannot charge the same row |
| `record_saas_renewal_success(...)` | Advances the period **from the previous period end** and inserts the paid invoice, in one statement. Guarded on the period end the caller charged for, so a stale caller is a no-op |
| `record_saas_renewal_failure(...)` | Moves to `past_due`, increments the attempt, schedules the next, and writes the failed invoice row |

All three have `EXECUTE` revoked from `PUBLIC` — service role only.

### Related

- `organizations.service_state` (`active|grace|suspended|dormant`) is derived from
  the subscription by `derive_service_state` / `sync_org_service_states`
  (20260829140100). It is what actually silences the bot, the crons and the
  parent portal.
- `notification_log` carries the platform sends: `saas_renewal_reminder`,
  `saas_dunning`, `saas_trial_reminder`, `saas_lifecycle_email`,
  `org_suspended_notice`. `status` gained `pending` (20260902120000) so an owner
  email is claimed before it is sent rather than after.
- `saas_plan_inquiries` — custom-plan requests from onboarding.
