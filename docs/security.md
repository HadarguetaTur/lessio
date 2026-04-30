# LESSIO — Security & RLS Specification (v3)

## Core Rules

* All tables have RLS enabled.
* All tenant-scoped access is filtered by `organization_id`.
* Valid resources from another organization must return `403`, not `404`.
* `organization_id` for dashboard authorization comes from trusted auth context, never request body.
* `teacher_id` for teacher-scoped access comes from trusted auth/profile context, never client input.
* All dashboard mutations must validate input server-side with Zod before writing.
* Booking operations (`slot_locks`, booking-created `lessons`) are service-role only, server-side.
* WhatsApp webhook processing is server-side only and uses the service role for trusted writes.
* Parents and students are not Supabase Auth users. Their access is handled in application code, not through dashboard auth.
* `SUPABASE_SERVICE_ROLE_KEY` and `BOOKING_JWT_SECRET` are server-only secrets and must never appear in client bundles.
* Service-role access is isolated to `src/lib/supabase/service-role.ts`.
* Required env vars are validated at startup; missing required values fail fast with named errors.
* WhatsApp webhook requests without valid `X-Hub-Signature-256` must return `401` before trusted processing begins.
* Critical operational flows must emit structured logs with `org_id` and relevant entity IDs when available.
* Sprint 6 does not expand any approved role permissions from Sprint 5.

---

## Permissions Matrix

| Action | Owner | Admin | Teacher | Service Role |
|---|---|---|---|---|
| org settings (read/write) | ✅ | ❌ | ❌ | ✅ |
| integrations | ✅ | ❌ | ❌ | ✅ |
| role management | ✅ | ❌ | ❌ | ✅ |
| cancellation policy | ✅ | read | ❌ | ✅ |
| billing config | ✅ | read | ❌ | ✅ |
| profiles | ✅ | read (org) | self only | ✅ |
| teachers | ✅ | full | self read only | ✅ |
| parents | ✅ | full | ❌ | ✅ |
| students | ✅ | full | lesson context only | ✅ |
| relationships | ✅ | full | ❌ | ✅ |
| availability | ✅ | full | ❌ | ✅ |
| availability_overrides | ✅ | full | ❌ | ✅ |
| lessons (read) | ✅ | full | own only | ✅ |
| lessons (update) | ✅ | full | own outcome only (`completed` / `no_show`) | ✅ |
| lesson cancellation action | ✅ | ✅ | ❌ | ✅ |
| charges | ✅ | read | ❌ | ✅ |
| leads | ✅ | full | ❌ | ✅ |
| lead conversion (server action) | ✅ | ✅ | ❌ | ✅ |
| payment request send (server action) | ✅ | ✅ | ❌ | ✅ |
| slot_locks | ❌ | ❌ | ❌ | ✅ |

Notes:

* "lesson context only" means a teacher may see the student name/details embedded in their own lesson view, but this does not grant people-management access.
* Teacher availability self-management is not in Sprint 5 scope and must not be exposed without an explicit scope update.

---

## Production Readiness Requirements (Sprint 6)

### Secrets and bundle exposure

Rules:

* `SUPABASE_SERVICE_ROLE_KEY` must remain server-only
* `BOOKING_JWT_SECRET` must remain server-only
* privileged imports must not leak into client components, client hooks, or client bundles
* secret handling must be verified by audit, not assumed

### Environment validation

Rules:

* required env vars are validated on startup
* failures must be explicit and actionable
* `.env.example` stays safe and contains no real secrets
* environment separation (`dev`, `staging`, `prod`) is documented and enforced operationally

### Structured logging and graceful failures

Rules:

* critical flows log the execution step and failure reason
* logs include `org_id` and relevant entity identifiers when available
* `WhatsApp API` and charge-write failures must be caught and logged
* logging must improve diagnosis without changing approved product behavior

### Release gate

Rules:

* staging validation is required before production release
* Data Recovery Playbook must exist before go-live sign-off
* release readiness is blocked if env validation, signature verification, or critical smoke tests are missing

---

## Cross-Sprint Operational Flows

### WhatsApp webhook

The WhatsApp webhook is a trusted server entry point under `src/app/api/whatsapp/webhook/`.

Rules:

* It never relies on client-side authorization.
* It uses the service role for organization-scoped lookups and writes.
* It validates `X-Hub-Signature-256` before trusted processing; invalid or missing signatures return `401`.
* Unknown sender creates or deduplicates a `leads` record by normalized phone.
* Known parent continues only within that parent's organization scope.
* Cancellation execution and any resulting charge write remain server-side only.
* Failures are caught and logged with actionable context instead of crashing the process.

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

### Teacher lesson outcome update

Teacher lesson updates are a Sprint 5 server action surface.

Rules:

* The acting dashboard user must be authenticated and have `app_role = teacher`.
* The server must derive the acting `teacher_id` from the authenticated profile mapping.
* The server must derive `org_id` from trusted auth context, never request body.
* The teacher may update only their own lessons.
* The only allowed target statuses are `completed` and `no_show`.
* Teacher access to cancellation, billing, charge writes, people management, or arbitrary lesson field mutation is forbidden.
* Manually crafted requests must still fail server-side.

---

## Authorization Principles for Sprint 5 Baseline

### Teacher access surface

Sprint 5 teacher access is intentionally narrow:

* own schedule only
* own lesson detail entry only
* own lesson outcome update only

Teacher access explicitly excludes:

* other teachers' lessons
* people management
* billing and charges
* cancellation logic
* arbitrary lesson field mutation

Sprint 6 rule:

* production-readiness work must preserve this access surface and must not expand it

### Route guards and resource loading

Rules:

* Route guards must enforce owner/admin/teacher access before rendering protected pages.
* Resource lookups must first determine whether the resource exists in another org and return `403` when access is forbidden.
* Do not hide org isolation failures behind a generic `404`.

### Server action hardening

Rules:

* Every admin or teacher mutation must validate auth, role, org scope, and input server-side.
* Mutations must whitelist allowed fields instead of trusting submitted objects.
* `teacher_id`, `student_id`, `start_at`, `end_at`, and `organization_id` are never teacher-writable.

---

## Exact Policy Definitions

### Teacher — view own lessons only

Teacher lesson visibility is based on row ownership in `lessons`.

```sql
-- RLS policy: teacher reads own lessons
CREATE POLICY "teacher_read_own_lessons" ON lessons
  FOR SELECT USING (
    organization_id = auth.jwt()->>'org_id'
    AND teacher_id = (
      SELECT id FROM teachers WHERE profile_id = auth.uid()
    )
  );
```

### Teacher — update own lesson outcome only

Teacher updates must satisfy two layers:

* RLS enforces row ownership and org scope.
* Server actions enforce the allowed status whitelist: `completed`, `no_show`.

Teacher cannot change:

* `teacher_id`
* `student_id`
* `start_at`
* `end_at`
* `organization_id`
* `status = cancelled`
* any billing or charge fields

```sql
-- RLS policy: teacher updates own lesson rows only
CREATE POLICY "teacher_update_own_lessons" ON lessons
  FOR UPDATE USING (
    organization_id = auth.jwt()->>'org_id'
    AND teacher_id = (
      SELECT id FROM teachers WHERE profile_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id = auth.jwt()->>'org_id'
    AND teacher_id = (
      SELECT id FROM teachers WHERE profile_id = auth.uid()
    )
  );
```

Important:

* RLS alone is not enough to enforce `completed` / `no_show` only.
* The status whitelist must also be enforced in the server action or RPC layer.

### Teacher — no direct people-management access

Teacher-facing lesson detail may join student name or basic lesson display data.
This does not grant direct dashboard access to `students`, `parents`, or `relationships` management surfaces.

### slot_locks — service role only

There is no dashboard-user RLS policy for `slot_locks`.

```sql
-- Deny all non-service-role access
CREATE POLICY "slot_locks_service_only" ON slot_locks
  FOR ALL USING (false);
-- service role bypasses RLS automatically in Supabase
```

### Owner — full org scope

Owner can view and manage everything within their own `organization_id`.

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

Admin = operational access within the org, except:

* `organizations` write access
* `cancellation_policies` write access
* role management
* integrations / billing config

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
* `org_id` = tenant scope used by RLS and server authorization
* `app_role` = LESSIO business role used by RLS (`owner` / `admin` / `teacher`)

Important:

* Supabase's reserved top-level `role` claim must remain `authenticated`.
* LESSIO role-based policies must read the custom `app_role` claim instead.

These claims are defined via the Supabase Auth JWT hook.

---

## Booking JWT (WebView)

The JWT sent to the parent through WhatsApp is not a Supabase session.
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
