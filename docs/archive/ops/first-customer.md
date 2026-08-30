# LESSIO — First Customer Onboarding & Launch Readiness (Sprint 6)

**Tickets:** DEV-88, DEV-89
**Sprint:** 6 — Production Readiness

This document covers everything required to onboard the first pilot customer safely.
Complete these steps in order before handing off to the customer.

---

## Prerequisites

Before starting onboarding, verify the following:

- [ ] All Sprint 6 release checklist phases 1–5 are complete (`/docs/release-checklist.md`)
- [ ] Production Supabase project is separate from dev and staging
- [ ] Production Vercel deployment is live and healthy
- [ ] Meta WhatsApp Business account is approved and the phone number is active
- [ ] All E2E scenarios passed on staging (`/docs/qa-e2e-staging.md`)
- [ ] Data Recovery Playbook is available to the operator (`/docs/data-recovery-playbook.md`)
- [ ] Owner has read the Known Limits section of this document

---

## Phase 1 — Org Setup

### 1.1 Create the organization

Run in the Supabase production SQL editor (or use the seed script as a template):

```sql
-- Insert the org
INSERT INTO organizations (id, name, slug, timezone)
VALUES (gen_random_uuid(), '<Customer Name>', '<slug>', 'Asia/Jerusalem');

-- Note the org ID for the steps below
```

### 1.2 Create the owner account

1. In Supabase Auth → Users, invite the owner email address
2. After the owner accepts the invitation and sets a password, run:

```sql
-- Set the owner's app_role to 'owner' on their profile
UPDATE profiles
SET app_role = 'owner', organization_id = '<org_id>'
WHERE id = '<auth_user_id>';
```

3. Confirm the owner can log in at the production URL and sees the dashboard

### 1.3 Configure WhatsApp

Set the following in the Vercel production environment (or confirm they are already set — do not reuse staging values):

| Variable | Value |
|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | Production phone number ID from Meta Business Manager |
| `WHATSAPP_ACCESS_TOKEN` | Production token (system user or business app token) |
| `WHATSAPP_APP_SECRET` | Production Meta app secret |
| `WHATSAPP_VERIFY_TOKEN` | Matches the registered Meta webhook verify token |

Redeploy the Vercel production deployment after updating env vars.

**Verify:** Send a test WhatsApp message from a known number to the org's business number and confirm it appears in the Vercel logs.

### 1.4 Set booking JWT secret

Confirm `BOOKING_JWT_SECRET` is set in the production Vercel environment with a strong random value (≥ 32 characters). This must not be reused from staging.

---

## Phase 2 — Seed Customer Data

### 2.1 Add teachers

1. Log in as owner
2. Navigate to Settings → Teachers
3. Invite each teacher by email
4. Set `hourly_rate` for each teacher

### 2.2 Add parents and students

1. Navigate to People → Students / Parents
2. Add each student and parent manually, or confirm the customer will use the WhatsApp lead capture flow (parents send a WhatsApp message and appear as leads, then get converted)
3. Ensure each student has exactly one `is_primary = true` parent relationship

### 2.3 Configure cancellation policy

1. Navigate to Settings → Cancellation Policy
2. Set the policy that the customer uses (hours notice, charge percentage)
3. Confirm the owner has reviewed and approved the policy before it goes live

### 2.4 Set teacher availability

1. For each teacher, navigate to their profile → Availability
2. Set weekly availability windows
3. Add any overrides for upcoming dates as needed

---

## Phase 3 — Pre-Launch Staging Validation (DEV-89)

Before going live with the first real customer, run through this validation using a test org on staging.
The purpose is to catch any org-specific setup gaps before they affect the customer.

### 3.1 Test org setup on staging

- [ ] Create a test org in staging using the same org configuration as the production org (timezone, policy settings, teacher count)
- [ ] Invite a test teacher and set hourly_rate
- [ ] Add a test parent and student with a primary relationship
- [ ] Set teacher availability

### 3.2 Validate booking flow

- [ ] Send a booking intent message from a test WhatsApp number to the staging business number
- [ ] Confirm booking link is received
- [ ] Complete the booking WebView end-to-end — teacher selection, date, duration, slot, confirm
- [ ] Verify lesson row appears in DB with `status = 'scheduled'`
- [ ] Verify WhatsApp confirmation message is received

### 3.3 Validate lesson outcome flow

- [ ] As owner/admin on staging, mark the test lesson as `completed`
- [ ] Verify charge is created with the correct amount (hourly_rate × duration / 60)
- [ ] Mark the charge as paid — verify `paid_at` is set

### 3.4 Document gaps

If any step fails on staging, document it here before proceeding:

| Step | Gap | Status |
|---|---|---|
| | | |

**Staging validation sign-off:** _______________  **Date:** _______________

Do not proceed to production go-live until all gaps are resolved.

---

## Phase 4 — First-Launch Smoke Tests (Production)

Run these after the org is set up in production and before giving the customer their credentials:

| Check | Result |
|---|---|
| Owner logs in at production URL | |
| Owner sees dashboard with correct org name | |
| Teacher invitation email received and teacher can log in | |
| Teacher sees only their own schedule (no other teachers' lessons) | |
| Booking link received via WhatsApp opens WebView correctly | |
| Booking WebView displays the correct teachers and available slots | |
| Test booking created — lesson appears in dashboard | |
| Test lesson marked `completed` — charge created | |
| WhatsApp webhook signature check passes (check Vercel logs — no 401s from legitimate messages) | |

---

## Phase 5 — Owner/Admin Handoff Notes

### What the owner can do

- Add/invite teachers
- Add parents and students
- Set cancellation policy
- View and manage lessons (all statuses)
- View all charges and mark charges as paid
- Send WhatsApp payment requests
- Convert WhatsApp leads to parents + students
- Cancel lessons from the dashboard (with or without a charge)

### What the admin can do

Same as owner except: admin cannot access org settings or cancellation policy configuration.

### What teachers can do

- View their own schedule
- Update lesson outcome (completed / no_show) for their own lessons
- Cannot see billing, other teachers' lessons, or org settings

### How parents interact

Parents interact exclusively via WhatsApp:
- Send a message with booking intent → receive a booking link
- Complete the booking via the WebView
- Send "ביטול" to cancel a lesson

Parents do not have a dashboard login.

---

## Phase 6 — Known Limits for Pilot Phase

These limits are known and accepted for the pilot. They are not bugs — they are scope decisions.

| Limit | Detail |
|---|---|
| No payment processing | Charges are tracked in the system, but no payment gateway integration exists. Payment collection is external (cash, bank transfer, etc.). |
| No automated lesson reminders | Lesson reminder messages are not automated. The owner/admin must send reminders manually if needed. |
| No recurring lesson scheduling | Lessons are booked one at a time via the WhatsApp booking flow. Bulk or recurring scheduling is not supported. |
| WhatsApp only for parent communication | There is no parent portal or email flow. All parent-facing communication is through WhatsApp. |
| Manual migration process | Database migrations must be applied manually by the operator. There is no automated migration runner. |
| Single-org pilot scope | The system supports multiple orgs at the data model level, but onboarding is manual. Self-serve org creation is not available. |
| Booking links expire in 15 minutes | If a parent does not complete their booking within 15 minutes of receiving the link, they must request a new one by sending another WhatsApp message. |
| No audit log UI | System actions are logged to Vercel logs only. There is no in-app audit log viewer. |

---

## Support Escalation

For issues during the pilot:

1. **Check Vercel logs** — search by the relevant `org_id` or `lessonId` in the log output
2. **Check Supabase Studio** — use the data browser to verify the current state of affected rows
3. **Consult the Data Recovery Playbook** (`/docs/data-recovery-playbook.md`) for known failure modes
4. **For WhatsApp delivery failures** — check Meta Business Manager → WhatsApp → Webhook → Recent Deliveries

---

## Go-Live Sign-Off

Before handing credentials to the customer:

- [ ] All Phase 1–4 steps completed
- [ ] Staging validation (Phase 3) passed with no open gaps
- [ ] Owner has read the Known Limits section
- [ ] Data Recovery Playbook reviewed
- [ ] Release checklist complete (`/docs/release-checklist.md`)
- [ ] Backup verified on production Supabase project (`/docs/data-recovery-playbook.md`)

**Go-live approved by:** _______________  **Date:** _______________
