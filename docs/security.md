# LESSIO — Security & RLS Specification (v1)

## Core Rules

* All tables have RLS enabled
* All access is filtered by `organization_id` — no access to another organization’s data
* Booking operations (writes to `slot_locks`, `lessons`) are service-role only, server-side
* Parents and students are not Supabase Auth users — they do not have RLS policies. Their access is managed through JWT context in application code

---

## Permissions Matrix

| Action                         | Owner | Admin | Teacher       | Service Role |
| ------------------------------ | ----- | ----- | ------------- | ------------ |
| org settings (read/write)      | ✅     | ❌     | ❌             | ✅            |
| integrations                   | ✅     | ❌     | ❌             | ✅            |
| role management                | ✅     | ❌     | ❌             | ✅            |
| cancellation policy            | ✅     | read  | ❌             | ✅            |
| billing config                 | ✅     | read  | ❌             | ✅            |
| profiles (entire organization) | ✅     | read  | self only     | ✅            |
| teachers                       | ✅     | full  | self only     | ✅            |
| parents                        | ✅     | full  | ❌             | ✅            |
| students                       | ✅     | full  | linked only*  | ✅            |
| relationships                  | ✅     | full  | read linked*  | ✅            |
| availability                   | ✅     | full  | self full     | ✅            |
| availability_overrides         | ✅     | full  | self full     | ✅            |
| lessons (read)                 | ✅     | full  | own only      | ✅            |
| lessons (update)               | ✅     | full  | status only** | ✅            |
| slot_locks                     | ✅     | ❌     | ❌             | ✅            |
| charges                        | ✅     | read  | ❌             | ✅            |
| leads                          | ✅     | full  | ❌             | ✅            |

---

## Exact Policy Definitions

### Teacher — "linked students"

A teacher can view students who have at least one lesson (`lessons`) with that same `teacher_id`.
This is not determined through a direct `relationships` link.

```sql
-- RLS policy: teacher reads students
CREATE POLICY "teacher_read_linked_students" ON students
  FOR SELECT USING (
    organization_id = auth.jwt()->>'org_id'
    AND id IN (
      SELECT student_id FROM lessons
      WHERE teacher_id = (
        SELECT id FROM teachers WHERE profile_id = auth.uid()
      )
    )
  );
```

### Teacher — "update lessons.status only"

A teacher can update only these fields on their own lessons:

* `status` (from `scheduled` to `completed` or `no_show` only)
* `cancel_reason` (only if `status` → `cancelled`, but cancellation itself runs through the service role)

A teacher **cannot** change:

* `teacher_id`
* `student_id`
* `start_at`
* `end_at`
* `organization_id`

```sql
-- RLS policy: teacher updates own lessons status
CREATE POLICY "teacher_update_own_lessons" ON lessons
  FOR UPDATE USING (
    organization_id = auth.jwt()->>'org_id'
    AND teacher_id = (
      SELECT id FROM teachers WHERE profile_id = auth.uid()
    )
  )
  WITH CHECK (
    -- prevent changing core fields
    teacher_id = (SELECT id FROM teachers WHERE profile_id = auth.uid())
    AND organization_id = auth.jwt()->>'org_id'
  );
```

### slot_locks — service role only

There is no RLS policy for dashboard users. Service role only.

```sql
-- Deny all non-service-role access
CREATE POLICY "slot_locks_service_only" ON slot_locks
  FOR ALL USING (false);
-- service role bypasses RLS automatically in Supabase
```

### Owner — full org scope

An owner can view and manage everything within their own `organization_id`.

```sql
-- Example: owner full access to lessons
CREATE POLICY "owner_full_lessons" ON lessons
  FOR ALL USING (
    organization_id = auth.jwt()->>'org_id'
    AND (
      SELECT role FROM profiles WHERE id = auth.uid()
    ) = 'owner'
  );
```

### Admin — operational access

Admin = everything the Owner can do, **except:**

* `organizations` (read only)
* `cancellation_policies` (read only)
* `profiles`: cannot modify roles
* cannot view integrations / billing config

---

## Required JWT Claims

Every dashboard user must have a JWT that includes:

```json
{
  "sub": "uuid",
  "org_id": "uuid",
  "role": "owner|admin|teacher"
}
```

Meaning:

* `sub` = `auth.uid()`
* `org_id` = `organization_id`

These claims are defined via Supabase Auth custom claims or a JWT hook.

---

## Booking JWT (WebView)

The JWT sent to the parent through WhatsApp is **not** a Supabase session.
It is a separate JWT signed on the server and contains:

```json
{
  "organizationId": "uuid",
  "parentId": "uuid",
  "studentId": "uuid",
  "exp": "unix timestamp (now + 15 min)"
}
```

The WebView validates this JWT in middleware / server action.
It is never passed to Supabase Auth at any stage.
