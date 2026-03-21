# LESSIO — Database Schema (v2 Final)

All tables use `uuid` primary keys.
All tables include `created_at timestamptz default now()`.
All tenant-scoped tables include `organization_id uuid not null references organizations(id)`.
RLS is enabled on all tables.

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
is_active       boolean default true
created_at      timestamptz default now()
updated_at      timestamptz default now()

index: (organization_id)
```

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
created_at      timestamptz default now()
updated_at      timestamptz default now()

index: (organization_id, parent_id, status)
index: (lesson_id)
```

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

index: (organization_id, status)
index: (phone)
```

---

## Phone Normalization

All phone numbers are stored as E.164. Logic is in `/lib/utils/phone.ts`:

```text
05XXXXXXXX    → +9725XXXXXXXX
9725XXXXXXXX  → +9725XXXXXXXX
+9725XXXXXXXX → unchanged
```

---

## RLS Summary

| Table                  | Owner | Admin      | Teacher                    | Service Role |
| ---------------------- | ----- | ---------- | -------------------------- | ------------ |
| organizations          | full  | read       | read                       | full         |
| profiles               | full  | read (org) | read (self)                | full         |
| teachers               | full  | full       | read + update (self)       | full         |
| parents                | full  | full       | —                          | full         |
| students               | full  | full       | read (linked)              | full         |
| relationships          | full  | full       | read (linked)              | full         |
| availability           | full  | full       | full (self)                | full         |
| availability_overrides | full  | full       | full (self)                | full         |
| lessons                | full  | full       | read + update status (own) | full         |
| slot_locks             | —     | —          | —                          | full only    |
| charges                | full  | read       | —                          | full         |
| cancellation_policies  | full  | read       | —                          | full         |
| leads                  | full  | full       | —                          | full         |


