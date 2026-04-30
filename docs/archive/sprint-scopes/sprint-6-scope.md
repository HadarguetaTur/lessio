# LESSIO — Sprint 6 Scope (v3)

## Goal

Make LESSIO safe to launch for a first real customer without adding any new product scope.

**Milestone:** First Live Production Candidate

---

## Dependencies

- All core flows from Sprints 1-5 complete and stable
- Deployment target defined (`Vercel` + `Supabase`)
- Auth and data model stable
- Sprint 5 role boundaries preserved as the authorization baseline

---

## Critical Strategy

**Security audit before QA. QA before go-live sign-off.**

Correct order: secrets audit -> structured logging -> environments -> E2E QA on staging -> Data Recovery Playbook -> first customer readiness.

**Nothing ships to production without passing staging first.**

---

## Explicit Scope

### In Scope

- Secret and access audit (`bundle analysis`, service role isolation, webhook signature verification)
- Structured logging for critical flows
- Graceful failure handling for external or side-effect-heavy paths (`WhatsApp API`, charge writes, webhook processing)
- Environment separation (`dev`, `staging`, `prod`)
- Env var validation on startup with named crash errors
- Migration discipline: test -> staging -> prod
- Seed strategy per environment
- Release checklist and rollback notes
- All 6 end-to-end scenarios on staging
- Cross-cutting QA: timezone, Hebrew/RTL, mobile, archived records, duplicate submission, wrong-org / forbidden behavior
- Data Recovery Playbook
- First customer onboarding checklist and launch readiness notes

### Out of Scope

- New features of any kind
- New roles or permission expansion
- Large redesigns
- Payment provider integration
- Full analytics suite
- CI/CD automation
- External monitoring services (`Sentry`, `Datadog`, etc.)
- Billing-rule redesign
- Booking-flow redesign

---

## Regression Boundaries

- Sprint 1 booking flow must remain behaviorally unchanged except for verified security, logging, or reliability fixes
- Sprint 3 charge behavior and idempotency guarantees must remain intact
- Sprint 4 WhatsApp flows must remain intact except for verified signature, logging, or graceful-failure hardening
- Sprint 5 teacher access boundaries must remain unchanged
- Sprint 6 must not expand access to billing, people management, cancellation, or org settings beyond the approved role model

---

## Epics & Stories

## EPIC A — Security & Reliability
**Jira Epic:** `DEV-68`

### Story A1 — Secret and access audit
**Jira Story:** `DEV-68a`

**Goal:** Confirm that high-risk secrets and privileged access paths stay server-only and are verifiably protected before staging QA.

**Expected Code Areas:**
- env/config loading
- `src/lib/supabase/service-role.ts`
- booking JWT helpers
- WhatsApp webhook route
- server-only modules and imports
- documentation and verification checklist entries

**Scope:**
- Audit all usages of `SUPABASE_SERVICE_ROLE_KEY`
- Audit all usages of `BOOKING_JWT_SECRET`
- Confirm neither secret is reachable from any client bundle or client component
- Verify service role usage is isolated to approved server-only modules
- Verify webhook signature enforcement rejects missing/invalid `X-Hub-Signature-256` with `401`
- Document findings and required narrow fixes only

### Story A2 — Structured logging and error visibility
**Jira Story:** `DEV-68b`

**Goal:** Make production issues diagnosable without adding external monitoring services in Sprint 6.

**Expected Code Areas:**
- booking actions and helpers
- lesson outcome update paths
- billing / charge creation paths
- payment request paths
- WhatsApp webhook and sender helpers
- shared logging utilities

**Scope:**
- Add structured, actionable logs for critical flows
- Include `org_id` and relevant entity IDs when available
- Log failure reason and execution step for critical errors
- Catch and log `WhatsApp API` failures without crashing the system
- Catch and log charge-write failures with enough context for manual recovery
- Do not add third-party monitoring tools in this sprint

---

## EPIC B — Environments & Release
**Jira Epic:** `DEV-69`

### Story B1 — Environment separation and env validation
**Jira Story:** `DEV-69a`

**Goal:** Ensure every environment starts with the correct configuration and fails fast when required secrets or config are missing.

**Expected Code Areas:**
- env validation utilities
- app startup/bootstrap paths
- `.env.example`
- deployment configuration
- seed strategy documentation

**Scope:**
- Separate `dev`, `staging`, and `prod` configuration expectations
- Validate required env vars at startup
- Use named error messages for missing required env vars
- Keep secrets out of committed files
- Document seed strategy per environment
- Do not rely on client-side config validation for server secrets

### Story B2 — Migration discipline and release checklist
**Jira Story:** `DEV-69b`

**Goal:** Make deploys repeatable and safe enough for the first production launch.

**Expected Code Areas:**
- migration docs
- release checklist docs
- deployment notes
- rollback / manual verification notes

**Scope:**
- Define migration order: test -> staging -> prod
- Document who runs migrations and when
- Require verification after each migration step
- Add release checklist covering build, envs, migrations, QA, and rollback readiness
- Keep rollout process manual and explicit for MVP

---

## EPIC C — QA & Go-Live Validation
**Jira Epic:** `DEV-70`

### Story C1 — E2E scenario QA on staging
**Jira Story:** `DEV-70a`

**Goal:** Prove the full product works on staging before any production sign-off.

**Expected Code Areas:**
- QA checklists
- staging verification notes
- test documentation
- narrow regression-fix areas only when required

**Scope:**
- Run all 6 end-to-end scenarios on staging
- Record pass/fail result and blocker notes
- Treat local-only verification as insufficient for release approval
- Fix only verified regressions or readiness blockers

### Story C2 — Cross-cutting QA and Data Recovery Playbook
**Jira Story:** `DEV-70b`

**Goal:** Cover operational edge cases and document safe manual recovery for known incidents.

**Expected Code Areas:**
- QA checklist docs
- operational runbooks
- incident recovery documentation
- narrow regression-fix areas only when required

**Scope:**
- Validate timezone handling
- Validate Hebrew / RTL rendering on touched flows
- Validate basic mobile sanity on touched flows
- Validate archived-record behavior in active flows
- Validate duplicate-submit protection still holds
- Validate wrong-org / forbidden behavior remains correct
- Document manual recovery steps for common failures before go-live sign-off

---

## EPIC D — First Customer Readiness
**Jira Story:** `DEV-73`

**Goal:** Make the first pilot customer onboarding and launch process explicit, repeatable, and low risk.

**Expected Code Areas:**
- onboarding checklist docs
- release notes docs
- handoff / support notes

**Scope:**
- Document first-customer onboarding prerequisites
- Document environment and secret setup checklist
- Document first-launch smoke tests
- Document owner/admin handoff notes for pilot support

---

## End-to-End Scenarios (must pass on staging)

| Scenario | Description |
|---|---|
| Booking E2E | WhatsApp -> WebView -> lesson created |
| Lesson update | Manual status update from dashboard |
| Cancellation | Cancel from dashboard + charge creation |
| Charges | Completed lesson -> charge -> mark paid |
| WhatsApp cancel | Parent cancels via WhatsApp -> policy applied |
| Payment request | Send payment request via WhatsApp -> `sent_at` logged |

---

## Data Recovery Playbook Baseline

| Scenario | Symptom | Manual Fix |
|---|---|---|
| Charge not created | Lesson completed, no charge in table | Check logs -> manual `INSERT` to `charges` after verifying billing parent and lesson status |
| Duplicate charge | Two charges for same `lesson_id` | Remove the newer duplicate and verify lesson-charge idempotency path |
| Lesson stuck at scheduled | Lesson passed, status not updated | Manual `UPDATE` to `completed` / `no_show` and verify downstream charge behavior |
| Slot lock expired but lesson created | Lesson exists, `slot_lock.status = expired` | Check `created_at` vs `expires_at` and update the lock to `consumed` only if the booking was valid |
| Parent with no primary parent | Lesson creation fails unexpectedly | Check `relationships` data and correct `is_primary` before retrying |
| WhatsApp message not received | Parent claims they sent it, nothing appears in DB | Check app logs, then Meta webhook delivery logs, then replay only if safe |

---

## Non-Negotiable Tests — Sprint 6

| What | Minimum Coverage |
|---|---|
| Smoke test: booking | WhatsApp -> WebView -> lesson created on staging |
| Smoke test: billing | Completed lesson -> charge -> mark paid on staging |
| Smoke test: teacher update | Teacher can update only own lesson outcome on staging |
| Secrets audit | `SUPABASE_SERVICE_ROLE_KEY` not in any client bundle |
| Booking secret audit | `BOOKING_JWT_SECRET` not exposed client-side |
| Webhook signature | Request without valid `X-Hub-Signature-256` -> `401` |
| Env validation | Missing required env var -> startup fails fast with named error |
| Structured logging | Critical failure path logs include `org_id` and entity context when available |
| Regression check: duplicate submit | Repeated submission does not create duplicate rows or duplicate side effects |
| Regression check: archive integrity | Archived records stay out of active booking / assignment / selection flows |

---

## Definition of Done — Sprint 6

- [ ] `dev`, `staging`, and `prod` are separated and documented
- [ ] Required env vars are validated at startup
- [ ] Secrets and privileged access paths are audited
- [ ] Service role usage is isolated to approved server-only modules
- [ ] Critical flows produce clear structured logs
- [ ] WhatsApp API failures are caught and logged without crashing the system
- [ ] Release checklist and migration discipline are documented
- [ ] All 6 end-to-end scenarios passed on staging
- [ ] Cross-cutting QA completed: timezone, RTL, mobile, archive, duplicate submission, forbidden access
- [ ] Data Recovery Playbook is documented in `/docs/`
- [ ] First customer onboarding checklist exists
- [ ] Sprint 1-5 regression boundaries were checked and preserved
- [ ] The product can go live for a controlled pilot with reasonable confidence

---

## Ground Rules for Claude Code — Sprint 6

```text
You are building LESSIO Sprint 6 — Production Readiness.

Rules:
1. No new features. No new UI unless a narrow readiness fix strictly requires it.
2. Preserve Sprint 1-5 business behavior unless fixing a verified regression or readiness blocker.
3. SUPABASE_SERVICE_ROLE_KEY must never appear in any client bundle or client component.
4. BOOKING_JWT_SECRET must never be exposed client-side.
5. Service role is imported only from src/lib/supabase/service-role.ts.
6. All required env vars are validated at startup; missing vars fail fast with named errors.
7. WhatsApp webhook requests without valid X-Hub-Signature-256 must return 401 before processing.
8. All critical flows must produce structured, actionable logs with org_id and relevant entity IDs when available.
9. WhatsApp API failures and charge-write failures must be caught and logged; they must not crash the system.
10. All E2E smoke tests run on staging, not local only.
11. Nothing ships to production without passing staging first.
12. Data Recovery Playbook must exist before go-live sign-off.
13. Do not add external monitoring services, CI/CD automation, or new integrations in Sprint 6.
14. Before starting any Sprint 6 story, read /docs/schema.md, /docs/decisions.md, /docs/security.md, and this file.
15. Before coding any story: summarize the task in 3-6 bullets, list exact files likely to change, and list explicit out-of-scope items.
16. If a security or release rule is missing, stop and add a TODO instead of inventing production behavior.
```