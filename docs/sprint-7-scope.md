# LESSIO - Sprint 7 Scope (draft v1)

## Goal

Lay the first post-launch SaaS foundation for multi-customer growth without destabilizing the production baseline established in Sprint 6.

**Milestone:** Tenant and Bot Foundation

---

## Dependencies

- Sprint 6 production-readiness scope completed
- First pilot customer running on the approved baseline
- Existing booking, cancellation, billing, and teacher access flows remain stable
- `organization_id` remains the canonical tenant boundary

---

## Critical Strategy

Build platform foundations before feature breadth.

Correct order:
tenant settings -> bot orchestration -> integration registry -> limited bot experiences -> acceptance and regression.

Sprint 7 is intentionally the first expansion sprint, not the place to ship every requested feature at once.

---

## Product Outcome

After Sprint 7, LESSIO should support:

- clearer per-organization channel and integration configuration
- a deterministic WhatsApp bot foundation for multiple actor types
- organization-scoped bot sessions and delivery logs
- a first integration hub entry point for external automation tools such as `Make`
- safe, limited self-service read flows through WhatsApp

It should **not** yet attempt:

- full homework management
- Google Calendar sync execution
- full parent or student portal auth
- advanced analytics or automation builder features

---

## Explicit Scope

### In Scope

- tenant-level configuration model for channels and integrations
- official WhatsApp bot orchestration foundation
- actor resolution by phone and organization context
- conversation thread and session state for named WhatsApp flows
- flow routing for `booking`, `cancel`, `upcoming_lessons`, and `open_charges`
- outbound integration delivery log and webhook dispatch baseline
- `Make` connectivity through outbound webhooks
- regression-safe reuse of existing booking and cancellation behavior
- auditability of bot actions and integration deliveries

### Out of Scope

- Google Calendar sync execution
- inbound calendar busy-time blocking
- homework template library UI or assignment workflow
- manager branch segmentation logic
- free-form AI chat as the operational bot engine
- parent or student dashboard login
- accounting, invoice, or ERP integrations
- internal no-code automation builder

---

## Regression Boundaries

- Sprint 1 booking flow remains behaviorally unchanged unless explicitly wrapped by the new bot router
- Sprint 3 billing behavior remains the source of truth for charge creation and charge status
- Sprint 4 WhatsApp cancellation behavior remains unchanged in business outcome
- Sprint 5 role boundaries remain server-side enforced
- Sprint 7 may orchestrate existing flows but may not bypass existing authorization or validation rules

---

## MVP Boundary for Sprint 7

Sprint 7 should solve the platform problem, not the full feature matrix.

### Required in MVP

- tenant-scoped bot and integration configuration
- deterministic bot state machine infrastructure
- support for actor-aware routing
- two new low-risk WhatsApp read flows:
  - view upcoming lessons
  - view open charges
- outbound webhook delivery to `Make`

### Deferred to Sprint 8+

- homework assignment delivery
- homework reminders
- teacher calendar sync
- teacher bot actions beyond read-only status checks
- complex finance actions from WhatsApp

---

## Epics and Stories

## EPIC A - Tenant Configuration Foundation

### Story A1 - Channel and integration settings model

**Goal:** Give each organization an explicit configuration surface for channels and external integrations.

**Scope:**

- define organization-scoped configuration requirements for messaging, payments, calendars, and automation
- separate enabled integrations from raw organization settings
- preserve server-only handling for secrets and credentials
- document owner-only management boundaries

### Story A2 - Feature gating baseline

**Goal:** Prepare the product for customer-specific enablement without creating package complexity too early.

**Scope:**

- define a minimal feature-flag shape for post-launch modules
- allow modules such as bot read flows, homework, or calendar sync to be enabled per organization
- keep gating internal and operational, not customer-facing pricing logic yet

---

## EPIC B - WhatsApp Bot Platform

### Story B1 - Actor resolution and conversation model

**Goal:** Route incoming WhatsApp messages through a stable organization-aware actor model.

**Scope:**

- resolve sender phone in normalized E.164 format
- identify actor type: `parent`, `student`, `teacher`, or `staff`
- create or reuse conversation thread records
- create time-bounded conversation sessions for named flows
- log flow state transitions for operational support

### Story B2 - Deterministic flow router

**Goal:** Replace scattered keyword handling with a central bot routing layer.

**Scope:**

- map incoming intents to named flows
- route existing booking and cancellation flows through the new orchestration layer
- preserve explicit timeouts and validation behavior
- reject ambiguous or unsupported requests with safe fallback messages

### Story B3 - Read-only WhatsApp flows

**Goal:** Add value through safe self-service flows before introducing new write-heavy flows.

**Scope:**

- parent or student can request upcoming lessons
- parent can request open charges
- teacher can request their upcoming schedule summary
- results must stay tenant-scoped and actor-scoped
- these flows must not permit mutation of billing, scheduling, or people records

---

## EPIC C - Integration Hub Foundation

### Story C1 - Organization integration registry

**Goal:** Model integrations as first-class tenant-owned connections rather than ad-hoc fields.

**Scope:**

- define provider metadata per organization
- support draft, active, disabled, and error states
- keep provider-specific config behind narrow adapters
- retain owner-only control for setup and testing

### Story C2 - Outbound event delivery baseline

**Goal:** Enable reliable outbound automation for `Make` and similar tools.

**Scope:**

- define outbound event types for booking, cancellation, lesson completion, and charge updates
- persist delivery attempts and statuses
- add retry-safe event keys
- support generic webhook delivery before deeper provider integrations

---

## EPIC D - Acceptance and Operational Safety

### Story D1 - Tenant isolation and actor-scope QA

**Goal:** Prove that bot and integration surfaces do not weaken tenant or role boundaries.

**Scope:**

- verify wrong-org access still fails safely
- verify actors only receive their own organization data
- verify teachers cannot read parent finance beyond allowed schedule context
- verify delivery logs contain enough context for manual support

### Story D2 - Bot regression and fallback QA

**Goal:** Ensure platform refactoring does not break approved WhatsApp behavior.

**Scope:**

- booking path still completes through the existing approved lesson creation flow
- cancellation path still respects existing timeout and billing behavior
- unsupported messages receive deterministic fallback responses
- duplicate inbound messages do not create duplicate sessions or duplicate side effects

---

## Planned Data Model Additions

Sprint 7 planning expects the following new tables or equivalents:

- `conversation_threads`
- `conversation_sessions`
- `organization_integrations`
- `integration_deliveries`

These are planning targets only until explicitly migrated.

---

## Non-Negotiable Tests

- incoming WhatsApp message is resolved to exactly one actor context or a safe fallback path
- existing booking flow still ends in one lesson row only
- existing cancellation flow still produces the approved business result
- viewing upcoming lessons returns only actor-allowed records
- viewing open charges returns only organization-scoped finance data
- duplicate webhook or bot delivery does not create duplicate side effects
- outbound integration event includes `organization_id` and stable event key
- disabled integration cannot dispatch events

---

## Definition of Done

- tenant configuration shape is documented and implemented at the platform level
- bot orchestration is centralized around explicit flow routing
- conversation state exists for named WhatsApp flows
- existing booking and cancellation flows are preserved through the new router
- first read-only bot flows are available for pilot use
- outbound integration delivery exists for `Make`-style webhook automation
- tenant isolation and regression QA pass on staging
- Sprint 8 inputs are unblocked: calendar sync and homework can build on the new foundation
