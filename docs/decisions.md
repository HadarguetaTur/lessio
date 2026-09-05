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
