# LESSIO — Data Recovery Playbook (Sprint 6)

**Ticket:** DEV-110
**Sprint:** 6 — Production Readiness

This playbook documents manual recovery steps for known failure modes.
It must exist before go-live sign-off (Decision #24).

Use this when a production issue requires a direct database fix.
All SQL in this document must be run against the **correct environment** (staging or prod).
Always take a Supabase backup before making manual changes.

---

## General Rules

1. **Back up first** — use Supabase dashboard → Backups before any manual write
2. **Verify before writing** — run the diagnostic `SELECT` before the corrective `INSERT` or `UPDATE`
3. **Log the action** — record what you did, when, and why in your incident notes
4. **Check downstream effects** — most fixes have downstream consequences (e.g. updating a lesson to `completed` may trigger a charge if the application code re-runs)

---

## Scenario 1 — Charge Not Created

**Symptom:** Lesson is `completed` but no charge row exists in `charges`.

**Likely cause:** Charge write failed silently (missing `hourly_rate`, missing primary parent, or DB error). Check application logs for `[createLessonCharge]` errors with the `lessonId` and `orgId`.

### Diagnostic

```sql
-- Confirm lesson is completed
SELECT id, teacher_id, student_id, start_at, end_at, status
FROM lessons
WHERE id = '<lesson_id>'
  AND organization_id = '<org_id>';

-- Check if a charge already exists (may be a duplicate scenario instead)
SELECT * FROM charges
WHERE lesson_id = '<lesson_id>'
  AND charge_type = 'lesson';

-- Check teacher has hourly_rate set
SELECT t.id, t.hourly_rate
FROM teachers t
JOIN lessons l ON l.teacher_id = t.id
WHERE l.id = '<lesson_id>';

-- Check student has a primary parent
SELECT r.parent_id, r.is_primary
FROM relationships r
JOIN lessons l ON l.student_id = r.student_id
WHERE l.id = '<lesson_id>'
  AND r.organization_id = '<org_id>';
```

### Fix

Once you have confirmed the `hourly_rate`, `parent_id`, `start_at`, and `end_at`:

```sql
-- Calculate amount manually: hourly_rate * (duration_minutes / 60), rounded to 2 decimal places
-- Example: 120 NIS/hr, 60 min lesson = 120.00

INSERT INTO charges (
  id,
  organization_id,
  parent_id,
  lesson_id,
  amount,
  charge_type,
  status,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  '<org_id>',
  '<parent_id>',
  '<lesson_id>',
  <calculated_amount>,
  'lesson',
  'pending',
  now(),
  now()
);
```

**Post-fix check:** Verify the charge appears in the charges list for the correct parent.

---

## Scenario 2 — Duplicate Charge

**Symptom:** Two `lesson` charges exist for the same `lesson_id`.

**Likely cause:** The unique partial index (`charges(lesson_id) WHERE charge_type = 'lesson'`) was bypassed (e.g. a manual insert, or a data migration). Should not occur through normal application paths.

### Diagnostic

```sql
SELECT id, created_at, amount, status, parent_id
FROM charges
WHERE lesson_id = '<lesson_id>'
  AND charge_type = 'lesson'
ORDER BY created_at;
```

### Fix

Remove the **newer** duplicate (lower `created_at` value = older = keep):

```sql
-- Verify which to delete before running
DELETE FROM charges
WHERE id = '<newer_duplicate_charge_id>';
```

**Post-fix check:** Confirm only one charge row remains for this `lesson_id`.

---

## Scenario 3 — Lesson Stuck at `scheduled`

**Symptom:** A lesson's date and time have passed but its status is still `scheduled`. Charge was not created.

**Likely cause:** The owner/admin never updated the status, or the teacher's outcome update failed silently.

### Diagnostic

```sql
SELECT id, teacher_id, student_id, start_at, end_at, status, updated_at
FROM lessons
WHERE id = '<lesson_id>'
  AND organization_id = '<org_id>';

-- Check if a charge was created anyway
SELECT * FROM charges WHERE lesson_id = '<lesson_id>';
```

### Fix

Decide the correct outcome (`completed` or `no_show`), then update:

```sql
UPDATE lessons
SET status = 'completed',   -- or 'no_show'
    updated_at = now()
WHERE id = '<lesson_id>'
  AND organization_id = '<org_id>';
```

**Important:** Updating to `completed` via SQL does **not** automatically trigger the charge creation flow — the application code handles that. After this manual update, you must also create the charge manually if needed (see Scenario 1).

---

## Scenario 4 — Slot Lock Expired But Lesson Was Created

**Symptom:** A lesson exists in the DB, but its corresponding `slot_locks` row has `status = 'expired'`.

**Likely cause:** A race condition or clock skew during booking confirmation. The lesson was created but the lock was not marked `consumed` before it expired.

### Diagnostic

```sql
-- Find the lock for this lesson's time slot and teacher
SELECT sl.id, sl.status, sl.expires_at, sl.created_at
FROM slot_locks sl
JOIN lessons l ON l.teacher_id = sl.teacher_id
  AND l.start_at = sl.start_at
  AND l.organization_id = sl.organization_id
WHERE l.id = '<lesson_id>';
```

### Fix

Only fix if the booking was genuinely completed (the lesson row exists and the parent received a confirmation):

```sql
UPDATE slot_locks
SET status = 'consumed'
WHERE id = '<slot_lock_id>'
  AND organization_id = '<org_id>';
```

If no lock row exists at all (the lock expired before the booking write), the lesson is still valid. No action needed for the lock — only verify the lesson row is correct.

---

## Scenario 5 — Student Has No Primary Parent

**Symptom:** Lesson creation fails with "Student has no primary parent" — or a charge cannot be created for a lesson.

**Likely cause:** The `relationships` record for this student either does not exist or has `is_primary = false` for all parents.

### Diagnostic

```sql
SELECT r.id, r.parent_id, r.is_primary, p.full_name, p.phone
FROM relationships r
JOIN parents p ON p.id = r.parent_id
WHERE r.student_id = '<student_id>'
  AND r.organization_id = '<org_id>';
```

### Fix

If no primary parent exists, set the correct one:

```sql
-- First, ensure no other parent is already primary (only one can be)
UPDATE relationships
SET is_primary = false
WHERE student_id = '<student_id>'
  AND organization_id = '<org_id>';

-- Then set the correct parent as primary
UPDATE relationships
SET is_primary = true
WHERE id = '<relationship_id>';
```

**Post-fix check:** Re-attempt the lesson creation or charge creation from the dashboard.

---

## Scenario 6 — WhatsApp Message Not Received

**Symptom:** Parent sent a WhatsApp message but nothing appears in the database (no lead, no booking intent processed).

### Diagnostic steps

1. **Check application logs** — search Vercel logs for `[whatsapp/webhook]` entries around the time of the message
2. **Check Meta webhook delivery logs** — Meta Developer Console → WhatsApp → Webhook → Recent Deliveries. Look for delivery failures or non-200 responses
3. **Confirm webhook signature** — if the signature was invalid, the request returns `401` and nothing is processed. Check if `WHATSAPP_APP_SECRET` is correctly set
4. **Check the Supabase `leads` table** — if the sender is unrecognized, a lead should have been created

```sql
-- Check for a lead with this phone
SELECT * FROM leads
WHERE phone = '<normalized_e164_phone>'
  AND organization_id = '<org_id>';
```

### Recovery

- If the message was genuinely lost (not in Meta delivery logs): ask the parent to resend
- If Meta shows a delivery failure (non-200 from our webhook): investigate the error in Vercel logs, fix the underlying issue, then use Meta's "Resend" option in webhook delivery logs if available
- If the issue was a misconfigured `WHATSAPP_APP_SECRET`: fix the env var, redeploy, and ask the parent to resend
- Do not manually replay raw webhook payloads unless the original was confirmed safe and idempotent

---

## Scenario 7 — Cancellation Charge Not Created After WhatsApp Cancellation

**Symptom:** Lesson is `cancelled` after a WhatsApp cancellation flow, but no cancellation charge was created despite the policy requiring one.

**Likely cause:** `createCancellationCharge` returned an error (missing parent, missing rate, or DB insert error). Check logs for `[executeCancellation]` or `[createCancellationCharge]` with the `lessonId`.

### Diagnostic

```sql
-- Confirm lesson is cancelled
SELECT id, status, cancel_reason, student_id, teacher_id, start_at
FROM lessons
WHERE id = '<lesson_id>'
  AND organization_id = '<org_id>';

-- Check if any cancellation charge exists
SELECT * FROM charges
WHERE lesson_id = '<lesson_id>'
  AND charge_type = 'cancellation';

-- Verify teacher hourly_rate and primary parent (same queries as Scenario 1)
```

### Fix

If the charge is missing and the policy requires one, create it manually (same pattern as Scenario 1 but with `charge_type = 'cancellation'` and the calculated partial/full amount based on the cancellation policy).

---

## Playbook Maintenance

This playbook covers scenarios identified as of Sprint 6.
Add new scenarios here when new failure modes are discovered in staging or production.
Each scenario should include: symptom, diagnostic SQL, fix SQL, and post-fix verification.
