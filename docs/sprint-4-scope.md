# LESSIO — Sprint 4 Scope

## Goal

Expose core actions to external users — parent cancels via WhatsApp, leads are captured, payment requests are sent.

**Milestone:** External Operational Product

---

## Dependencies

- Sprint 3 complete: cancellation engine + charge engine working
- WhatsApp webhook exists from Sprint 1
- `calculateCancellationCharge()` available and tested

---

## Explicit Scope

### ✅ In Scope

- Lead capture from WhatsApp
- Leads list + status management
- Convert lead → parent + student
- Parent cancellation flow via WhatsApp
- Lesson selection (next 7 days)
- Apply policy engine in cancellation flow
- Confirmation + alert messages
- Payment request message via WhatsApp
- Logging: `sent_at` on charges

### ❌ Out of Scope (do not build)

- Complex AI intent detection (keyword matching only)
- Payment provider integration
- Parent web portal
- Automatic dunning / collections
- Conversational AI assistant

---

## Epics & Stories

---

### EPIC A — Leads

**Story: Lead Capture**

- Unrecognized parent → save to `leads` (stub exists from Sprint 1 — complete it)
- Fields: phone (E.164), source = whatsapp, status = new, created_at
- Unique constraint on (organization_id, phone) — no duplicates

**Story: Leads Management UI**

- Leads list with status: new / contacted / converted / irrelevant
- Manual status update + notes

**Story: Lead Conversion**

- Convert lead → new parent + student + relationship
- Check for duplicate phone before creating
- Mark `lead.status = converted`

---

### EPIC B — Parent Cancellation via WhatsApp

**Story: Intent Detection**

- Keyword matching: "ביטול", "לבטל", "cancel" (case insensitive)
- Based on the existing WhatsApp webhook from Sprint 1

**Story: Lesson Selection**

- Fetch parent's `scheduled` lessons in the next 7 days
- Send numbered list via WhatsApp
- Parent replies with a number → lesson selected

**Story: Apply Cancellation**

- Reuse `calculateCancellationCharge` from Sprint 3
- `lesson.status` → cancelled
- Create charge if required
- Send cancellation confirmation to parent
- Send alert to admin/teacher

**State Machine — WhatsApp Cancellation (Decision #14)**

| State | Parent Input | Response | Next State |
|---|---|---|---|
| idle | cancel keyword | Numbered lesson list | awaiting_selection |
| awaiting_selection | Valid number (1–N) | Cancellation confirmed + charge calc | done |
| awaiting_selection | Invalid number | Error + return to list | awaiting_selection |
| awaiting_selection | Lesson no longer exists | Error + return to list | awaiting_selection |
| awaiting_selection | Timeout (10 min) | Flow closed | idle |
| awaiting_selection | No upcoming lessons | Message: no lessons to cancel | idle |

**Rule:** Timeout = 10 minutes. Invalid input = error + return to list, not flow termination.

---

### EPIC C — Payment Request via WhatsApp

- Select a parent in the dashboard
- Build message with itemized open charges + total amount
- Send via Meta WhatsApp Cloud API
- Log: `charge.sent_at` + who sent it

---

## Non-Negotiable Tests — Sprint 4

| What | Minimum Coverage |
|---|---|
| Lead capture | Same phone twice → only one record (unique constraint) |
| Lead conversion | Phone already exists as a parent → no duplicate created |
| WhatsApp cancellation | Keyword match: "ביטול" / "לבטל" / "cancel" — all recognized |
| Policy reuse | WhatsApp cancellation applies the same calculation as dashboard cancellation |
| Payment request logging | sent_at recorded, duplicate send does not duplicate charge |
| State machine timeout | After 10 minutes with no response → flow closes |

---

## Definition of Done — Sprint 4

- [ ] New lead from WhatsApp is saved in the system
- [ ] admin/owner can manage lead statuses
- [ ] Lead can be converted to parent + student
- [ ] Parent can cancel a lesson via WhatsApp
- [ ] Cancellation flow applies policy correctly (reuse from Sprint 3)
- [ ] Confirmation and alert messages are sent
- [ ] owner/admin can send a payment request via WhatsApp
- [ ] sent_at is logged on charges

---

## Ground Rules for Claude Code — Sprint 4

```
You are building LESSIO Sprint 4 — External Workflows.

Rules:
1. WhatsApp intent detection = keyword matching only. No AI/LLM. No complex NLP.
2. Keywords for cancellation: "ביטול", "לבטל", "cancel" — case insensitive.
3. WhatsApp cancellation state machine must match Decision #14 exactly.
4. Timeout = 10 minutes. Invalid input = error + return to list. Not flow termination.
5. calculateCancellationCharge() must be reused from Sprint 3 lib — not reimplemented.
6. Lead conversion must check for existing parent by phone before creating.
7. Payment request = WhatsApp message only. No payment processing, no provider.
8. sent_at logging on charges is required for payment request messages.
9. Do not build: AI/conversational flows, payment provider, parent web portal.
10. Before any story: read /docs/schema.md and /docs/decisions.md.
```
