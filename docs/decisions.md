# LESSIO — Architectural Decisions (v2)

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
- Flow closes only on timeout or successful cancellation

State machine:

| State | Parent Input | Response | Next State |
|---|---|---|---|
| idle | cancel keyword | Numbered lesson list | awaiting_selection |
| awaiting_selection | Valid number (1–N) | Cancellation confirmed + charge calc | done |
| awaiting_selection | Invalid number | Error + return to list | awaiting_selection |
| awaiting_selection | Lesson no longer exists | Error + return to list | awaiting_selection |
| awaiting_selection | Timeout (10 min) | Flow closed | idle |
| awaiting_selection | No upcoming lessons | Message: no lessons to cancel | idle |

---

## Schema Changes Summary by Sprint

| Sprint | Table | Change | Status |
|---|---|---|---|
| 1 ✅ | organizations | + timezone, + break_duration_minutes, + min_booking_notice_hours | Done |
| 1 ✅ | teachers | profile_id → not null | Done |
| 1 ✅ | slot_locks | + status enum (active/consumed/expired) | Done |
| 1 ✅ | leads | new table | Done |
| 3 | teachers | + hourly_rate numeric(10,2) — MIGRATION REQUIRED | Pending |