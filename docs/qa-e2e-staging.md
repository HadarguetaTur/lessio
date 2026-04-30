# LESSIO — E2E Scenario QA on Staging (Sprint 6)

**Tickets:** DEV-109, DEV-110
**Sprint:** 6 — Production Readiness

All 6 scenarios must be executed on the **staging** environment, not locally.
Local verification is insufficient for release approval (Decision #24).

---

## Preconditions

Before running any scenario:

- [ ] Staging Vercel deployment is live and healthy
- [ ] All migrations applied to staging Supabase project
- [ ] App starts without env validation errors
- [ ] Seed data loaded: one org with owner, one admin, one teacher, one parent, one student, one relationship (`is_primary = true`)
- [ ] Parent phone is registered in Meta's test phone number list (or using a real WhatsApp number linked to the staging Meta app)
- [ ] Staging Meta webhook is pointed at the staging URL

---

## Results Summary

| # | Scenario | Result | Tester | Date | Notes |
|---|---|---|---|---|---|
| 1 | Booking E2E | | | | |
| 2 | Lesson update | | | | |
| 3 | Dashboard cancellation | | | | |
| 4 | Charges: mark paid | | | | |
| 5 | WhatsApp cancellation | | | | |
| 6 | Payment request | | | | |
| 7 | WhatsApp Embedded Signup (Sprint 7) | | | | requires HTTPS staging URL |

---

## Scenario 1 — Booking E2E

**Goal:** WhatsApp message → booking link → WebView → lesson created

### Steps

1. Send a message with booking intent (e.g. "שיעור") from the parent's WhatsApp number to the org's business number
2. Confirm the booking link reply is received within ~5 seconds
3. Open the link in a browser (valid for 15 minutes)
4. Select a teacher in the WebView
5. Select a date and duration
6. Select an available time slot — confirm it is locked (slot_lock row created in DB)
7. Confirm the booking — verify the success screen appears
8. In the Supabase dashboard, confirm:
   - A `lessons` row exists with `status = 'scheduled'`
   - The `slot_locks` row for this booking has `status = 'consumed'`
9. Confirm a WhatsApp confirmation message is received by the parent

### Pass criteria

- [ ] Booking link received after WhatsApp message
- [ ] WebView loads correctly
- [ ] Slot lock created on slot selection
- [ ] Lesson created after confirmation
- [ ] Slot lock consumed after confirmation
- [ ] WhatsApp confirmation sent to parent
- [ ] No errors in Vercel function logs

**Result:** ___  **Notes:** ___

---

## Scenario 2 — Lesson Status Update (Dashboard)

**Goal:** Owner/admin updates lesson status → charge created on completion

### Steps

1. Log in as owner or admin on staging
2. Navigate to an existing `scheduled` lesson
3. Change status to `completed`
4. Verify the status updates in the UI
5. In the Supabase dashboard, confirm a `charges` row exists with:
   - `lesson_id` pointing to this lesson
   - `charge_type = 'lesson'`
   - `status = 'pending'`
6. Repeat the `completed` action on the same lesson — confirm no duplicate charge is created (idempotency)

### Pass criteria

- [ ] Status update succeeds
- [ ] Charge created on `completed`
- [ ] Second `completed` action does not create a duplicate charge
- [ ] No errors in logs

**Result:** ___  **Notes:** ___

---

## Scenario 3 — Dashboard Cancellation

**Goal:** Owner/admin cancels a lesson → cancellation charge calculated and created

### Steps

1. Log in as owner or admin on staging
2. Navigate to a `scheduled` lesson that is within the cancellation policy window (e.g. within 24 hours)
3. Cancel the lesson with a reason — do not waive the charge
4. Verify lesson status is `cancelled` in the UI
5. In the Supabase dashboard, confirm a `charges` row with `charge_type = 'cancellation'`
6. Repeat with a lesson outside the policy window — confirm no charge is created

### Pass criteria

- [ ] Lesson cancelled successfully
- [ ] Cancellation charge created when within policy window
- [ ] No charge created when outside policy window (or waived)
- [ ] Teacher can see the cancelled lesson as cancelled in their schedule

**Result:** ___  **Notes:** ___

---

## Scenario 4 — Charges: Mark Paid

**Goal:** Charge created → marked paid → status updated

### Steps

1. Ensure at least one `pending` charge exists (from Scenario 2 or 3)
2. Log in as owner on staging
3. Navigate to the charges list
4. Find the pending charge and mark it as paid (with an optional note)
5. Confirm charge status changes to `paid` in the UI and in Supabase
6. Confirm `paid_at` timestamp is set

### Pass criteria

- [ ] Charge marked as paid
- [ ] `status = 'paid'` and `paid_at` set in DB
- [ ] Charge no longer appears in "pending" filter

**Result:** ___  **Notes:** ___

---

## Scenario 5 — WhatsApp Cancellation (Parent-initiated)

**Goal:** Parent sends cancellation intent → lesson list sent → parent selects → cancellation executed

### Steps

1. Ensure the parent has at least one `scheduled` lesson within the next 7 days
2. Send "ביטול" from the parent's WhatsApp number
3. Confirm the numbered lesson list is received
4. Reply with "1" (or the appropriate number)
5. Confirm the cancellation confirmation message is received
6. In Supabase, confirm:
   - Lesson `status = 'cancelled'`
   - Cancellation charge created if applicable (within policy window)
   - `cancellation_sessions` row is deleted

### Pass criteria

- [ ] Lesson list received after "ביטול"
- [ ] Cancellation confirmed after selection
- [ ] Lesson status `cancelled` in DB
- [ ] Charge created if within policy window
- [ ] Session cleaned up after completion

**Result:** ___  **Notes:** ___

---

## Scenario 6 — Payment Request via WhatsApp

**Goal:** Owner/admin sends payment request → WhatsApp message sent → metadata logged

### Steps

1. Ensure at least one `pending` charge exists for a parent with a phone number
2. Log in as owner or admin
3. Navigate to the parent's detail page
4. Send a payment request via WhatsApp
5. Confirm the WhatsApp message is received by the parent with the correct charge breakdown
6. In Supabase, confirm that all included charge rows have:
   - `sent_at` populated
   - `sent_by_profile_id` set to the acting user's profile ID

### Pass criteria

- [ ] Payment request message received on WhatsApp
- [ ] Message contains correct amounts and student names
- [ ] `sent_at` and `sent_by_profile_id` set on all included charges

**Result:** ___  **Notes:** ___

---

## Cross-Cutting QA Checks

These checks apply across multiple flows and must be verified once on staging.

### Timezone

- [ ] Lessons created with UTC timestamps display correctly in `Asia/Jerusalem` timezone in the dashboard
- [ ] Booking slots show the correct local times for the org's timezone
- [ ] Cancellation session timeout (10 min) is calculated correctly

### Hebrew / RTL

- [ ] All dashboard pages render correctly in RTL layout
- [ ] Form inputs and labels are RTL-aligned
- [ ] WhatsApp messages contain correct Hebrew text (spot-check booking confirmation and cancellation confirmation)

### Mobile

- [ ] Booking WebView is usable on a mobile browser (320px minimum width)
- [ ] Dashboard is at minimum navigable on a tablet-width screen

### Archived records

- [ ] Inactive teacher (`is_active = false`) does not appear in the booking WebView teacher list
- [ ] Inactive student does not appear in student selection dropdowns
- [ ] Archived parent's lessons still appear in the lesson history (archived ≠ deleted)

### Duplicate submission

- [ ] Submitting the booking confirmation form twice does not create two lessons
- [ ] Marking a lesson as `completed` twice does not create two charges (idempotency index)
- [ ] Submitting a parent form twice does not create two parent records

### Wrong-org / forbidden access

- [ ] Accessing a lesson ID from another org returns 403, not 404
- [ ] Teacher cannot access another teacher's lesson outcome form
- [ ] Admin cannot access org settings (owner-only)

---

---

## Scenario 7 — WhatsApp Embedded Signup (Sprint 7)

**Goal:** Owner connects org WhatsApp number via Meta Embedded Signup on staging (requires HTTPS)

**Preconditions:**
- Staging app deployed to Vercel (HTTPS URL)
- `META_APP_ID`, `META_APP_SECRET`, `WHATSAPP_TOKEN_ENCRYPTION_KEY` set in Vercel staging env
- Meta app in Development mode; tester is admin/developer of the Meta app

### Steps

1. Log in as owner on staging → navigate to `/settings/whatsapp`
2. Confirm "לא מחובר" state with green Embedded Signup button visible
3. Click "חבר מספר WhatsApp" → Meta popup opens
4. Complete the Embedded Signup flow (select test WABA + phone number)
5. Confirm popup closes and page refreshes to "מחובר" state with `phone_number_id` displayed
6. In Supabase staging: confirm `organizations.whatsapp_phone_number_id` is set and `whatsapp_access_token` is a non-empty encrypted string (format: `base64:base64:base64`)
7. Click "נתק" → confirm page returns to "לא מחובר"
8. In Supabase staging: confirm both columns are NULL

### Pass criteria

- [ ] Embedded Signup popup opens without errors
- [ ] `phone_number_id` saved to DB after completion
- [ ] `whatsapp_access_token` stored encrypted (never plaintext)
- [ ] Disconnect clears both fields
- [ ] Webhook routes correctly to org after reconnecting (send test WhatsApp message)

---

## Staging QA Sign-Off

- [ ] All 7 E2E scenarios passed
- [ ] All cross-cutting checks completed
- [ ] No open blockers
- [ ] Results documented in this file (or linked issue)

**QA completed by:** _______________  **Date:** _______________
