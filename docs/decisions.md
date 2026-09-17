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

🔄 AMENDED (2026-09-01): the formula above is unchanged. Two things were added.

**1. The break is now a real gap, not only a stride.** The stride decided how far
apart *offered* slots sat, but the overlap test used strict inequalities, so a slot
could still be offered starting the exact instant an existing lesson ended — the
teacher was handed a back-to-back pair by the system that was supposed to be
spacing them out. Parent-facing generation (`getAvailableSlots`) and the lock
re-check (`createSlotLock`) now widen lessons and active locks by the break on
both sides.

Blocked ranges and window edges are deliberately *not* widened: those say when the
teacher is absent, not busy, so no recovery gap is owed. This is also what keeps
the cadence property that a block bisecting a window does not shift the rest of
the day.

**2. The break is two-level.** `teachers.break_duration_minutes` overrides
`organizations.break_duration_minutes`; NULL inherits. NULL and 0 are different
answers — 0 is a teacher who teaches back-to-back and must survive the business
raising its default.

**Who it binds:** parents and the bot can never be offered a slot that breaks it.
A teacher or admin creating a lesson by hand gets an advisory warning and may
proceed — they are the one who will teach it. `confirmBooking` deliberately does
not re-check the break: once a parent holds a lock, failing the final step over a
preference the teacher themselves just overrode is the wrong trade. Real overlap
is still guarded there and by `no_teacher_lesson_overlap`.

`createSeries` is not break-aware. Known gap.

The org default is now editable by the owner at `/settings/scheduling`; before
this it existed only in the superadmin console.

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

🔄 AMENDED (Sprint 31 Story 7): "unrecognized" now means the phone matches **nobody** in the
org — not merely "no `parents` row". Until this amendment the webhook resolved every inbound
phone against `parents` alone, so a teacher, an owner, or a student writing in was filed as a
sales lead in their own org's CRM. The lead path above is unchanged; it is simply reached only
by a genuine stranger. See decision #26 for how the actor is resolved.

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

🔄 AMENDED (2026-09-01): editable by the owner at `/settings/scheduling`. It was
previously reachable only from the superadmin console, so the setting existed but
no customer could use it.

Known deviation from the rule as written: `getAvailableSlots` compares the slot's
**end** against the horizon, not its start, so a 60-minute lesson with a 60-hour
notice is offered from 59 hours out. Left as-is — correcting it changes the slots
offered by every org that uses notice, which is a separate decision.

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

### Actor identity (Sprint 31 Story 7)

"Actor identity" above was half-implemented for a long time: org scope was resolved from
`phone_number_id`, but identity was only ever a `parents` lookup. `resolveSender(orgId, phone)`
in `src/lib/whatsapp/sender.ts` now resolves one of four capacities, or `unknown`.

Rules:

* an inbound phone resolves to `parent`, `student`, `teacher`, `staff` (owner/admin), or `unknown`
* only `unknown` reaches the lead path (decision #4)
* each capacity has its own closed menu — `ROLE_MENUS` in `src/lib/whatsapp/menu.ts`. Reply ids
  are client-supplied, so the sender's capacity is re-checked against that list before any action
  runs; a student echoing back `m:balance` is refused
* **students** get their own schedule and homework only. Money and cancellations are not a child's
  to act on, and the portal is a parent portal with no student login path
* **teachers and staff are read-only over WhatsApp.** WhatsApp has no real confirmation step and a
  mistyped reply on a write path would move a parent's charge. Attendance stays in the dashboard
* the AI assistant stays parent-only — its system prompt is built from parent context. Other
  capacities fall through to their menu, never to a parent-shaped AI answer
* precedence on a phone holding several capacities is `parent > student > teacher > staff`. Parent
  first is load-bearing: it preserves the reply a teacher-who-is-also-a-parent already got. An
  explicit choice via the bot's "switch role" row is stored in `whatsapp_sender_preference` and
  overrides it, but only while that identity is still active
* a teacher's or owner's phone lives on `profiles.phone` and must be normalized to E.164 on write
  like every other phone (decision #8) — an un-normalized number simply never matches

### Amendment 2026-08-30 — owner/admin WhatsApp copilot, whitelisted confirmed writes

This subsection amends the earlier read-only statement for staff. Staff are still read-only by default,
but the org owner and admin may use a whitelisted, two-phase confirmation flow over WhatsApp for
business operations that are explicitly safe to run, without ever allowing teachers to do the same.

Rules:

* the owner/admin WhatsApp copilot is staff-only and never available to teachers
* the AI only classifies the request; it never executes a write itself
* each write action runs through a deterministic registry and requires an explicit confirm/cancel tap
* the first whitelist is debt reminders: one parent or all debtors, both gated by the same confirm step
* the support flow already established the real two-phase pattern (`sup:send` / `sup:cancel` in
  `src/app/api/whatsapp/webhook/handlers/staff.ts`), so the earlier claim that "WhatsApp has no
  confirmation step" no longer holds for this bounded staff workflow
* per #26, AI assistance is allowed for classification as long as rule-based execution remains the
  source of truth; the classifier + registry design implements that rule directly

This does not reopen the broader teacher-write policy. Teachers remain read-only in WhatsApp unless a
separate, explicitly scoped feature is added with the same two-phase confirm model and role gating.

### Amendment 2026-09-03 — copilot generalised to a per-action registry with server-stored proposals

The debt-reminder whitelist above is now the first entry in a generic action registry
(`src/lib/ai-assistant/copilotActions/`), built to grow into a staff "secretary" (availability,
lessons, students) without changing the pipeline. The 2026-08-30 rules all still hold; this
amendment adds the mechanics that let the whitelist grow safely:

* the AI still only classifies — it returns `{action, params}` against a closed action list, and may
  additionally fill missing params across turns when a proposal is pending. Execution is always a
  deterministic `CopilotActionDef.execute` behind an explicit confirm tap
* a proposal lives in `copilot_sessions`, not in the button: reply ids carry only a session id
  (`cp:c:/cp:x:/cp:p:` in `src/lib/whatsapp/copilotPayloads.ts`), so a stale or forged button can
  never replay params. Finished rows are retained as the audit trail of proposed → confirmed → result
* execution re-validates at tap time: params re-parsed against the action's strict schema, entities
  re-resolved org-scoped, `assertOrgNotSaasReadOnly` as the webhook-side `requireMutation`
  equivalent, and a guarded status claim makes a double-tap run nothing twice
* the staff copilot is capped at `OWNER_COPILOT_DAILY_CAP` provider calls per actor phone per day,
  counted via `ai_usage_log.source = 'owner_copilot'`
* teachers remain read-only over WhatsApp (day-off flow unchanged)

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

Implementation status (Sprint 33 M1): org-scoped API keys, `/api/v1`, and the `make`
payment provider are shipped. Outbound webhooks are M2 — see `docs/sprint-33-scope.md`.

Two rules the first phase added:

* an org API key is stored as a sha256 digest, never encrypted — it is minted by us and only ever needs to be recognised again, so a database leak must not hand out working keys
* nothing under `/api/v1` may call `getSession()` or `requireFeature()`: both answer failure with `redirect()`, which an automation follows and reports as a success. Use `assertFeature()`, which throws

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

## 31. Subscription Coverage Is an Org Setting

✅ DECIDED (Aug 2026): what a subscription covers is per-organization configuration, not a constant in the pricing module.

Rules:

* the covered set lives in one array column, `organizations.subscription_covered_lesson_types` (default `{pair,group,custom}`, so existing orgs keep the previous behaviour), not one boolean per lesson type — a new lesson type must not require a schema migration
* it is read through the existing `getOrgPricing` / `OrgPricing` struct, which is already threaded to every billing call site, rather than a second getter that would add a query per site
* every path that prices attendance applies it through `isLessonCoveredBySubscription`: the monthly engine, the cancellation contribution, and the real-time `createLessonCharge`. A path that prices a lesson without consulting coverage is a double-charge bug
* honouring coverage in the real-time path is forward-only. Charge rows already written for covered lessons are money records and are not deleted by the code change; correcting them is a separate, human-reviewed decision

---

## 32. One Template Body per (Type, Language), and the Symbol Is Not in It

✅ DECIDED (Aug 2026): a WhatsApp message type has exactly one editable body per
language, and every send path resolves it. The trigger was `payment_request`, which had
grown four different bodies — the settings template, a private string table in
`payment-request/index.ts`, and the Meta `_v2` and `_v3` registrations — so an owner's
edit reached one of four paths and the settings preview could not be truthful about any
of them.

Rules:

* no send path composes its own message body. Anything dynamic becomes a template
  variable built from `botString` fragments (`{{charge_lines}}`, `{{lesson_lines}}`),
  never a second copy of the surrounding words
* `{{amount}}` and `{{total}}` arrive **already formatted** for the org's currency and
  the recipient's locale (`formatBotMoney`). No template body contains a literal `₪`
* a body whose URL line can be lifted into a CTA button must still read correctly with
  that line removed — introduce the link with a full sentence, never a label ending in
  `:` or `👇`. Otherwise the parent sees an orphan label directly above a button saying
  the same words. Enforced by `templateCopy.test.ts`
* strip the URL line from the **raw** template, then substitute. Substituting first
  removes the `{{placeholder}}` the stripper matches on, which is how parents came to
  receive the link twice — once as text and once as the button
* Meta-approved copy is never edited in place; an edit resets the template to PENDING at
  Meta and blocks every out-of-window send. New copy ships under a new name. `_v4`
  therefore exists alongside `_v3` purely to drop the hardcoded `₪`, and the senders
  switch to it per-org only once `whatsapp_template_statuses` reports it APPROVED — the
  two take differently-shaped amount parameters, so the template and its parameters are
  always chosen together
* the settings preview runs the same pipeline as the send (same strip, same label
  truncation) and renders the out-of-window body as a second bubble. A preview that
  *cannot* disagree with the send is the point; prose explaining the difference is not a
  substitute

---

## 33. Billing Mode Is a Financial-Integrity Boundary

✅ DECIDED (Sep 2026): an organization's billing mode selects exactly one
ledger path for a billable activity. It is not display metadata.

Rules:

* `per_lesson` creates lesson/cancellation charges in real time and cannot run
  the monthly charge generator
* `monthly` records lessons and cancellation events as source data only; the
  sole payment demand is the approved `monthly` charge
* monthly approval must fail when an overlapping lesson or cancellation charge
  already exists; financial rows are never silently deleted to make approval pass
* final monthly bills include completed lessons, not scheduled lessons; scheduled
  lessons belong to forecasting only
* each org sets `billing_cycle_start_day` (1–28) and `billing_due_days`; monthly
  records snapshot inclusive `period_start` / `period_end`, so a later settings
  change cannot reinterpret an existing period
* changing billing mode is blocked while open charges from the old model remain
* parent-facing monthly charges show the captured period, not an assumed calendar month

## 34. SaaS Renewal Is Self-Managed Through Sumit

✅ DECIDED (Sep 2026): Lessio charges its own customers on its own schedule.
Sumit is a payment rail and a document issuer, not the system of record for a
subscription. A Sumit standing order would put the retry policy, the price and
the plan-change behaviour inside a vendor UI where none of it can be tested.

Rules:

* renewals are charged by `/api/internal/saas/renew` (Next.js, pg_cron-triggered)
  against the card token Sumit stored at checkout — not by a Sumit recurring
  charge. The route runs in Next.js, not as an Edge Function, because that
  runtime already owns the Sumit adapter, the email templates and the
  activation path; the precedent is `automatic-lesson-completion`
* a declined card is retried at period end + 0 / 3 / 7 days, then the
  subscription stays `past_due` and the existing 7-day grace turns it
  `read_only`. Only a decline consumes an attempt: a technical failure
  (outage, malformed response, HTTP error) is retried without counting
* the new period runs from the previous `current_period_end`, never from the
  day the charge cleared — a card that clears three days late does not buy
  three free days
* renewals claim their rows through `claim_saas_renewals`, which stamps a lease
  in the same statement that selects them, so two overlapping runs can never
  charge the same subscription

A payment may activate a subscription only when **all** of these hold. They are
evaluated in `evaluateCheckoutBinding`, against what Sumit reports about the
payment — never against the redirect query, which the customer can edit:

* the `OG-ExternalIdentifier` equals the `pending_checkout_reference` we
  generated and stored for that org
* the Sumit payment id has not already paid for something (unique index on
  `saas_invoices.sumit_payment_id` for paid rows)
* the payment is not dated before the checkout started, allowing four hours of
  skew because Sumit's `Payment.Date` carries no documented offset
* the Sumit customer matches the one already on the org, when there is one
* the amount covers the plan price for the stored interval, within rounding

A payment that fails these is recorded as a `failed` invoice row and raised to
the superadmins. It is never silently discarded: money may have moved.

Related:

* **the webhook is not authoritative.** Sumit’s hosted checkout has no IPN,
  so `/api/sumit/webhook` can only ever be a Sumit UI trigger with an
  unguaranteed payload. It is a latency optimisation; the daily reconciliation
  in the renewal cron is the real safety net for a customer who closed the tab
* **a lapsed org keeps its data.** Trial over, grace exhausted or cancelled
  makes the org read-only, not locked out: reading, exporting, support and
  billing stay reachable, and only the working surfaces redirect. Writes are
  refused centrally in `requireMutation`, so a new action is covered by
  default and the failure mode of forgetting a guard is "blocked", not
  "free product"
* **owners are told before it happens** — email at T-7 / T-3 / T-1 / T0 of a
  trial, three days before a renewal, and on every declined charge. Email, not
  WhatsApp: the existing WhatsApp reminder needs the org’s own connected
  number, which a trialling org usually does not have

---

## 35. What the Parent Portal Offers Is an Org Setting

✅ DECIDED (Sep 2026): what parents can see and do in the portal is
per-organization configuration, not a property of the product. A school that is
not ready to take payments online, or that does not use homework, opens the
portal without them rather than not at all.

Rules:

* the toggles live in one jsonb column, `organizations.portal_settings`, not one
  boolean per feature — a new portal section must not require a schema
  migration. Same shape and reasoning as Decision #31
* a missing key means **on**. That is what makes the column backward-compatible
  with every org that predates it, and what makes a newly shipped section
  visible by default instead of silently switched off for everyone
* the master switch (`enabled`) is enforced in the portal **layout**, like
  `service_state` before it, so a parent already holding a session cookie is
  stopped too — a check that only runs at login leaves a week-long hole
* every section is gated in **both** its page and its server actions:
  `requirePortalFeature` redirects (pages), `isPortalFeatureEnabled` returns a
  value (actions). Hiding a tab is not enforcement — the URL and the
  already-open form both survive the toggle flipping
* the toggles govern the **portal**, not the bot. The WhatsApp assistant keeps
  answering about balances, schedules and cancellations regardless: closing the
  payments page is a statement about a web page, not about whether a parent may
  ask what they owe. The one thing that must follow is the links — the bot never
  sends a parent to a portal page their org has closed
* home and the schedule have no toggle. A portal without them is not a smaller
  portal, it is a closed one, and that is what the master switch says

---

## 36. Google Calendar Busy Is Hard for Parents, Soft for Staff

✅ DECIDED (Sep 2026): an org's connected Google Calendar is an **org-wide
blackout** — its busy periods apply to every teacher (studio closed, staff
meeting). A teacher's connected calendar is **that teacher's personal busy
time**. Effective external busy is the union of both; the earlier "org first,
then teacher" phrasing described query order, not precedence, and precedence
does not exist — either calendar being busy blocks the time.

Rules:

* parent-facing surfaces (the `/book` WebView the bot links to, and the portal)
  treat external busy as **hard**: `getAvailableSlots` never offers a busy slot,
  and `createSlotLock` re-checks freeBusy before inserting the lock. The
  dashboard keeps its soft-confirm dialog — staff may knowingly book over a
  calendar event; a parent may never do so unknowingly
* **fail-open everywhere in the parent flow**: a Google API failure is logged
  and read as "no busy". A Google outage closing the booking book for every org
  costs more than the rare double-booking it might let through, and the
  teacher-overlap exclusion constraint still protects lesson-vs-lesson integrity
* calendar busy intervals are **not break-widened**, same as ranged blocks: they
  say when the teacher is *elsewhere*, not that a lesson needs a recovery gap.
  Widening would also let one event on the org calendar eat 2×break out of every
  teacher's day
* the write path checks Google exactly once, at **lock time**. `confirmBooking`
  does not re-check; an external event created inside the five-minute lock
  window losing to the booking is an accepted race
* a connection made without the calendar checkbox ticked on Google's granular
  consent screen is **rejected at the callback** (`?error=scope`) instead of
  stored — a stored token that cannot read freeBusy shows "connected" while
  every check silently passes
* teacher selection follows the assignment: a student with `students.teacher_id`
  set is offered that teacher only, and the picker step auto-skips a
  single-entry list; an unassigned student (or one whose assigned teacher was
  deactivated) still sees every active teacher
* no caching yet: each listing pays up to two extra HTTP round-trips (token
  refresh + freeBusy per connected level), fetched once per week-summary rather
  than per day. Future work: access-token reuse and a DB TTL cache per the
  `whatsapp_usage_cache` pattern

## 37. Lessio Does Not Issue Tax Documents Itself

**Decision (2026-09-05, Hadar):** Lessio computes what is owed and runs
collections; it never generates tax documents (חשבונית מס, חשבונית זיכוי) of
its own. Documents come from exactly two places: the external licensed receipt
providers behind `src/lib/receipts/` (Green Invoice, iCount — the org's choice),
or the customer's own accounting system entirely outside the product (e.g. Raz
invoices through Grow).

The Sprint-27 internal PDF generator (`src/lib/billing/invoices/`, the
`invoice_counters` table, the `invoices` bucket, the חשבונית column and
credit-note dialog, and the accounting CSV export built on them) was removed.

**Why:**

* Issuing tax documents in Israel is a licensed domain: only an עוסק מורשה may
  issue a tax invoice; software producing bookkeeping documents falls under
  הוראות ניהול פנקסים and Tax Authority software registration; digitally
  delivered documents require a certified digital signature; the חשבוניות
  ישראל reform requires allocation numbers. A naive PDF generator satisfies
  none of these and could expose customers legally.
* It was never used: the generator had failed silently on every approval since
  it shipped (two stacked bugs, found by UX audit 8), zero invoices were ever
  issued in production, and the one live customer invoices through Grow. Fixing
  the bug would have *started* issuing a second, independently numbered
  document series in parallel to customers' real books.

**Consequences:** a follow-up cleanup migration (run only after this code is
deployed — the pre-removal code joins `invoice_number` on /charges and breaks
on a missing column) drops `invoice_counters`, the nine invoice/credit-note
columns on `student_monthly_billing`, and the `invoices` bucket. The short-lived
`invoice_generation_enabled` opt-in migration was deleted before ever running
in production, so there is nothing of it to drop. `charges.document_type`, `organizations.receipt_document_type`,
`default_vat_rate` and `parents.tax_id` stay — they belong to the receipt
providers. Anything document-shaped that Lessio needs in the future goes through
a `ReceiptProvider`, never through in-product generation.

## 38. Collection Date and Billing Period Are Separate Facts

✅ DECIDED (Sep 2026): cash collection is reported by the date the money was
actually received, while the lesson or monthly-billing period continues to say
what the payment was for.

Rules:

* every manual payment flow asks for the date the money was received, defaulting
  to today; the server rejects future or malformed dates
* `charge_payments.paid_at` is the source of truth for cash collected by month;
  a late payment for an older lesson therefore belongs to the collection month
  in which the money arrived, without changing the lesson or billing period
* recording a payment later must not silently replace its real receipt date with
  the click time; provider payments keep using their provider/event timestamp
* the dashboard attention area is exception-driven: inactive buckets are omitted
  instead of staying visible as empty cards

## 39. The Plan Catalog Is Solo / Studio / Bespoke Center, Priced by Teacher Seats

✅ DECIDED (06 Sep 2026): after an end-to-end audit of every pricing surface
(landing page, Terms table, onboarding picker, /account/billing upgrade panel,
/admin/plans), the catalog is final:

| plan | he | monthly | yearly | teachers |
|---|---|---|---|---|
| solo | יחיד | ₪149 | ₪1,490 | 1 |
| studio | סטודיו | ₪349 | ₪3,490 | up to 5 |
| center | מרכז | bespoke quote | bespoke quote | 6+ |

Rules:

* the value metric is teacher seats and nothing else — every paid tier carries
  all eight feature flags, students and lessons are unlimited; a plan that
  charges the same for one teacher and eight (the old `advanced`) is the
  mistake this catalog replaced
* Solo and Studio yearly = 10 × monthly ("two months free"); prices are final, no VAT (עוסק
  פטור) — flipping `SAAS_PRICES_INCLUDE_VAT` must land with the copy change
* `basic` (₪99) and `advanced` (₪199) are retired in the DB
  (`20260906120000_retire_legacy_plans.sql` sets `is_active = false`), not
  just filtered in code; existing holders are grandfathered — their plan row
  keeps resolving by id and their price does not change
* the trial is 30 days of full **Studio** entitlement (features AND quotas),
  no credit card; marketing/onboarding copy must describe it that way — never
  as a feature-limited free tier
* a plan with subscribers has a locked price in /admin/plans (server-enforced):
  repricing means a new plan row in a migration plus deactivating the old one,
  because subscriptions store no price and an in-place edit re-prices every
  holder
* the Hebrew word for a tier is «מסלול» everywhere in UI copy (not תוכנית or
  חבילה)

**Amendment (09 Sep 2026, Hadar):** Center is no longer a self-serve checkout
plan. Its existing priced row is retired, never repriced, so current Center
subscribers retain their terms. New organizations with more than five teachers,
and existing Studio organizations that need a sixth seat, submit a contact form
to the platform CRM and receive a bespoke quote. Solo (₪149) and Studio (₪349,
up to five teachers) remain self-serve.

## 40. The Outbound Engine Sends and Reads Through the Workspace Itself

✅ DECIDED (07 Sep 2026): cold-email transport is Lessio calling the Gmail API
directly, as a Google **service account with domain-wide delegation** over the
Workspace's outreach mailboxes. No Make.com / n8n layer.

* delegation is authorised once by the Workspace admin; no consent screen, no
  Google OAuth verification (it is internal to the domain), no refresh token
  that expires after 7 days — and it may include `gmail.readonly`, which on
  the public OAuth app would be a *restricted* scope (CASA audit), so reading
  replies is possible at all only this way
* the delegation scopes live outside the public OAuth app and do not touch its
  verification (`docs/google-oauth-verification-submission.md`)
* several mailboxes share the load: `outbound_mailboxes` with a per-mailbox
  daily cap counted in Asia/Jerusalem days; the box with the most room today
  sends first (`src/lib/outbound/mailboxes.ts`)
* the send window (Sun–Thu 08:00–18:00 Israel) is enforced in code as well as
  in the cron schedule; batches are small with a random pause between sends
* `outbound_messages.transport` is `gmail` or `resend` — the `make` value and
  the three Make-facing endpoints (`/next`, `/sent`, `/replies`) are gone;
  the engine is driven by two cron routes, `run-send` and `run-replies`
* the `make` **payment provider** (Grow via Make, decision in Sprint 33) is a
  different thing and is unaffected

Setup: `docs/outbound-gmail-setup.md`.

### Amendment 2026-09-17 — cold discovery eligibility and business memory

Founder-approved: cold discovery targets only Israeli tutoring businesses with
source-confirmed teams of 2–5 teachers. The 6+ teacher segment remains inbound.
Unknown size and failed qualification never enter the proposals list. Previously
queued/contacted or rejected businesses cannot return under another email or
campaign. Minimal identity memory survives candidate/prospect deletion. Both
approval paths recheck qualification and business history in the database.

This closes the gap between the marketing audience definition and discovery,
which previously accepted subject keywords without checking team size and only
checked exact prospect email duplicates during promotion. See
`docs/outbound-discovery-qualification.md` for identity rules and rollout.

---

## 41. An Exam Day Has a Default Hour, Not a Required Time

**Date:** 2026-09-08

The good-luck message before an exam has to answer "when", and `student_exams`
only ever stored `exam_date` — a date. Making the time mandatory would have been
the tidy schema answer and the wrong product one: a parent reporting their child's
exam from the portal, or a student typing it into WhatsApp, frequently does not
know the hour, and a required field there costs us the report entirely.

So the time is optional and the org owns the fallback:

* `organizations.exam_good_luck_hour` (default 07:00 org-local) is when the
  message goes out on the exam day when no time is known — the common case
* `student_exams.exam_time`, when present, moves the send to
  `exam_good_luck_hours_before` hours ahead of it (default 2)
* the send never lands earlier than `exam_good_luck_hour`, so an early exam does
  not produce a 05:30 message, and never once the exam has started — late
  encouragement is worse than none
* the rule is one pure function (`src/lib/exams/goodLuckTiming.ts`, mirrored in
  `supabase/functions/_shared/`), not a subtraction spread across the cron

The cron queries by date and dedups on the `notification_log` claim rather than
on the hour, so a run that misses its hour still sends later the same day and can
never send twice.

The recipient follows the existing student-facing rule — `students.phone`, else
the primary parent — and the toggle lives with the other automations on
`/settings/whatsapp`, not on `/settings/exams`, so an owner has one place to see
everything the system sends by itself.

## 42. Broadcasts Are Campaigns Behind One Guard; a WhatsApp Group Is a Dual Track

**Date:** 2026-09-08

The 2026-09-05 spec for distribution lists was shelved on two conditions. App
Review has since been approved, and the product owner reopened it with a third
ask — a WhatsApp group next to every student group. The research that shaped
the answer (Meta docs, 2026-09-08):

* the Groups API is gated on **Official Business Account** status per number.
  Business verification, 30 days on the platform and public notability are the
  bar; a music studio does not clear it. 8 participants including the business.
* a tech provider **cannot submit Business Verification** for a customer. Only a
  person of the business, in Security Centre. An OBA request can be made on the
  customer's behalf, but the decision is Meta's.
* MARKETING templates need a separate opt-in, are capped per recipient across
  all businesses (131049), and a service message sent as marketing — or the
  reverse — costs the number its quality rating.

Decided:

* **A broadcast is a campaign object** — audience filter, category, state,
  delivery report — never a loop over `sendSmartMessage`. The audience is a
  filter materialised at send time, so a scheduled campaign never reaches a
  student who left.
* **Every broadcast-shaped send passes one guard** (`src/lib/whatsapp/broadcast/guard.ts`):
  quality rating, warm-up, daily budget that leaves room for reminders,
  per-parent frequency, quiet hours, opt-in by category, an AI check that a
  "service update" is not a promotion, Meta error mapping, template pausing.
  The number's health lives on `organizations` and is refreshed by webhook and
  cron, so the guard reads a column, not Meta.
* **UTILITY and MARKETING are separate template types** (`class_update`,
  `promo`), not a checkbox. Each carries its own opt-out button, and opting
  out of one category leaves the others — a parent who leaves offers keeps
  getting lesson reminders.
* **"A WhatsApp group for the student group" is a dual track.** Default:
  a *linked* group the teacher opens on their own phone, whose invite link
  Lessio sends 1:1 (`group_invite`), and "message the group" is a broadcast
  to the group's parents — said plainly in the UI. The Groups API path exists
  only behind `wa_is_oba` and is not built until a tenant has it.
* **Lessio prepares and points, it does not collect documents.** The
  verification card on `/settings/whatsapp` shows the ladder
  (connected → verified → OBA), an Israeli checklist and the Security Centre
  link. Marketing broadcasts and linked groups open only after verification.
* Owners and admins broadcast; a teacher may send a service update to the
  parents of their own lessons, nothing else.

## 43. Talking to Families Happens in One Inbox

**Date:** 2026-09-10

Opening the product, the owner could not tell where to click, how to step into
a conversation the bot was having, how to make a list, or where the number stood
with Meta. Operation lived on four pages in three shapes: WhatsApp conversations
(keyed by phone), portal messages (keyed by student), broadcasts, and a Meta
status in settings.

Decided:

* **`/messages` is the one operational surface** — a conversation list on one
  side, the open thread on the other, the number's state in one line at the
  top, and conversations / lists / broadcasts as three segments of it. Thread
  URLs did not change. Settings keep configuration only.
* **WhatsApp and portal conversations are one list**; the channel is a tag. A
  studio owner thinks "who is waiting for me", not "which channel".
* **Tags are derived, never typed** (`src/lib/inbox/tags.ts`). Their priority is
  a product decision pinned by a test: a row shows the three tags that change
  what the reader does, and names (group, teacher) always rank below status.
* **Taking over is an explicit act.** "I'll answer" silences the bot for the
  takeover window; sending still does too, and both say so.
* **After the 24h window, a parent is reached with the approved `class_update`
  template, sent as a campaign of one** through the broadcast engine — never a
  second send path. Students, teachers and strangers get an explanation
  instead, because no template is addressed to them.
* **Groups are lists; a saved list is for the choice that follows no
  structure.** `broadcast_lists` is an audience (`{ kind: 'list' }`) resolved at
  send time, under the same consent rules as every other audience.
* Teachers get the conversations of their own students and their parents, both
  channels, re-checked per thread and per action. Lists and broadcasts stay
  owner/admin tools; a teacher's service update to her own families goes
  through the thread's closed-window send.

### Amendment 2026-09-14 — locked is shown, not hidden

The owner opened the inbox, read "active with limits", and concluded that lists
and groups were closed until she had been thirty days on the platform. No such
rule exists; the thirty days are Meta's bar for the green tick, which nothing
here needs. What existed was four surfaces each deriving a partial verdict —
the nav from the role, the pages from the plan (a redirect to billing with no
sentence), the composer from a half-read verification flag — and none of them
saying why.

* **One resolver answers "what can this number do"**:
  `src/lib/whatsapp/capabilities.ts`. Five capabilities (conversations,
  service updates, promotional broadcasts, lists, linked groups), each
  `available | limited | locked` with the reason a person can act on, what
  unlocks it, the cap and the date. It reads `computeWaState`, the broadcast
  guard and the plan features together; it re-derives nothing.
* **A closed segment stays visible, with a lock.** Clicking it opens the
  explanation (why / what opens it / how you will know). The same explanation
  is the page content where the neutral empty state used to say "no broadcasts
  yet" to a plan that had none.
* **Pages explain; server actions still gate.** `/messages/lists` and
  `/messages/broadcasts/new` render the notice instead of redirecting.
  `requireFeature` / `assertFeature` stay mandatory in every server action; the
  navigation registry still hides the entries from the sidebar.
* **The status line names each limit with its number and date** — "new
  number: broadcasts up to 50 recipients until 28.09" — instead of "not
  everything is open yet".
* **No health email exists and none is invented.** "How you will know" is the
  status line, the settings card, the in-app `whatsapp_health` notification for
  Meta events, and a concrete date for the warm-up.

## 44. On the Calendar, Status Is the Background and the Teacher Is the Stripe

✅ DECIDED (Sep 2026): a centre with several teachers must be able to read the
whole-centre calendar and know whose lesson each card is, and switching teacher
must take one click.

* **Every teacher has a stable colour.** `teachers.color` holds a key from the
  app palette (`src/lib/teachers/color.ts`); NULL derives a key from the teacher
  id, so the colour never shifts when a teacher is added or the roster is
  re-ordered. The owner may pick a different key in the teacher form. Only keys
  are stored — the Tailwind classes live in code as literal strings.
* **Colour carries one meaning per surface.** The card background stays the
  lesson status (scheduled / completed / no-show / cancelled). The teacher is a
  start-side stripe (`border-s-4`) on week and day cards and a dot on month
  chips. The card names the teacher only on the whole-centre view; a filtered
  view keeps the stripe and drops the name.
* **A solo tutor sees none of it.** With one active teacher there is no picker,
  no stripe and no name — the same rule that already drops "which teacher?"
  from forms.
* **One teacher picker for every view**, `CalendarTeacherPicker`: chips with the
  teacher's dot on desktop (up to eight teachers), a native select on mobile
  and for longer rosters. The old pair of controls (one inside `WeekNav`, one
  for day/month) is gone.
* **A URL-driven control must show the choice before the server confirms it.**
  The filter lives in the URL, so picking a teacher is a navigation; a
  controlled `<select value={serverProp}>` snapped back to the old value while
  the round trip was in flight, and every retry restarted the navigation
  ("it only works on the sixth try"). The picker wraps `router.push` in
  `useTransition`, shows the optimistic value while pending, and is inert until
  the navigation settles. It edits the current query (`withTeacherParam`)
  instead of rebuilding it, so view, week, day, month, student and cancelled
  all survive.

## 45. Attributed Revenue Is the List Value of Delivered Activity

✅ DECIDED (15 Sep 2026): the teacher-economics report answers "what was this
teacher's activity worth to the centre", not "what cash did it bring in". The
first implementation summed `charges` of type `lesson`/`cancellation` per
lesson; a centre on monthly billing writes no such rows, so every teacher showed
₪0 revenue and a negative contribution. That was the sprint-35 definition
misread, not a data problem.

* **Completed lesson → list price per enrolled student**, through
  `resolveLessonBaseAmount` (the one pricing function every billing path uses),
  with the student's own rate and discount applied. Billing mode is irrelevant:
  a subscription-covered lesson is attributed at list price and only *flagged*
  as covered on the drill-down. Subscription cash is never allocated to lessons
  (sprint 35 already forbade inventing that allocation).
* **Parent cancellation → the cancellation policy.** A recorded cancellation
  charge wins; otherwise `calculateCancellationCharge` prices the cancellation
  from `cancelled_at` and the org policy window, and the same call decides
  whether it was "late" for the compensation percentage. Portal and WhatsApp
  cancellations are the parent's own channels and count as parent
  cancellations. Teacher and staff cancellations attribute nothing.
* **No-show attributes nothing.** The centre does not bill a no-show
  (`BILLABLE_STATUSES` is `completed` only), so counting list price would be
  fabricated revenue. Compensation still follows `no_show_percent`, so a
  no-show's contribution is honestly negative.
* **A completed lesson is accepted operationally** unless the policy has
  `requires_confirmation` and no delivery confirmation arrived. Automatic
  completion writes no confirmation; under the old rule that made every line
  "estimated" forever, which told the owner nothing.
* **No policy means no number.** A line without an active policy has `null`
  compensation and contribution and the teacher's totals go `null` too, with
  a callout linking to the policy settings. The previous behaviour (0
  compensation, contribution = revenue) quietly inflated contribution.
* **Every warning is a named reason** — missing policy, awaiting confirmation,
  unknown cancellation source, staff cancellation, missing price, no
  cancellation policy — shown per teacher in the state badge and per lesson on
  the drill-down. "Estimated" is never a label the owner has to guess at.

The operations report (`/reports/operations`) renders the same
`TeacherActivityTable` without the finance columns, so an office manager and
the owner always see identical counts for a month.

## 46. A Punch Card Is a Ledger, and Attendance Is Recorded per Student

✅ DECIDED (15 Sep 2026): punch cards (כרטיסיות) are built on the existing
money engine — charges, partial payments, the payment providers, receipts —
not as a parallel payment path. Plan: `scalable-greeting-token.md`.

* **A pack is a ledger, not a pricing rule and not a balance column.**
  `lesson_pack_ledger` is append-only (`purchase`, `consume_lesson`,
  `consume_late_cancel`, `consume_no_show`, `manual_adjust`, `expire`); the
  balance is `SUM(delta)` over un-reversed rows. An undo marks `reversed_at`,
  so the same (lesson, student) can be punched again. A lesson is covered by a
  pack exactly when an un-reversed `consume_*` row exists for it.
* **One serialised punch.** `consume_pack_credit` (SECURITY DEFINER, service
  role only) picks the student's own card before a family card, then the one
  expiring first, then the oldest, under `FOR UPDATE`. A unique index on
  (lesson_id, student_id) makes every retry and race a no-op.
* **Attendance is the source; the lesson status is derived.**
  `lesson_students.attendance` is `present | absent | NULL`; NULL on a
  completed lesson means present (the completion cron marks nobody). A lesson
  is `no_show` iff every enrolled student was absent. `isStudentAbsent` in
  `src/lib/lessons/attendance.ts` is the only place that decides.
* **One reconciler.** `settleLessonOutcome` replaces `createLessonCharge` at
  every completion entry point and aligns ledger and charges to what the
  outcome should leave behind, per student: subscription → pack → money, for a
  present and an absent student alike. What exists for the current outcome
  stays (a charge raised before a pack was activated is never retroactively
  punched); what belongs to another outcome is retired — a pending charge is
  voided, a punch reversed. A paid charge is never touched: the attendance
  stands and an `outcome_conflict` alert is returned.
* **One collection policy.** No-show percentage, what a pack does on a
  no-show and on a late cancellation, activation (`immediate | on_payment`),
  ownership (`student | family`), the running-low threshold and parent
  notifications live on `cancellation_policies`, edited on one settings page
  together with the pack catalog. Every default is the behaviour before
  packs: a no-show is free.
* **Billing mode decides the money, not the pack.** Per lesson: a sale is a
  `pack` charge. Monthly: no charge — `lesson_packs.charge_id IS NULL` is how
  the monthly engine knows to bill `price` on `billing_student_id`'s bill, and
  the card is active at once. `BILLABLE_STATUSES` now includes `no_show`,
  billed from the `absence_amount` snapshot written at settlement.
* **Booking without an entitlement pays first — only where the org collects
  through packs.** Collecting through punch cards is an explicit org choice
  (`cancellation_policies.pack_collection_enabled`, default off), never
  inferred from having a catalog. With it on, in a per-lesson org with a
  payment provider and an active catalog, a portal parent with no covering
  subscription or spare credit picks a pack or a single lesson and pays before
  the lesson exists (`booking_checkout_sessions`, slot lock held 15 minutes).
  Only a verified payment on a live lock confirms. A paid pack is issued even
  if the slot was lost; a lost slot on a paid single lesson becomes
  `needs_attention`. Everywhere else booking is unchanged.
* **No refund flow (#37).** Cancelling a paid card is two steps: record the
  refund on its charge (`markChargeRefunded`), then cancel with a reason; the
  remaining credits are written off with an `expire` row. A refund reported on
  a live card never cancels it — owners and admins are notified. An owner may
  "cancel anyway" without a refund marker.
* **Office managers see balances, not money.** They mark attendance (an
  operational act; the reconciler writes charges with the service role) and
  see what is left on a card. Selling, cancelling, correcting and the catalog
  are owner/admin; the new tables carry owner/admin read policies only.
* **Amends #45.** A lesson a pack paid for is attributed at list value and
  flagged `packCovered`, like subscription coverage. Attribution follows
  attendance per student: an absent student in a completed group lesson
  attributes what their no-show was billed (`no_show_charge`), or list value
  when the absence burned a punch, or nothing.

## 48. The Product Wears the Diary's Materials, Not Its Costume

✅ DECIDED (17 Sep 2026, Hadar): the public surfaces (landing, auth, legal) are
"the teacher's week diary" (DESIGN.md). The authenticated product corresponds
with it without imitating it. (#47 is the lesson time change, on its own branch.)

* **Same materials.** White paper and ink, hairline borders in the ruling's
  blue-grey, the cover teal as `--primary` and as the sidebar, one UI family
  (Assistant, which also fixes Hebrew falling back to the operating system's
  font under Geist), radius 0.3rem, no card shadows. Tokens live in
  `src/app/globals.css`; faces in `src/lib/fonts.ts`; the L mark in
  `src/components/brand/LessioMark.tsx`.
* **One highlighter.** `--highlight` marks the ONE primary action of a screen
  (`Button variant="mark"`), the selected item (the sidebar's active rail,
  today's column) and an amount that needs attention (`.mark-highlight`). Ink
  text only. Everything else that is a button is teal or outline.
* **One red pen.** `--pen` is for what was cancelled, is overdue or is
  destructive. A cancelled lesson's name is struck with `.pen-strike`.
* **One status palette.** `src/lib/ui/statusTone.ts`: planned (ruling blue),
  done (cover teal), waiting (highlighter), problem (red pen), off (ink grey).
  Badges, calendar cards and legends read from it; a status never wears two
  colours on two screens. Decision #44 stands: status is the background, the
  teacher is the stripe.
* **No costume.** Inside the product there is no handwriting in labels, no
  fields written on a ruling, no ruled-paper backgrounds, no drawing
  animations, and Secular One appears only in the page title and the
  wordmark. Standard form controls stay standard (Operate surfaces).
* **Four diary moments** are the exceptions, because they are where the
  product does what the landing page promised: (1) a cancelled lesson on the
  calendar is struck by the red pen, with its cancellation fee highlighted;
  (2) approving a monthly bill is marked "approved" in the pen's hand; (3)
  empty states and onboarding carry a pen doodle and one handwritten line;
  (4) "needs attention" reads as margin notes: hairline rows, counts in red
  pen, amounts highlighted.
* **Rollout.** Foundations and two proof screens (`/dashboard`, `/lessons`)
  ship first. The rest of the product still paints with raw Tailwind palette
  classes in ~270 files; those move to tokens screen by screen, not in one
  codemod. Dark mode remains inert (the `.dark` class is never applied).

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
