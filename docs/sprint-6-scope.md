# LESSIO — Sprint 6 Scope

## Goal

No new features — make sure the product doesn't break on day one with a real customer.

**Milestone:** First Live Production Candidate

---

## Dependencies

- All core flows from Sprints 2–5 complete
- Deployment target defined (Vercel + Supabase)
- Auth and data model stable

---

## Explicit Scope

### ✅ In Scope

- Environment separation (dev/staging/prod)
- Migrations discipline
- Seed/reset strategy
- Secret handling audit
- Service-role isolation audit
- Webhook verification audit
- Logging strategy
- Basic error visibility
- Release checklist
- Smoke tests
- Regression pass
- Timezone QA
- Hebrew/RTL QA
- Mobile QA
- Onboarding checklist for first customer
- Data Recovery Playbook

### ❌ Out of Scope (do not build)

- Major new features
- Large redesigns
- Payment provider integration
- Full analytics suite

---

## Epics & Stories

---

### EPIC A — Security & Reliability

**Story: Secret & Access Audit**

- `SUPABASE_SERVICE_ROLE_KEY` not in client bundle (bundle analysis)
- `BOOKING_JWT_SECRET` not exposed client-side
- Webhook signature verification (X-Hub-Signature-256) — audit and test
- Service role only in `src/lib/supabase/service-role.ts`

**Story: Error Visibility**

- Structured logs for server actions and webhooks
- Critical flows produce actionable logs
- Failure visibility in dashboard (at minimum Vercel logs)

**Story: Resilience**

- Graceful handling of WhatsApp API failures
- Failed charge writes — no crash, logged
- Partial failure handling

---

### EPIC B — Environments & Release

- dev / staging / prod fully separated
- Env validation on startup (missing vars → crash early with clear message)
- Clear migration flow: test → staging → prod
- Separate seed strategy per environment
- Release checklist documented

---

### EPIC C — QA & Go-Live Validation

**End-to-End Scenarios (must all pass):**

| Scenario | Description |
|---|---|
| Booking E2E | WhatsApp → WebView → lesson created |
| Lesson update | Manual status update from dashboard |
| Cancellation | Cancel from dashboard + charge creation |
| Charges | Completed lesson → charge → mark paid |
| WhatsApp cancel | Parent cancels via WhatsApp |
| Payment request | Send payment request via WhatsApp |

**Cross-Cutting QA:**

- Timezone correctness — UTC storage, local display
- Hebrew + RTL on all screens
- Mobile screens — correct display
- Archived records — do not appear in new bookings
- Duplicate submission safety

---

### EPIC D — First Customer Readiness

- Onboarding checklist: org setup → teacher → parent → student → policy → WhatsApp
- Common failure modes documented
- Quick admin fixes manual
- Manual fallback instructions

---

### EPIC E — Data Recovery Playbook

| Scenario | Symptom | Manual Fix |
|---|---|---|
| Charge not created | Lesson completed, no charge in table | Check logs → manual INSERT to charges |
| Duplicate charge | Two charges for the same lesson_id | Identify duplicate → DELETE the newer one, check idempotency constraint |
| Lesson stuck at scheduled | Lesson passed, status not updated | Manual UPDATE to completed/no_show + check charge creation |
| Slot lock expired but lesson created | Lesson exists, slot_lock.status = expired | Check lesson.created_at vs slot_lock.expires_at → update lock to consumed if valid |
| Parent with no primary parent | Lesson creation fails, unclear why | Check relationships table → is_primary set? → update manually |
| WhatsApp message not received | Parent claims they sent it, nothing in DB | Check Vercel logs → check Meta webhook delivery log → retrigger manually if needed |

---

## Non-Negotiable Tests — Sprint 6

| What | Minimum Coverage |
|---|---|
| Smoke test: booking | WhatsApp → WebView → lesson created — end to end on staging |
| Smoke test: billing | Completed lesson → charge → mark paid — on staging |
| Secrets audit | SUPABASE_SERVICE_ROLE_KEY not found in client bundle |
| Webhook signature | Request without valid X-Hub-Signature-256 → 401 |
| Env validation | Missing env var → crash early with clear message, not runtime error |

---

## Definition of Done — Sprint 6

- [ ] dev / staging / prod separated and configured
- [ ] Secrets and permissions audited (bundle analysis)
- [ ] Critical flows produce clear logs
- [ ] Release checklist documented
- [ ] All end-to-end scenarios passed QA on staging
- [ ] Mobile + RTL tested
- [ ] Onboarding plan for first customer exists
- [ ] Data Recovery Playbook documented
- [ ] Can go live with a real pilot with reasonable confidence

---

## Ground Rules for Claude Code — Sprint 6

```
You are building LESSIO Sprint 6 — Production Readiness.

Rules:
1. No new features. No new UI. Fix, harden, and verify only.
2. SUPABASE_SERVICE_ROLE_KEY must never appear in any client bundle or component.
3. BOOKING_JWT_SECRET must never be exposed client-side.
4. All env vars must be validated at startup — missing vars crash early with a clear message.
5. Webhook verification (X-Hub-Signature-256) must be tested — requests without it → 401.
6. Every critical flow must produce structured, actionable server logs.
7. WhatsApp API failures must be caught, logged, and handled gracefully.
8. Smoke tests must run against staging, not local only.
9. Release checklist must be written before go-live.
10. Data Recovery Playbook must be documented for all known failure modes.
```
