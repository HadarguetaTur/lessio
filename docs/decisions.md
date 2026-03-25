# LESSIO — Architectural Decisions (v4)

All decisions in this document are closed and final.
Do not revisit, improvise, or deviate from them without an explicit update to this document.

---

## 1. Lesson Duration — Source of Truth

✅ DECIDED (Sprint 1): Lesson duration is selected by the parent during booking inside the WebView.

Implications:
- The WebView includes a duration selection step before slot selection
- `slot_locks` and `lessons` store `start_at` + `end_at` (not a separate duration field)
- `getAvailableSlots()` requires `durationMinutes` as a mandatory parameter

---

## 2. Slot Granularity

✅ DECIDED (Sprint 1): Slots are calculated based on the selected lesson duration + organization-defined break time.

Formula: `next_slot_start = current_slot_start + lesson_duration + break_duration`

Field added to `organizations`:
```
break_duration_minutes int not null default 0
```

Example: 60-min lesson, 15-min break, window 16:00–20:00 → slots: 16:00, 17:15, 18:30

---

## 3. slot_lock — Status After Booking

✅ DECIDED (Sprint 1): status enum: `'active' | 'consumed' | 'expired'`

Rules:
- Created with `status = 'active'`
- After successful booking confirmation: `status = 'consumed'`
- After `expires_at` passes without confirmation: treated as expired in queries (no background job)
- Availability queries filter: `status = 'active' AND expires_at > now()` only

---

## 4. Unrecognized Parent on WhatsApp

✅ DECIDED (Sprint 1): Three things happen in parallel:
1. Create a `leads` record in the DB with the phone number
2. Send admin an alert in the dashboard (new lead)
3. Send the parent a fixed message: "Your number is not recognized in our system, please contact the business owner"

---

## 5. Teacher Selection in WebView

✅ DECIDED (Sprint 1): Parent always selects a teacher inside the WebView. No automatic assignment.

Implications:
- First step in the booking flow = list of active teachers in the organization
- JWT contains: `organizationId`, `parentId`, `studentId` only — `teacherId` is never in the JWT
- WebView flow order: Teacher → Date → Duration → Slots → Confirm

---

## 6. Same-Day Booking

✅ DECIDED (Sprint 1): Controlled by organization setting — `min_booking_notice_hours`

Field added to `organizations`:
```
min_booking_notice_hours int not null default 0
```

Rule: Slots starting less than `min_booking_notice_hours` hours from now are not shown.
Default 0 = same-day booking allowed.

---

## 7. teacher.profile_id

✅ DECIDED (Sprint 1): Always `not null`. Every teacher must be a dashboard user.

---

## 8. Phone Normalization

✅ DECIDED (Sprint 1): E.164 format only — `+972XXXXXXXXX`

Normalization rules:
- `05XXXXXXXX` → `+9725XXXXXXXX`
- `9725XXXXXXXX` → `+9725XXXXXXXX`
- `+9725XXXXXXXX` → no change
- Numbers that cannot be normalized → rejected with an error, not saved

Rule: Normalization must happen before every DB write and every lookup.
One central utility function (`normalizePhone`), never inlined.

---

## 9. Organization Timezone

✅ DECIDED (Sprint 1): `timezone text not null default 'Asia/Jerusalem'` on `organizations`.

All datetimes stored in DB as UTC. All display and availability calculations use the organization's timezone.

---

## 10. Billing Parent

✅ DECIDED (Sprint 1): Charge goes to the `is_primary = true` parent from `relationships`, at lesson creation time.

Rule: If a student has no primary parent → blocker error. Lesson is not created.

---

## 11. Billing Format

✅ DECIDED (Sprint 3): Monthly billing based on per-lesson price (`hourly_rate`).

Field added to `teachers`:
```
hourly_rate numeric(10,2)
```

Migration required at the start of Sprint 3.
`amount = hourly_rate * (duration_minutes / 60)`

---

## 12. Teacher Creation Flow

✅ DECIDED (Sprint 2): Invite flow only.

Process:
1. Owner sends a Supabase Auth invite to the teacher's email
2. Teacher registers via the invite link
3. Owner links the created profile to the teacher record

No direct user creation by owner/admin.

---

## 13. "Cancelled" in Sprint 2 — No Billing

✅ DECIDED (Sprint 2): "cancelled" in Sprint 2 = status change only.

No charges, no billing logic, no side effects.
Sprint 3 handles all cancellation and billing logic.

---

## 14. WhatsApp Cancellation Timeout

✅ DECIDED (Sprint 4): Timeout = 10 minutes.

Rules:
- Invalid input → error message + return to list (not flow termination)
- Flow closes only on timeout, successful cancellation, or no eligible lessons

State machine:

| State | Parent Input | Response | Next State |
|---|---|---|---|
| idle | cancel keyword + eligible lessons | Numbered lesson list | awaiting_selection |
| idle | cancel keyword + no eligible lessons | Message: no lessons to cancel | idle |
| awaiting_selection | Valid number (1–N) | Cancellation confirmed + charge calc | done |
| awaiting_selection | Invalid number | Error + return to list | awaiting_selection |
| awaiting_selection | Lesson no longer eligible | Error + return to list | awaiting_selection |
| awaiting_selection | Timeout (10 min) | Flow closed | idle |

---

## 15. Sprint 5 Teacher Access Surface

✅ DECIDED (Sprint 5): Teacher access in the dashboard is intentionally narrow.

Allowed:

* view own schedule only
* open own lesson detail entry points
* update own lesson outcome to `completed` or `no_show` only

Not allowed:

* other teachers' lessons
* people management
* billing or charges
* cancellation logic
* arbitrary lesson field mutation

---

## 16. Trusted Auth Context for org_id and teacher_id

✅ DECIDED (Sprint 5): `org_id` and acting `teacher_id` are derived from trusted auth/profile context only.

Rules:

* never trust `org_id` from request body or client input
* never trust `teacher_id` from request body or client input
* server actions must resolve teacher scope from the authenticated profile mapping

---

## 17. Wrong-Org Access Behavior

✅ DECIDED (Sprint 5): When a valid resource exists in another organization, the system returns `403`, not `404`.

Reason:

* Sprint 5 explicitly validates org isolation behavior
* authorization failures must not be silently reclassified as "not found"

---

## 18. Sprint 5 Regression Boundary

✅ DECIDED (Sprint 5): Teacher outcome updates must preserve existing approved business behavior.

Rules:

* marking `completed` must continue to trigger the existing Sprint 3 charge flow
* marking `no_show` must follow existing approved behavior only
* Sprint 5 does not redefine billing rules, cancellation policy rules, booking flow, or Sprint 4 WhatsApp logic

---

## 19. Sprint 6 Scope Boundary

✅ DECIDED (Sprint 6): Sprint 6 is for production readiness only.

Rules:

* no new product features
* no role expansion
* no large redesigns
* changes must be limited to audit, hardening, verification, release readiness, and narrow regression fixes only

---

## 20. Server-Only Secret Boundary

✅ DECIDED (Sprint 6): privileged secrets remain server-only and may not cross into client bundles.

Rules:

* `SUPABASE_SERVICE_ROLE_KEY` must never appear in a client bundle or client component
* `BOOKING_JWT_SECRET` must never appear in a client bundle or client component
* service-role access is isolated to `src/lib/supabase/service-role.ts`

---

## 21. Startup Environment Validation

✅ DECIDED (Sprint 6): required env vars are validated at startup, not lazily discovered at runtime.

Rules:

* missing required env vars fail fast
* crash errors must be named and actionable
* committed example env files must stay safe and secret-free

---

## 22. Webhook Signature Enforcement

✅ DECIDED (Sprint 6): WhatsApp webhook verification is mandatory.

Rules:

* requests without valid `X-Hub-Signature-256` return `401`
* signature validation happens before trusted webhook processing
* signature hardening may not change approved Sprint 4 business outcomes beyond rejecting invalid requests

---

## 23. Structured Logging for Critical Flows

✅ DECIDED (Sprint 6): critical operational flows must emit structured logs sufficient for diagnosis and manual recovery.

Rules:

* include `org_id` when available
* include relevant entity identifiers when available
* log failure reason and execution step for operationally important errors
* external failures such as `WhatsApp API` issues must be caught and logged rather than crashing the system

---

## 24. Staging-First Release Gate

✅ DECIDED (Sprint 6): production release is blocked until staging validation and operational docs are complete.

Rules:

* all Sprint 6 smoke tests run on staging, not local only
* Data Recovery Playbook must exist before go-live sign-off
* release checklist must exist before production deployment
* first-customer onboarding must be documented before pilot launch

---

## 25. External User Access Channel

✅ DECIDED (Post-launch planning): parents and students remain external users, not dashboard-auth users, in the first SaaS expansion phase.

Rules:

* dashboard auth remains for internal staff only
* parents and students primarily interact through official WhatsApp flows and signed links
* a full parent or student portal is explicitly deferred beyond the first post-launch expansion phase

---

## 26. WhatsApp Bot Architecture

✅ DECIDED (Post-launch planning): the official WhatsApp bot uses deterministic intent routing plus explicit state machines, not free-form AI as the source of truth.

Rules:

* operational actions such as booking, cancellation, payment lookup, and homework lookup run through named flows
* every flow step must resolve organization scope and actor identity before side effects
* conversational AI may assist with classification later, but it does not replace rule-based execution in the initial SaaS phase

---

## 27. Teacher Google Calendar Sync

✅ DECIDED (Post-launch planning): the first calendar sync phase is one-way from LESSIO to Google Calendar.

Rules:

* each teacher connects their own Google account through an organization-approved OAuth flow
* scheduled, updated, and cancelled lessons are mirrored to Google Calendar
* Google Calendar events do not change LESSIO availability in phase 1
* inbound busy-time sync is a later enhancement, not part of the first calendar phase

---

## 28. Integration Hub Shape

✅ DECIDED (Post-launch planning): external integrations are implemented through provider adapters plus organization-scoped integration configuration.

Rules:

* billing, payment, calendar, and automation providers are accessed through narrow adapter interfaces
* each organization enables and configures integrations independently
* outbound webhooks are the first automation mechanism for `Make` and similar tools
* an internal visual automation builder is out of scope for the first integration phase

---

## 29. Homework Domain Boundary

✅ DECIDED (Post-launch planning): homework is a separate domain, not a free-form note field on lessons.

Rules:

* reusable homework content lives in templates
* assignments are created from templates or ad-hoc content and linked to students
* due dates, assignment status, and reminder delivery are first-class data
* rich submission workflows, grading automation, and complex file handling are deferred

---

## 30. Tenant-Owned Channel and Integration Credentials

✅ DECIDED (Post-launch planning): every organization owns its own channel and integration credentials.

Rules:

* WhatsApp, payment, calendar, and webhook credentials are always scoped to one `organization_id`
* credentials remain server-side only and must never be exposed to client bundles
* operational logs and integration deliveries must include tenant context for diagnosis and recovery

---

## Schema Changes Summary by Sprint

| Sprint | Table | Change | Status |
|---|---|---|---|
| 1 ✅ | organizations | + timezone, + break_duration_minutes, + min_booking_notice_hours | Done |
| 1 ✅ | teachers | profile_id → not null | Done |
| 1 ✅ | slot_locks | + status enum (active/consumed/expired) | Done |
| 1 ✅ | leads | new table | Done |
| 3 ✅ | teachers | + hourly_rate numeric(10,2) — MIGRATION REQUIRED | Done |
| 6 ⏳ | schema baseline | No new domain schema required for production-readiness baseline | Planned |
| 7-9 planned | platform expansion | Tenant config, bot state, calendar sync, homework, integrations | Planned |