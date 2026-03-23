# LESSIO — Security & RLS Specification (v1)

## Core Rules

* All tables have RLS enabled
* All access is filtered by `organization_id` — no access to another organization’s data
* Booking operations (writes to `slot_locks`, `lessons`) are service-role only, server-side
* WhatsApp webhook processing is server-side only and uses the service role for trusted writes
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
| lead conversion (server action) | ✅    | ✅     | ❌             | ✅            |
| payment request send (server action) | ✅ | ✅   | ❌             | ✅            |

---

## Sprint 4 Operational Flows

### WhatsApp webhook

The WhatsApp webhook is a trusted server entry point under `src/app/api/whatsapp/webhook/`.

Rules:

* It never relies on client-side authorization.
* It uses the service role for organization-scoped lookups and writes.
* Unknown sender → create or deduplicate a `leads` record by normalized phone.
* Known parent → continue only within that parent's organization scope.
* Cancellation execution and any resulting charge write remain server-side only.

### Lead conversion

Lead conversion is an owner/admin server action, not a client-trusted mutation.

Rules:

* The acting dashboard user must be authenticated.
* The server must verify `app_role in ('owner', 'admin')` before converting.
* The server must validate org scope and all input with Zod before writing.
* Conversion creates `parent`, `student`, and `relationship` records inside the same `organization_id`.
* If the phone already belongs to a `parent`, conversion is blocked server-side.

### Payment request send

Payment request sending is also an owner/admin server action.

Rules:

* The acting dashboard user must be authenticated.
* The server must verify `app_role in ('owner', 'admin')` before sending.
* The server may read pending charges in org scope and update only send metadata for the included rows.
* This does not grant admins broad direct write access to arbitrary `charges` fields.
* Send metadata must record at minimum `sent_at` and sender identity.

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
  "app_role": "owner|admin|teacher"
}
```

Meaning:

* `sub` = `auth.uid()`
* `org_id` = `organization_id`
* `app_role` = LESSIO business role used by RLS (`owner` / `admin` / `teacher`)

Important:

* Supabase's reserved top-level `role` claim must remain `authenticated`
* LESSIO role-based policies must read the custom `app_role` claim instead

These claims are defined via the Supabase Auth JWT hook.

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
