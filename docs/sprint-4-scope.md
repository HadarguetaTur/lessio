# LESSIO — Sprint 4 Scope (v3)

## Goal

Expose core actions to external users:
- parent cancels via WhatsApp
- leads are captured and converted
- payment requests are sent

**Milestone:** External User Workflows

---

## Dependencies

- Sprint 3 complete:
  - `calculateCancellationCharge()` tested
  - Charge Engine stable
- Sprint 1 WhatsApp webhook exists
- Sprint 2 people management working:
  - parents
  - students
  - relationships

---

## ⚠️ Critical Strategy

**Leads must be fully working before WhatsApp cancellation and payment request.**  
Both cancellation and payment request depend on reliable parent identification, which starts with the lead capture and deduplication layer.

**`calculateCancellationCharge()` must be reused from Sprint 3 — never reimplemented.**

---

## Explicit Scope

### ✅ In Scope

- Lead capture from WhatsApp
- Lead deduplication by phone
- Leads management list + manual status updates
- Lead conversion → parent + student + relationship
- WhatsApp cancellation:
  - keyword detection
  - lesson list generation
  - lesson selection
  - policy application
  - notifications
- State machine with 10-minute timeout (Decision #14)
- Payment request via WhatsApp:
  - build message
  - send message
  - log send metadata

### ❌ Out of Scope

- AI/NLP intent detection
- Payment provider integration
- Parent web portal
- Automatic/scheduled payment reminders
- Waive charge via WhatsApp
- Leads from any source other than WhatsApp
- Cancellation of lessons beyond 7 days ahead
- Bulk payment requests
- Converting one lead into multiple students in Sprint 4

---

## Jira Mapping

| Scope Alias | Actual Jira Ticket |
|---|---|
| DEV-61a | DEV-99 |
| DEV-61b | DEV-100 |
| DEV-61c | DEV-101 |
| DEV-62a | DEV-102 |
| DEV-62b | DEV-103 |
| DEV-63a | DEV-104 |

---

## Tickets & Execution Order

| Step | Ticket | What |
|---|---|---|
| 1 | DEV-61 | Epic: Leads — definition |
| 2 | DEV-99 | Lead capture + deduplication |
| 3 | DEV-100 | Leads management list UI |
| 4 | DEV-101 | Lead conversion to parent + student |
| 5 | DEV-62 | Epic: WhatsApp Cancellation — definition |
| 6 | DEV-102 | Intent detection + lesson selection |
| 7 | DEV-103 | Apply cancellation + charge + notifications |
| 8 | DEV-63 | Epic: Payment Request — definition |
| 9 | DEV-104 | Build + send payment request |
| 10 | DEV-71 | Acceptance + regression |

---

## Lead Flow — Rules

- A lead is created when an unrecognized phone number sends a WhatsApp message
- Phone must be normalized with `normalizePhone()` before every lookup and save
- Unique constraint on `(organization_id, phone)` — no duplicates
- If phone already exists as `parent`:
  - do not create a lead
  - route to parent flow
- If lead already exists for this phone:
  - do not create a duplicate
  - update `updated_at` only
- Conversion creates:
  - one `parent`
  - one `student`
  - one `relationship` with `is_primary = true`
- If phone already exists as `parent` at conversion time:
  - block conversion
  - show clear error
- `lead.status = converted` after successful conversion
- Only owner/admin can manage or convert leads

### Lead Statuses

Allowed statuses:
- `new`
- `contacted`
- `converted`
- `irrelevant`

Rules:
- owner/admin can manually change:
  - `new`
  - `contacted`
  - `irrelevant`
- `converted` is set by successful conversion flow
- `converted` is terminal for Sprint 4

### Lead Conversion — Required Fields

Required:
- parent full name
- student full name

Optional:
- grade
- relationship type

Sprint 4 rule:
- one lead converts into one parent + one student only

---

## WhatsApp Cancellation — Intent Rules

Supported cancellation keywords:
- `"ביטול"`
- `"לבטל"`
- `"cancel"`

Matching rule:
- case insensitive
- normalized text
- **contains match**, not AI/NLP
- examples that should trigger:
  - `ביטול`
  - `אני רוצה לבטל`
  - `cancel lesson`

Examples that should not trigger:
- unrelated text without cancellation keyword

---

## WhatsApp Cancellation — Lesson List Rules

When a valid cancellation intent is detected:
- identify parent by normalized phone
- fetch only lessons that:
  - belong to that parent’s students
  - have `status = scheduled`
  - occur within the next 7 days

Each numbered row must include:
- number
- student name
- date
- time
- teacher name

Display rules:
- all times shown in organization timezone
- if parent has multiple students, show all eligible lessons in a single numbered list

If no eligible lessons exist:
- send clear message
- close flow

---

## WhatsApp Cancellation — State Machine (Decision #14)

| State | Input | Response | Next State |
|---|---|---|---|
| idle | cancellation keyword | Numbered lesson list | awaiting_selection |
| awaiting_selection | Valid number (1–N) | Confirmation + charge calc | done |
| awaiting_selection | Invalid number | Error + return to list | awaiting_selection |
| awaiting_selection | Lesson no longer eligible | Error + return to list | awaiting_selection |
| awaiting_selection | Timeout (10 min) | Flow closed | idle |
| awaiting_selection | No upcoming lessons | Message: no lessons | idle |

### State Machine Rules

- Invalid input never closes the flow
- Timeout closes the flow after 10 minutes of inactivity
- Flow closes only on:
  - successful cancellation
  - timeout
  - no eligible lessons

### Lesson Revalidation Before Cancellation

When the parent selects a lesson number, the system must revalidate that the lesson:
- still exists
- still belongs to that parent
- still has `status = scheduled`
- is still within the allowed upcoming window

If not:
- send clear error
- return to numbered list
- keep the flow open

---

## WhatsApp Cancellation — Charge Rules

- `calculateCancellationCharge()` must be reused from Sprint 3
- It must not be rewritten inside Sprint 4 flow
- Waive is not available via WhatsApp
- Waive remains dashboard-only

### Idempotency Rules

If the same cancellation action is processed more than once:
- lesson must not be cancelled twice
- duplicate charges must not be created
- duplicate notifications must not be sent

If lesson is already cancelled:
- do not apply cancellation again
- return safe response

---

## Payment Request — Rules

- Only `pending` charges are included
- If parent has no pending charges:
  - sending is blocked
  - clear message shown
- Only owner/admin can send payment requests

### Message Content

The payment request message must include:
- parent-facing summary
- itemized pending charges
- total amount due

Each charge line should include:
- student name when available
- charge reason or lesson reference
- amount

Sprint 4 rule:
- this is an informational payment request message only
- no payment provider integration
- no payment link unless already available from existing approved system behavior

### Logging Rules

After successful send:
- update send metadata on all included charges

Minimum logged data:
- `sent_at`
- sender identity

### Idempotency Rules

Sending the payment request again:
- must not create new charge records
- must not duplicate existing charges
- may update send metadata again only according to the chosen implementation

Sprint 4 minimum acceptable behavior:
- repeated send does not mutate charge amounts or statuses

---

## Non-Negotiable Tests — Sprint 4

| What | Minimum Coverage |
|---|---|
| Lead capture | Same phone twice → one record only |
| Lead capture after conversion | Converted phone routes as parent, not as lead |
| Lead conversion | Phone already exists as parent → blocked with clear error |
| Intent detection | Hebrew and English keywords recognized with case-insensitive contains match |
| Lesson list | List includes student, date, time, teacher |
| Policy reuse | WhatsApp cancellation applies identical calculation to dashboard |
| State machine | Invalid input keeps flow open |
| State machine | Timeout closes flow after 10 min |
| Revalidation | Lesson no longer eligible → error + return to list |
| Cancellation idempotency | Same cancellation processed twice → no duplicate charge |
| Payment request | `sent_at` logged after send |
| Payment request idempotency | Sending twice → no duplicate charges, no status corruption |

---

## Definition of Done — Sprint 4

- [ ] Unrecognized WhatsApp sender creates one lead only
- [ ] owner/admin can manage lead statuses
- [ ] Lead can be converted to one parent + one student
- [ ] Converted phone no longer enters lead flow
- [ ] Parent can cancel a lesson via WhatsApp
- [ ] Cancellation flow applies policy correctly using Sprint 3 logic
- [ ] Cancellation list is clear and unambiguous
- [ ] Confirmation is sent to parent
- [ ] Alert is sent to admin
- [ ] Timeout works correctly after 10 minutes
- [ ] Invalid input keeps flow open
- [ ] owner/admin can send payment request via WhatsApp
- [ ] Payment request includes only pending charges
- [ ] Send metadata is logged on included charges
- [ ] No duplicate records are created in cancellation or payment resend scenarios

---

## Ground Rules for Claude Code — Sprint 4

```txt
You are building LESSIO Sprint 4 — External User Workflows.

Rules:
1. WhatsApp intent detection = keyword matching only. No AI/LLM.
2. Cancellation keywords: "ביטול", "לבטל", "cancel".
3. Matching is case-insensitive contains match on normalized text.
4. State machine must match Decision #14 exactly. Timeout = 10 minutes.
5. Invalid input = error message + return to list. Never close the flow on invalid input.
6. Before cancellation execution, revalidate that the selected lesson still exists, belongs to the parent, is scheduled, and is still eligible.
7. calculateCancellationCharge() must be reused from Sprint 3 — never reimplemented.
8. Waive is not available via WhatsApp. Dashboard only.
9. Lead deduplication: normalizePhone() before every lookup. Unique constraint on (org, phone).
10. Lead conversion must check for existing parent by phone before creating.
11. Lead conversion in Sprint 4 = one lead → one parent + one student only.
12. Payment request: only pending charges. Log send metadata after send. Never create duplicate charge records.
13. Repeated cancellation/payment processing must be idempotent.
14. Do not build: AI flows, payment provider, parent portal, automated reminders, bulk sends.
15. Before any story: read /docs/schema.md and /docs/decisions.md.