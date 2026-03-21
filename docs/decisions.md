# LESSIO — Architectural Decisions (v1 — FINAL)

All decisions in this document are closed and final.
They must not be re-decided, improvised, or deviated from without an explicit update to this document.

---

## 1. Lesson duration — source of truth

**DECIDED:** Lesson duration is selected by the parent during booking inside the WebView.

Implications:

* The WebView includes a lesson duration selection step before slot selection
* `slot_locks` and `lessons` store `start_at` + `end_at` (not `duration` separately)
* `getAvailableSlots()` receives `durationMinutes` as a required parameter

---

## 2. Slot granularity

**DECIDED:** Slots are calculated according to the selected lesson duration plus the organization-defined break time.

Formula: `next_slot_start = current_slot_start + lesson_duration + break_duration`

Field added to `organizations`:
`break_duration_minutes int not null default 0`

Example: 60-minute lesson, 15-minute break, window 16:00–20:00 → slots: 16:00, 17:15, 18:30

---

## 3. `slot_lock` — status after booking

**DECIDED:** `status` enum: `'active' | 'consumed' | 'expired'`

Rules:

* Created with `status = 'active'`
* After successful booking confirmation: `status = 'consumed'`
* After `expires_at` passes without confirmation: considered expired in query logic (not via background job)
* Availability queries filter by `status = 'active' AND expires_at > now()` only

---

## 4. Unidentified parent in WhatsApp

**DECIDED:** Three things happen in parallel:

1. A lead record is created in the DB with the phone number
2. An admin alert is sent to the dashboard (new lead)
3. A fixed message is sent to the parent: `"Your number is not recognized in the system. Please contact the business owner."`

`leads` table (new):

```sql
id              uuid pk
organization_id uuid not null references organizations(id)
phone           text not null  -- E.164
source          text not null default 'whatsapp'
status          text not null default 'new'
                  check (status in ('new','contacted','converted','irrelevant'))
created_at      timestamptz default now()

unique: (organization_id, phone)
index:  (organization_id, status)
```

---

## 5. Teacher selection in the WebView

**DECIDED:** The parent always selects a teacher inside the WebView. There is no automatic skip.

Implications:

* The first step in the booking flow is the list of available teachers in the organization
* The JWT contains: `organizationId`, `parentId`, `studentId` only — `teacherId` is never part of the JWT
* WebView flow order: `Teacher → Date → Duration → Slots → Confirm`
* Duration is selected before `getAvailableSlots` runs, after the date is selected

---

## 6. Same-day booking

**DECIDED:** Controlled by the organization setting `min_booking_notice_hours`

Field added to `organizations`:
`min_booking_notice_hours int not null default 0`

Rule: Slots that begin less than `min_booking_notice_hours` hours from now are not shown.
Default `0` = same-day booking allowed.

---

## 7. `teacher.profile_id`

**DECIDED:** Always `not null`. Every teacher must be a dashboard user.

---

## 8. Phone normalization

**DECIDED:** E.164 only — `+972XXXXXXXXX`

Normalization rules:

* `05XXXXXXXX` → `+9725XXXXXXXX`
* `9725XXXXXXXX` → `+9725XXXXXXXX`
* `+9725XXXXXXXX` → unchanged
* A number that cannot be normalized → rejected with an error, not stored

Rule: Normalization must happen before every DB save and every lookup.
One central utility function (`normalizePhone`), not inline in multiple places.

---

## 9. Organization timezone

**DECIDED:** `timezone text not null default 'Asia/Jerusalem'` in `organizations`.

All datetimes are stored in the DB as UTC. All display and availability calculations use the organization timezone.

---

## 10. Billing parent

**DECIDED:** Billing is assigned to the parent with `is_primary = true` from `relationships` at lesson creation time.

Rule: If the student has no primary parent, this is a blocker error. The lesson is not created.

---

## Summary of schema changes resulting from these decisions

| Table         | Change                                                                     |
| ------------- | -------------------------------------------------------------------------- |
| organizations | + `timezone`, + `break_duration_minutes`, + `min_booking_notice_hours`     |
| teachers      | `profile_id` → `not null` (remove nullable)                                |
| slot_locks    | + `status` text check (`'active','consumed','expired'`) default `'active'` |
| leads         | New table                                                                  |
